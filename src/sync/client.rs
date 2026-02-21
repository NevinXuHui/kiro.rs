//! 同步客户端实现

use anyhow::{Context, Result};
use reqwest::Client;
use std::time::Duration;

use super::types::*;
use crate::http_client::{build_client, ProxyConfig};
use crate::model::config::TlsBackend;

/// 重试配置
#[derive(Clone, Debug)]
pub struct RetryConfig {
    /// 最大重试次数
    pub max_retries: u32,
    /// 初始延迟（毫秒）
    pub initial_delay_ms: u64,
    /// 是否使用指数退避
    pub exponential_backoff: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay_ms: 1000,
            exponential_backoff: true,
        }
    }
}

/// 通用重试函数
///
/// 使用指数退避策略重试异步操作
async fn retry_with_backoff<F, Fut, T>(
    operation: F,
    config: &RetryConfig,
    operation_name: &str,
) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut retries = 0;
    
    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) if retries < config.max_retries => {
                retries += 1;
                let delay_ms = if config.exponential_backoff {
                    config.initial_delay_ms * 2u64.pow(retries - 1)
                } else {
                    config.initial_delay_ms
                };
                
                tracing::warn!(
                    "{} 失败，{}ms 后重试 ({}/{}): {}",
                    operation_name,
                    delay_ms,
                    retries,
                    config.max_retries,
                    e
                );
                
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
            Err(e) => {
                tracing::error!(
                    "{} 失败，已达最大重试次数 ({}): {}",
                    operation_name,
                    config.max_retries,
                    e
                );
                return Err(e);
            }
        }
    }
}

/// 同步客户端
#[derive(Clone)]
pub struct SyncClient {
    /// HTTP 客户端
    client: Client,
    /// 服务器地址
    server_url: String,
    /// JWT 认证 Token
    auth_token: Option<String>,
    /// 重试配置
    retry_config: RetryConfig,
}

impl SyncClient {
    /// 创建新的同步客户端
    pub fn new(
        server_url: String,
        auth_token: Option<String>,
        proxy: Option<&ProxyConfig>,
        tls_backend: TlsBackend,
    ) -> Result<Self> {
        Self::new_with_retry(server_url, auth_token, proxy, tls_backend, RetryConfig::default())
    }

    /// 创建新的同步客户端（自定义重试配置）
    pub fn new_with_retry(
        server_url: String,
        auth_token: Option<String>,
        proxy: Option<&ProxyConfig>,
        tls_backend: TlsBackend,
        retry_config: RetryConfig,
    ) -> Result<Self> {
        let client = build_client(proxy, 30, tls_backend)
            .context("创建 HTTP 客户端失败")?;

        Ok(Self {
            client,
            server_url,
            auth_token,
            retry_config,
        })
    }

    /// 获取增量变更（带重试）
    ///
    /// # 参数
    /// - `since_version`: 客户端上次同步的版本号，0 表示全量同步
    pub async fn get_changes(&self, since_version: u64) -> Result<SyncChangesResponse> {
        let server_url = self.server_url.clone();
        let auth_token = self.auth_token.clone();
        let client = self.client.clone();
        
        retry_with_backoff(
            || async {
                let url = format!("{}/api/sync/changes", &server_url);
                let mut request = client.get(&url).query(&[("since_version", since_version)]);

                if let Some(token) = &auth_token {
                    request = request.header("Authorization", format!("Bearer {}", token));
                }

                let response = request
                    .send()
                    .await
                    .context("发送获取变更请求失败")?;

                if !response.status().is_success() {
                    let status = response.status();
                    let error_text = response.text().await.unwrap_or_default();
                    anyhow::bail!("获取变更失败: HTTP {} - {}", status, error_text);
                }

                // 先获取响应文本用于调试
                let response_text = response.text().await.context("读取响应文本失败")?;
                tracing::debug!("服务器返回的 JSON: {}", response_text);

                let changes = serde_json::from_str::<SyncChangesResponse>(&response_text)
                    .with_context(|| format!("解析变更响应失败，原始响应: {}", response_text))?;

                Ok(changes)
            },
            &self.retry_config,
            "获取变更"
        ).await
    }

