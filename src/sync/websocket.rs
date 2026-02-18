//! Socket.IO 设备连接管理

use anyhow::{Context, Result};
use futures::FutureExt;
use rust_socketio::{
    asynchronous::{Client, ClientBuilder},
    Payload,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// 设备注册信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub token: String,
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_type: Option<String>,
}

/// 设备注册响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRegisteredResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 在线设备信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineDevice {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    pub user_id: u64,
    pub user_email: String,
    pub connected_at: u64,
    pub last_heartbeat: u64,
    pub socket_id: String,
}

/// 设备列表更新
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicesUpdate {
    pub devices: Vec<OnlineDevice>,
    pub count: usize,
}

/// Socket.IO 客户端状态
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Registered,
    Error(String),
}

/// Socket.IO 设备客户端
#[derive(Clone)]
pub struct DeviceClient {
    server_url: String,
    device_info: Arc<RwLock<Option<DeviceInfo>>>,
    state: Arc<RwLock<ConnectionState>>,
    heartbeat_interval: Duration,
    client: Arc<RwLock<Option<Client>>>,
    reconnect_enabled: Arc<RwLock<bool>>,
}

impl DeviceClient {
    /// 创建新的设备客户端
    pub fn new(server_url: String, heartbeat_interval: Duration) -> Self {
        Self {
            server_url,
            device_info: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(ConnectionState::Disconnected)),
            heartbeat_interval,
            client: Arc::new(RwLock::new(None)),
            reconnect_enabled: Arc::new(RwLock::new(true)),
        }
    }

    /// 连接并注册设备
    pub async fn connect_and_register(
        &self,
        device_info: DeviceInfo,
        token_manager: Arc<crate::kiro::token_manager::MultiTokenManager>,
        sync_manager: Arc<crate::sync::manager::SyncManager>,
    ) -> Result<()> {
        *self.device_info.write().await = Some(device_info.clone());
        *self.state.write().await = ConnectionState::Connecting;

        tracing::info!("连接到 Socket.IO 服务器: {}", self.server_url);

        let state = self.state.clone();
        let state_for_error = self.state.clone();
        let state_for_update = self.state.clone();

        // 构建 Socket.IO 客户端
        let client = ClientBuilder::new(&self.server_url)
            .on("connect", move |_payload, _client| {
                async move {
                    tracing::info!("Socket.IO 连接成功");
                }
                .boxed()
            })
            .on("device:registered", {
                let state = state.clone();
                move |payload, _client| {
                    let state = state.clone();
                    async move {
                        tracing::debug!("收到 device:registered 事件: {:?}", payload);
                        match payload {
                            Payload::Text(values) => {
                                if let Some(value) = values.first() {
                                    if let Ok(response) = serde_json::from_value::<DeviceRegisteredResponse>(value.clone()) {
                                        if response.success {
                                            *state.write().await = ConnectionState::Registered;
                                            tracing::info!("设备注册成功");
                                        } else {
                                            let error = response.error.unwrap_or_else(|| "未知错误".to_string());
                                            *state.write().await = ConnectionState::Error(error.clone());
                                            tracing::error!("设备注册失败: {}", error);
                                        }
                                    }
                                }
                            }
                            _ => {
                                tracing::warn!("收到非预期的 payload 类型");
                            }
                        }
                    }
                    .boxed()
                }
            })
            .on("device:error", {
                let state = state_for_error.clone();
                move |payload, _client| {
                    let state = state.clone();
                    async move {
                        tracing::error!("收到 device:error 事件: {:?}", payload);
                        match payload {
                            Payload::Text(values) => {
                                if let Some(value) = values.first() {
                                    if let Some(msg) = value.get("message").and_then(|v| v.as_str()) {
                                        *state.write().await = ConnectionState::Error(msg.to_string());
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    .boxed()
                }
            })
            .on("devices:update", {
                move |payload, _client| {
                    async move {
                        match payload {
                            Payload::Text(values) => {
                                if let Some(value) = values.first() {
                                    if let Ok(update) = serde_json::from_value::<DevicesUpdate>(value.clone()) {
                                        tracing::debug!("收到设备列表更新: {} 个在线设备", update.count);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    .boxed()
                }
            })
            .on("device:heartbeat_ack", {
                move |payload, _client| {
                    async move {
                        match payload {
                            Payload::Text(values) => {
                                if let Some(value) = values.first() {
                                    tracing::debug!("收到心跳响应: {:?}", value);
                                }
                            }
                            _ => {}
                        }
                    }
                    .boxed()
                }
            })
            .on("credential:command", {
                let token_manager = token_manager.clone();
                let sync_manager = sync_manager.clone();
                move |payload, client| {
                    let token_manager = token_manager.clone();
                    let sync_manager = sync_manager.clone();
                    async move {
                        Self::handle_credential_command(payload, token_manager, sync_manager, client).await;
                    }
                    .boxed()
                }
            })
            .on("error", {
                let state = state_for_update.clone();
                move |payload, _client| {
                    let _state = state.clone();
                    async move {
                        tracing::warn!("Socket.IO 连接错误: {:?}", payload);
                        // 保持连接状态，让心跳机制检测并处理
                        // 不立即设置为 Error，避免心跳循环立即停止
                    }
                    .boxed()
                }
            })
            .connect()
            .await
            .context("Socket.IO 连接失败")?;

        *self.state.write().await = ConnectionState::Connected;
        *self.client.write().await = Some(client.clone());

        tracing::info!("Socket.IO 客户端已连接，准备发送注册请求");

        // 等待一小段时间确保连接稳定
        tokio::time::sleep(Duration::from_millis(100)).await;

        // 发送设备注册消息
        let mut register_data = json!({
            "token": device_info.token,
            "deviceId": device_info.device_id,
            "deviceName": device_info.device_name,
            "deviceType": device_info.device_type,
        });

        // 添加账号类型（如果有）
        if let Some(account_type) = &device_info.account_type {
            register_data["accountType"] = json!(account_type);
        }

        tracing::info!(
            "发送注册数据 - deviceId: {}, deviceName: {}, deviceType: {}",
            device_info.device_id,
            device_info.device_name,
            device_info.device_type
        );
        tracing::debug!("完整注册数据: {}", register_data);

        client
            .emit("device:register", register_data)
            .await
            .context("发送注册消息失败")?;

        tracing::info!("已发送设备注册请求");

        // 等待注册响应（最多等待 5 秒）
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let current_state = self.state.read().await.clone();
            if matches!(current_state, ConnectionState::Registered) {
                break;
            }
            if matches!(current_state, ConnectionState::Error(_)) {
                anyhow::bail!("设备注册失败");
            }
        }

        // 启动心跳任务
        let client_clone = client.clone();
        let device_id = device_info.device_id.clone();
        let heartbeat_interval = self.heartbeat_interval;
        let state_clone = self.state.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(heartbeat_interval);
            let mut consecutive_failures = 0;
            const MAX_FAILURES: u32 = 3;

            // 立即发送第一次心跳，不等待
            interval.tick().await; // 消耗第一个立即触发的 tick

            loop {
                // 检查连接状态
                let current_state = state_clone.read().await.clone();
                if !matches!(current_state, ConnectionState::Registered) {
                    tracing::debug!("设备未注册，停止心跳");
                    break;
                }

                // 发送心跳
                let heartbeat_data = json!({
                    "deviceId": device_id,
                });

                if let Err(e) = client_clone
                    .emit("device:heartbeat", heartbeat_data)
                    .await
                {
                    tracing::error!("发送心跳失败: {}", e);
                    consecutive_failures += 1;

                    if consecutive_failures >= MAX_FAILURES {
                        tracing::warn!("连续心跳失败 {} 次，标记为需要重连", MAX_FAILURES);
                        *state_clone.write().await = ConnectionState::Error(format!("心跳失败: {}", e));
                        break;
                    }
                } else {
                    tracing::debug!("已发送心跳");
                    consecutive_failures = 0;
                }

                // 等待下一个心跳间隔
                interval.tick().await;
            }
        });

        Ok(())
    }

    /// 获取当前连接状态
    #[allow(dead_code)]
    pub async fn get_state(&self) -> ConnectionState {
        self.state.read().await.clone()
    }

    /// 同步获取当前连接状态
    pub fn get_state_sync(&self) -> ConnectionState {
        // 使用 try_read 避免阻塞
        if let Ok(guard) = self.state.try_read() {
            guard.clone()
        } else {
            // 如果无法获取锁，返回 Disconnected
            ConnectionState::Disconnected
        }
    }

    /// 检查是否已连接并注册
    #[allow(dead_code)]
    pub async fn is_registered(&self) -> bool {
        matches!(*self.state.read().await, ConnectionState::Registered)
    }

    /// 断开连接
    #[allow(dead_code)]
    pub async fn disconnect(&self) -> Result<()> {
        // 禁用重连
        *self.reconnect_enabled.write().await = false;

        if let Some(client) = self.client.write().await.take() {
            client.disconnect().await?;
            *self.state.write().await = ConnectionState::Disconnected;
            tracing::info!("已断开 Socket.IO 连接");
        }
        Ok(())
    }

    /// 处理凭证命令
    async fn handle_credential_command(
        payload: Payload,
        token_manager: Arc<crate::kiro::token_manager::MultiTokenManager>,
        sync_manager: Arc<crate::sync::manager::SyncManager>,
        client: Client,
    ) {
        let response = match payload {
            Payload::Text(values) => {
                if let Some(value) = values.first() {
                    tracing::debug!("收到命令 payload: {:?}", value);
                    match serde_json::from_value::<crate::sync::types::DeviceCommand>(value.clone()) {
                        Ok(command) => {
                            tracing::info!("命令解析成功，开始执行");
                            Self::execute_command(command, token_manager, sync_manager).await
                        },
                        Err(e) => {
                            tracing::error!("解析命令失败: {}, payload: {:?}", e, value);
                            crate::sync::types::CommandResponse {
                                command_id: "unknown".to_string(),
                                success: false,
                                error: Some(format!("解析命令失败: {}", e)),
                                data: None,
                            }
                        },
                    }
                } else {
                    tracing::warn!("payload 为空");
                    return;
                }
            }
            _ => {
                tracing::warn!("收到非文本 payload");
                return;
            }
        };

        // 发送响应
        if let Err(e) = client
            .emit(
                "credential:response",
                serde_json::to_value(&response).unwrap(),
            )
            .await
        {
            tracing::error!("发送命令响应失败: {}", e);
        }
    }

    /// 执行具体命令
    async fn execute_command(
        command: crate::sync::types::DeviceCommand,
        token_manager: Arc<crate::kiro::token_manager::MultiTokenManager>,
        sync_manager: Arc<crate::sync::manager::SyncManager>,
    ) -> crate::sync::types::CommandResponse {
        use crate::sync::types::{CommandResponse, DeviceCommand};

        match command {
            DeviceCommand::AddCredential {
                credential,
                command_id,
            } => {
                tracing::info!("收到添加凭证命令: {}", command_id);
                match token_manager.add_credential(credential).await {
                    Ok(id) => {
                        tracing::info!("凭证添加成功，ID: {}", id);

                        // 触发同步，将新凭证上报到服务器
                        tracing::info!("触发同步，上报新凭证到服务器");
                        if let Err(e) = sync_manager.sync_now().await {
                            tracing::warn!("同步失败: {}", e);
                        } else {
                            tracing::info!("同步成功");
                        }

                        CommandResponse {
                            command_id,
                            success: true,
                            error: None,
                            data: Some(json!({ "credentialId": id })),
                        }
                    },
                    Err(e) => {
                        tracing::error!("凭证添加失败: {}", e);
                        CommandResponse {
                            command_id,
                            success: false,
                            error: Some(e.to_string()),
                            data: None,
                        }
                    },
                }
            }
            DeviceCommand::DeleteCredential {
                credential_id,
                command_id,
            } => {
                tracing::info!(
                    "收到删除凭证命令: {} (ID: {})",
                    command_id,
                    credential_id
                );
                match token_manager.delete_credential(credential_id) {
                    Ok(_) => {
                        // 触发同步
                        tracing::info!("触发同步，更新凭证列表到服务器");
                        if let Err(e) = sync_manager.sync_now().await {
                            tracing::warn!("同步失败: {}", e);
                        }

                        CommandResponse {
                            command_id,
                            success: true,
                            error: None,
                            data: None,
                        }
                    },
                    Err(e) => CommandResponse {
                        command_id,
                        success: false,
                        error: Some(e.to_string()),
                        data: None,
                    },
                }
            }
            DeviceCommand::SetDisabled {
                credential_id,
                disabled,
                command_id,
            } => {
                tracing::info!(
                    "收到设置凭证状态命令: {} (ID: {}, disabled: {})",
                    command_id,
                    credential_id,
                    disabled
                );
                match token_manager.set_disabled(credential_id, disabled) {
                    Ok(_) => {
                        // 触发同步
                        tracing::info!("触发同步，更新凭证状态到服务器");
                        if let Err(e) = sync_manager.sync_now().await {
                            tracing::warn!("同步失败: {}", e);
                        }

                        CommandResponse {
                            command_id,
                            success: true,
                            error: None,
                            data: None,
                        }
                    },
                    Err(e) => CommandResponse {
                        command_id,
                        success: false,
                        error: Some(e.to_string()),
                        data: None,
                    },
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_client_creation() {
        let client = DeviceClient::new(
            "http://localhost:3000".to_string(),
            Duration::from_secs(15),
        );

        assert_eq!(client.server_url, "http://localhost:3000");
        assert_eq!(client.heartbeat_interval, Duration::from_secs(15));
    }

    #[tokio::test]
    async fn test_device_client_initial_state() {
        let client = DeviceClient::new(
            "http://localhost:3000".to_string(),
            Duration::from_secs(15),
        );

        let state = client.get_state().await;
        assert_eq!(state, ConnectionState::Disconnected);
        assert!(!client.is_registered().await);
    }
}
