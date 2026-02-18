//! 同步管理器
//!
//! 集成 HTTP 同步和 WebSocket 设备连接，管理与服务器的数据同步

use anyhow::{Context, Result};
use chrono::Utc;
use parking_lot::RwLock;
use std::sync::Arc;
use std::time::Duration;
use tokio::time;

use crate::http_client::ProxyConfig;
use crate::kiro::model::credentials::KiroCredentials;
use crate::model::config::{Config, SyncConfig, TlsBackend};
use crate::sync::{AuthClient, DeviceClient, DeviceInfo, SyncClient};
use crate::sync::types::{PushChangesRequest, TokenSync};

/// 同步管理器
pub struct SyncManager {
    /// HTTP 同步客户端
    http_client: Arc<RwLock<Option<SyncClient>>>,
    /// WebSocket 设备客户端
    ws_client: Arc<RwLock<Option<DeviceClient>>>,
    /// 同步配置
    config: Arc<RwLock<Option<SyncConfig>>>,
    /// 上次同步版本号
    last_sync_version: Arc<RwLock<u64>>,
    /// 设备信息
    device_info: Arc<RwLock<Option<DeviceInfo>>>,
    /// 配置文件路径（用于保存 token）
    config_path: Arc<RwLock<Option<std::path::PathBuf>>>,
    /// 本地凭据数据（用于上报）
    credentials: Arc<RwLock<Vec<KiroCredentials>>>,
    /// 代理配置
    proxy_config: Arc<RwLock<Option<ProxyConfig>>>,
    /// TLS 后端
    tls_backend: TlsBackend,
}