    /// 获取当前同步版本号（带重试）
    pub async fn get_version(&self) -> Result<u64> {
        let server_url = self.server_url.clone();
        let auth_token = self.auth_token.clone();
        let client = self.client.clone();
        
        retry_with_backoff(
            || async {
                let url = format!("{}/api/sync/version", &server_url);
                let mut request = client.get(&url);

                if let Some(token) = &auth_token {
                    request = request.header("Authorization", format!("Bearer {}", token));
                }

                let response = request
                    .send()
                    .await
                    .context("发送获取版本请求失败")?;

                if !response.status().is_success() {
                    let status = response.status();
                    let error_text = response.text().await.unwrap_or_default();
                    anyhow::bail!("获取版本失败: HTTP {} - {}", status, error_text);
                }

                let version_response = response
                    .json::<SyncVersionResponse>()
                    .await
                    .context("解析版本响应失败")?;

                Ok(version_response.current_version)
            },
            &self.retry_config,
            "获取版本"
        ).await
    }

    /// 推送变更到服务器（带重试）
    pub async fn push_changes(&self, changes: PushChangesRequest) -> Result<PushChangesResponse> {
        let server_url = self.server_url.clone();
        let auth_token = self.auth_token.clone();
        let client = self.client.clone();
        let changes = changes.clone();
        
        retry_with_backoff(
            || async {
                let url = format!("{}/api/sync/push", &server_url);
                let mut request = client.post(&url).json(&changes);

                if let Some(token) = &auth_token {
                    request = request.header("Authorization", format!("Bearer {}", token));
                }

                let response = request
                    .send()
                    .await
                    .context("发送推送变更请求失败")?;

                if !response.status().is_success() {
                    let status = response.status();
                    let error_text = response.text().await.unwrap_or_default();
                    anyhow::bail!("推送变更失败: HTTP {} - {}", status, error_text);
                }

                let push_response = response
                    .json::<PushChangesResponse>()
                    .await
                    .context("解析推送响应失败")?;

                Ok(push_response)
            },
            &self.retry_config,
            "推送变更"
        ).await
    }

    /// 删除 Token（软删除）
    #[allow(dead_code)]
    pub async fn delete_token(&self, token_id: u64) -> Result<u64> {
        let url = format!("{}/api/sync/tokens/{}", self.server_url, token_id);

        let mut request = self.client.delete(&url);

        if let Some(token) = &self.auth_token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }

        let response = request
            .send()
            .await
            .context("发送删除 Token 请求失败")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("删除 Token 失败: HTTP {} - {}", status, error_text);
        }

        let delete_response = response
            .json::<DeleteResponse>()
            .await
            .context("解析删除响应失败")?;

        Ok(delete_response.current_version)
    }

    /// 删除 Bonus（软删除）
    #[allow(dead_code)]
    pub async fn delete_bonus(&self, bonus_id: u64) -> Result<u64> {
        let url = format!("{}/api/sync/bonuses/{}", self.server_url, bonus_id);

        let mut request = self.client.delete(&url);

        if let Some(token) = &self.auth_token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }

        let response = request
            .send()
            .await
            .context("发送删除 Bonus 请求失败")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("删除 Bonus 失败: HTTP {} - {}", status, error_text);
        }

        let delete_response = response
            .json::<DeleteResponse>()
            .await
            .context("解析删除响应失败")?;

        Ok(delete_response.current_version)
    }

    /// 更新认证 Token
    #[allow(dead_code)]
    pub fn set_auth_token(&mut self, token: Option<String>) {
        self.auth_token = token;
    }

    /// 测试连接
    pub async fn test_connection(&self) -> Result<()> {
        self.get_version().await?;
        Ok(())
    }
}