impl SyncManager {
    /// 创建新的同步管理器
    pub fn new(config: &Config) -> Self {
        let sync_config = config.sync_config.clone();

        // 构建代理配置
        let proxy_config = config.proxy_url.as_ref().map(|url| {
            let mut proxy = ProxyConfig::new(url);
            if let (Some(username), Some(password)) = (&config.proxy_username, &config.proxy_password) {
                proxy = proxy.with_auth(username, password);
            }
            proxy
        });

        // 如果配置了同步，创建 HTTP 客户端
        let http_client = if let Some(ref cfg) = sync_config {
            match SyncClient::new(
                cfg.server_url.clone(),
                cfg.auth_token.clone(),
                proxy_config.as_ref(),
                config.tls_backend,
            ) {
                Ok(client) => Some(client),
                Err(e) => {
                    tracing::warn!("创建同步客户端失败: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // 如果配置了同步，创建 WebSocket 客户端
        let ws_client = if let Some(ref cfg) = sync_config {
            Some(DeviceClient::new(
                cfg.server_url.clone(),
                Duration::from_secs(cfg.heartbeat_interval),
            ))
        } else {
            None
        };

        Self {
            http_client: Arc::new(RwLock::new(http_client)),
            ws_client: Arc::new(RwLock::new(ws_client)),
            config: Arc::new(RwLock::new(sync_config)),
            last_sync_version: Arc::new(RwLock::new(0)),
            device_info: Arc::new(RwLock::new(None)),
            config_path: Arc::new(RwLock::new(config.config_path().map(|p| p.to_path_buf()))),
            credentials: Arc::new(RwLock::new(Vec::new())),
            proxy_config: Arc::new(RwLock::new(proxy_config)),
            tls_backend: config.tls_backend,
        }
    }

    /// 更新同步配置
    #[allow(dead_code)]
    pub fn update_config(&self, config: SyncConfig) -> Result<()> {
        // 更新 HTTP 客户端
        let proxy = self.proxy_config.read().clone();
        let http_client = SyncClient::new(
            config.server_url.clone(),
            config.auth_token.clone(),
            proxy.as_ref(),
            self.tls_backend,
        )?;
        *self.http_client.write() = Some(http_client);

        // 更新 WebSocket 客户端
        let ws_client = DeviceClient::new(
            config.server_url.clone(),
            Duration::from_secs(config.heartbeat_interval),
        );
        *self.ws_client.write() = Some(ws_client);

        *self.config.write() = Some(config);
        Ok(())
    }

    /// 检查是否启用同步
    pub fn is_enabled(&self) -> bool {
        self.config
            .read()
            .as_ref()
            .map(|c| c.enabled)
            .unwrap_or(false)
    }

    /// 自动认证并获取 token
    async fn ensure_authenticated(&self) -> Result<String> {
        // 先检查是否已有 token
        {
            let config = self.config.read();
            if let Some(cfg) = config.as_ref() {
                if let Some(token) = &cfg.auth_token {
                    if !token.is_empty() {
                        return Ok(token.clone());
                    }
                }
            }
        }

        // 获取或生成认证所需信息（在 await 之前释放锁）
        let (server_url, email, password) = {
            let mut config = self.config.write();
            let cfg = config.as_mut().context("同步配置未设置")?;

            // 如果没有配置 email，生成随机 email
            let email = match &cfg.email {
                Some(e) if !e.is_empty() => e.clone(),
                _ => {
                    // 生成随机 email: kiro-{uuid}@auto.local
                    let random_id = uuid::Uuid::new_v4().to_string();
                    let generated_email = format!("kiro-{}@auto.local", &random_id[..8]);
                    tracing::info!("自动生成同步账号: {}", generated_email);
                    cfg.email = Some(generated_email.clone());
                    generated_email
                }
            };

            // 如果没有配置 password，生成随机密码
            let password = match &cfg.password {
                Some(p) if !p.is_empty() => p.clone(),
                _ => {
                    // 生成随机密码: 16 位字母数字
                    let random_password: String = (0..16)
                        .map(|_| {
                            let chars = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                            chars[fastrand::usize(..chars.len())] as char
                        })
                        .collect();
                    cfg.password = Some(random_password.clone());
                    random_password
                }
            };

            (cfg.server_url.clone(), email, password)
        };

        tracing::info!("开始自动认证到同步服务器...");

        // 创建认证客户端并认证（不持有锁）
        let proxy = self.proxy_config.read().clone();
        let auth_client = AuthClient::new(server_url.clone(), proxy.as_ref(), self.tls_backend)?;
        let token = auth_client.auto_authenticate(email, password).await?;

        // 保存 token 到配置
        let sync_config_for_save = {
            let mut config = self.config.write();
            if let Some(cfg) = config.as_mut() {
                cfg.auth_token = Some(token.clone());
                cfg.clone()
            } else {
                anyhow::bail!("同步配置未设置");
            }
        };

        // 持久化到配置文件（不持有锁）
        if let Err(e) = self.save_config_to_file(&sync_config_for_save).await {
            tracing::warn!("保存 token 到配置文件失败: {}", e);
        }

        // 更新 HTTP 客户端的 token
        let proxy = self.proxy_config.read().clone();
        if let Ok(client) = SyncClient::new(
            server_url,
            Some(token.clone()),
            proxy.as_ref(),
            self.tls_backend,
        ) {
            *self.http_client.write() = Some(client);
        }

        Ok(token)
    }

    /// 保存配置到文件
    async fn save_config_to_file(&self, sync_config: &SyncConfig) -> Result<()> {
        let config_path = self
            .config_path
            .read()
            .clone()
            .context("配置文件路径未设置")?;

        // 读取完整配置
        let config_content = tokio::fs::read_to_string(&config_path)
            .await
            .context("读取配置文件失败")?;

        let mut config: serde_json::Value =
            serde_json::from_str(&config_content).context("解析配置文件失败")?;

        // 更新 syncConfig 部分
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "syncConfig".to_string(),
                serde_json::to_value(sync_config).context("序列化同步配置失败")?,
            );
        }

        // 写回文件
        let updated_content =
            serde_json::to_string_pretty(&config).context("序列化配置失败")?;
        tokio::fs::write(&config_path, updated_content)
            .await
            .context("写入配置文件失败")?;

        tracing::info!("已保存 token 到配置文件");
        Ok(())
    }

    /// 启动同步服务
    pub async fn start(
        self: Arc<Self>,
        device_name: String,
        token_manager: Arc<crate::kiro::token_manager::MultiTokenManager>,
    ) -> Result<()> {
        if !self.is_enabled() {
            tracing::info!("同步功能未启用");
            return Ok(());
        }

        // 确保已认证
        let token = self.ensure_authenticated().await?;

        let config = self.config.read().clone().context("同步配置未设置")?;

        // 生成设备 ID（基于主机名和时间戳）
        let hostname = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "unknown".to_string());

        let device_id = format!("{}-{}", hostname, Utc::now().timestamp());

        tracing::info!(
            "准备注册设备 - device_id: {}, device_name: {}, device_type: {}",
            device_id,
            device_name,
            config.device_type.as_str()
        );

        // 使用配置的设备类型
        let device_type = config.device_type.as_str().to_string();
        let account_type = config.account_type.as_str();

        let device_info = DeviceInfo {
            token: token.clone(),
            device_id: device_id.clone(),
            device_name: device_name.clone(),
            device_type: device_type.clone(),
            account_type: Some(account_type.to_string()),
        };

        *self.device_info.write() = Some(device_info.clone());

        tracing::info!("账号类型: {}, 设备类型: {}", account_type, device_type);

        // 连接 WebSocket
        let ws_client = self.ws_client.read().as_ref().cloned();
        if let Some(client) = ws_client {
            match client.connect_and_register(device_info, token_manager.clone(), self.clone()).await {
                Ok(_) => tracing::info!("WebSocket 设备连接成功"),
                Err(e) => tracing::debug!("WebSocket 连接失败（服务器可能未运行）: {}", e),
            }
        }

        // 启动定期同步任务
        let sync_interval = Duration::from_secs(config.sync_interval);
        let http_client = self.http_client.clone();
        let last_sync_version = self.last_sync_version.clone();
        let credentials = self.credentials.clone();
        let device_info_for_sync = self.device_info.clone();
        let ws_client_for_reconnect = self.ws_client.clone();
        let token_manager_for_reconnect = token_manager.clone();
        let self_for_reconnect = self.clone();

        tokio::spawn(async move {
            let mut interval = time::interval(sync_interval);
            loop {
                interval.tick().await;

                // 检查 WebSocket 连接状态并尝试重连
                let (ws_client_opt, device_info_opt) = {
                    let ws_client = ws_client_for_reconnect.read().as_ref().cloned();
                    let device_info = device_info_for_sync.read().clone();
                    (ws_client, device_info)
                };

                if let (Some(ws_client), Some(device_info)) = (ws_client_opt, device_info_opt) {
                    let state = ws_client.get_state_sync();
                    if matches!(state, crate::sync::websocket::ConnectionState::Error(_))
                        || matches!(state, crate::sync::websocket::ConnectionState::Disconnected) {
                        tracing::info!("检测到 WebSocket 断开，尝试重连...");

                        match ws_client.connect_and_register(
                            device_info,
                            token_manager_for_reconnect.clone(),
                            self_for_reconnect.clone(),
                        ).await {
                            Ok(_) => tracing::info!("WebSocket 重连成功"),
                            Err(e) => tracing::warn!("WebSocket 重连失败: {}", e),
                        }
                    }
                }

                let client = {
                    let guard = http_client.read();
                    if let Some(c) = guard.as_ref() {
                        c.clone()
                    } else {
                        continue;
                    }
                };

                // 1. 拉取服务器变更
                let since_version = *last_sync_version.read();
                match client.get_changes(since_version).await {
                    Ok(changes) => {
                        tracing::info!(
                            "同步成功: 版本 {} -> {}",
                            since_version,
                            changes.current_version
                        );
                        *last_sync_version.write() = changes.current_version;
                        // TODO: 应用变更到本地数据
                    }
                    Err(e) => {
                        tracing::debug!("同步失败（服务器可能未运行）: {}", e);
                    }
                }

                // 2. 推送本地凭据数据
                let creds = credentials.read().clone();
                if !creds.is_empty() {
                    let device_info_opt = device_info_for_sync.read().clone();
                    if let Some(device_info) = device_info_opt {
                        // 转换为 TokenSync 格式
                        let tokens: Vec<TokenSync> = creds
                            .iter()
                            .filter_map(|cred| {
                                let id = cred.id?;
                                Some(TokenSync {
                                    id,
                                    nickname: cred.email.clone(),
                                    access_token: cred.access_token.clone(),
                                    refresh_token: cred.refresh_token.clone(),
                                    status: Some("active".to_string()),
                                    device_id: Some(device_info.device_id.clone()),
                                    device_name: Some(device_info.device_name.clone()),
                                    device_type: Some(device_info.device_type.clone()),
                                    account_type: device_info.account_type.clone(),
                                    last_sync_at: Some(Utc::now().to_rfc3339()),
                                    client_id: cred.client_id.clone(),
                                    client_secret: cred.client_secret.clone(),
                                    region: cred.region.clone(),
                                    auth_method: cred.auth_method.clone(),
                                    expires_at: cred.expires_at.clone(),
                                    sync_version: *last_sync_version.read(),
                                })
                            })
                            .collect();

                        if !tokens.is_empty() {
                            // 调试：打印第一条记录
                            if let Some(first_token) = tokens.first() {
                                tracing::debug!(
                                    "准备上报凭据: id={}, device_id={:?}, device_name={:?}, device_type={:?}",
                                    first_token.id,
                                    first_token.device_id,
                                    first_token.device_name,
                                    first_token.device_type
                                );
                                // 打印序列化后的 JSON
                                if let Ok(json) = serde_json::to_string_pretty(first_token) {
                                    tracing::debug!("序列化后的 JSON: {}", json);
                                }
                            }

                            let push_request = PushChangesRequest {
                                tokens: Some(tokens.clone()),
                                token_usage: None,
                                token_subscriptions: None,
                                token_bonuses: None,
                            };

                            match client.push_changes(push_request).await {
                                Ok(response) => {
                                    tracing::info!(
                                        "凭据数据上报成功: {} 条记录，版本 {}",
                                        tokens.len(),
                                        response.current_version
                                    );
                                    *last_sync_version.write() = response.current_version;

                                    if !response.conflicts.is_empty() {
                                        tracing::warn!("存在冲突的记录: {:?}", response.conflicts);
                                    }
                                }
                                Err(e) => {
                                    tracing::debug!("凭据数据上报失败（服务器可能未运行）: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    /// 手动触发同步
    pub async fn sync_now(&self) -> Result<()> {
        if !self.is_enabled() {
            anyhow::bail!("同步功能未启用");
        }

        let client = self
            .http_client
            .read()
            .as_ref()
            .cloned()
            .context("同步客户端未初始化")?;

        let since_version = *self.last_sync_version.read();
        let changes = client.get_changes(since_version).await?;

        tracing::info!(
            "手动同步成功: 版本 {} -> {}",
            since_version,
            changes.current_version
        );

        *self.last_sync_version.write() = changes.current_version;

        // TODO: 应用变更到本地数据

        Ok(())
    }

    /// 更新本地凭据数据
    pub fn update_credentials(&self, credentials: Vec<KiroCredentials>) {
        *self.credentials.write() = credentials;
    }

    /// 将 KiroCredentials 转换为 TokenSync
    #[allow(dead_code)]
    fn convert_to_token_sync(&self, cred: &KiroCredentials) -> Option<TokenSync> {
        let device_info = self.device_info.read().clone()?;

        Some(TokenSync {
            id: cred.id?,
            nickname: cred.email.clone(),
            access_token: cred.access_token.clone(),
            refresh_token: cred.refresh_token.clone(),
            status: Some("active".to_string()),
            device_id: Some(device_info.device_id),
            device_name: Some(device_info.device_name),
            device_type: Some(device_info.device_type),
            account_type: device_info.account_type,
            last_sync_at: Some(Utc::now().to_rfc3339()),
            client_id: cred.client_id.clone(),
            client_secret: cred.client_secret.clone(),
            region: cred.region.clone(),
            auth_method: cred.auth_method.clone(),
            expires_at: cred.expires_at.clone(),
            sync_version: *self.last_sync_version.read(),
        })
    }

    /// 推送本地变更到服务器
    #[allow(dead_code)]
    pub async fn push_credential_changes(&self, _credentials: &[KiroCredentials]) -> Result<()> {
        if !self.is_enabled() {
            return Ok(());
        }

        let client = self
            .http_client
            .read()
            .as_ref()
            .cloned()
            .context("同步客户端未初始化")?;

        // 获取本地凭据数据
        let credentials = self.credentials.read().clone();

        // 转换为 TokenSync 格式
        let tokens: Vec<TokenSync> = credentials
            .iter()
            .filter_map(|cred| self.convert_to_token_sync(cred))
            .collect();

        if tokens.is_empty() {
            tracing::debug!("没有凭据数据需要上报");
            return Ok(());
        }

        // 构建推送请求
        let push_request = PushChangesRequest {
            tokens: Some(tokens.clone()),
            token_usage: None,
            token_subscriptions: None,
            token_bonuses: None,
        };

        // 推送到服务器
        match client.push_changes(push_request).await {
            Ok(response) => {
                tracing::info!(
                    "凭据数据上报成功: {} 条记录，版本 {}",
                    tokens.len(),
                    response.current_version
                );
                *self.last_sync_version.write() = response.current_version;

                if !response.conflicts.is_empty() {
                    tracing::warn!("存在冲突的记录: {:?}", response.conflicts);
                }
            }
            Err(e) => {
                tracing::debug!("凭据数据上报失败（服务器可能未运行）: {}", e);
            }
        }

        Ok(())
    }

    /// 获取当前同步版本
    #[allow(dead_code)]
    pub fn get_sync_version(&self) -> u64 {
        *self.last_sync_version.read()
    }

    /// 获取设备信息
    pub fn get_device_info(&self) -> Option<DeviceInfo> {
        self.device_info.read().clone()
    }

    /// 测试连接
    pub async fn test_connection(&self) -> Result<()> {
        let client = self
            .http_client
            .read()
            .as_ref()
            .cloned()
            .context("同步客户端未初始化")?;

        client.test_connection().await
    }

    /// 获取在线设备列表（从服务器查询）
    #[allow(dead_code)]
    pub async fn get_online_devices(&self) -> Result<Vec<crate::sync::types::OnlineDeviceInfo>> {
        let config = self.config.read().clone().context("同步未配置")?;
        let server_url = config.server_url;
        let auth_token = config.auth_token.context("未认证")?;

        // 构建 HTTP 客户端
        let proxy = self.proxy_config.read().clone();
        let client = crate::http_client::build_client(proxy.as_ref(), 30, self.tls_backend)
            .context("创建 HTTP 客户端失败")?;

        // 调用服务器 API
        let url = format!("{}/api/devices", server_url);
        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!("获取设备列表失败: {}", response.status());
        }

        let result: crate::sync::types::DevicesResponse = response.json().await?;
        Ok(result.devices)
    }

    /// 检查设备是否在线
    #[allow(dead_code)]
    pub async fn is_device_online(&self, device_id: &str) -> Result<bool> {
        let devices = self.get_online_devices().await?;
        Ok(devices.iter().any(|d| d.device_id == device_id))
    }

    /// 推送凭证到指定设备
    #[allow(dead_code)]
    pub async fn push_credential_to_device(
        &self,
        device_id: &str,
        credential: KiroCredentials,
    ) -> Result<String> {
        let config = self.config.read().clone().context("同步未配置")?;
        let server_url = config.server_url;
        let auth_token = config.auth_token.context("未认证")?;

        // 构建 HTTP 客户端
        let proxy = self.proxy_config.read().clone();
        let client = crate::http_client::build_client(proxy.as_ref(), 30, self.tls_backend)
            .context("创建 HTTP 客户端失败")?;

        // 调用服务器推送 API
        let url = format!("{}/api/devices/{}/credentials", server_url, device_id);
        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .json(&credential)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            anyhow::bail!("推送凭证失败: {}", error_text);
        }

        let result: crate::sync::types::PushCredentialResult = response.json().await?;
        Ok(result.command_id)
    }

    /// 删除设备上的凭证
    #[allow(dead_code)]
    pub async fn delete_device_credential(
        &self,
        device_id: &str,
        credential_id: u64,
    ) -> Result<String> {
        let config = self.config.read().clone().context("同步未配置")?;
        let server_url = config.server_url;
        let auth_token = config.auth_token.context("未认证")?;

        // 构建 HTTP 客户端
        let proxy = self.proxy_config.read().clone();
        let client = crate::http_client::build_client(proxy.as_ref(), 30, self.tls_backend)
            .context("创建 HTTP 客户端失败")?;

        let url = format!(
            "{}/api/devices/{}/credentials/{}",
            server_url, device_id, credential_id
        );
        let response = client
            .delete(&url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            anyhow::bail!("删除凭证失败: {}", error_text);
        }

        let result: crate::sync::types::PushCredentialResult = response.json().await?;
        Ok(result.command_id)
    }

    /// 获取 WebSocket 连接状态
    pub fn get_connection_state(&self) -> Option<String> {
        let ws_client = self.ws_client.read();
        if let Some(client) = ws_client.as_ref() {
            let state = client.get_state_sync();
            Some(match state {
                crate::sync::websocket::ConnectionState::Disconnected => "disconnected".to_string(),
                crate::sync::websocket::ConnectionState::Connecting => "connecting".to_string(),
                crate::sync::websocket::ConnectionState::Connected => "connected".to_string(),
                crate::sync::websocket::ConnectionState::Registered => "registered".to_string(),
                crate::sync::websocket::ConnectionState::Error(msg) => format!("error: {}", msg),
            })
        } else {
            None
        }
    }
}

impl Clone for SyncManager {
    fn clone(&self) -> Self {
        Self {
            http_client: self.http_client.clone(),
            ws_client: self.ws_client.clone(),
            config: self.config.clone(),
            last_sync_version: self.last_sync_version.clone(),
            device_info: self.device_info.clone(),
            config_path: self.config_path.clone(),
            credentials: self.credentials.clone(),
            proxy_config: self.proxy_config.clone(),
            tls_backend: self.tls_backend,
        }
    }
}
