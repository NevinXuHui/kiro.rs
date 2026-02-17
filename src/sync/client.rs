//! 同步客户端实现

use anyhow::{Context, Result};
use reqwest::Client;

use super::types::*;
use crate::http_client::{build_client, ProxyConfig};
use crate::model::config::TlsBackend;

/// 同步客户端
#[derive(Clone)]
pub struct SyncClient {
    /// HTTP 客户端
    client: Client,
    /// 服务器地址
    server_url: String,
    /// JWT 认证 Token
    auth_token: Option<String>,
}

impl SyncClient {
    /// 创建新的同步客户端
    pub fn new(
        server_url: String,
        auth_token: Option<String>,
        proxy: Option<&ProxyConfig>,
        tls_backend: TlsBackend,
    ) -> Result<Self> {
        let client = build_client(proxy, 30, tls_backend)
            .context("创建 HTTP 客户端失败")?;

        Ok(Self {
            client,
            server_url,
            auth_token,
        })
    }

    /// 获取增量变更
    ///
    /// # 参数
    /// - `since_version`: 客户端上次同步的版本号，0 表示全量同步
    pub async fn get_changes(&self, since_version: u64) -> Result<SyncChangesResponse> {
        let url = format!("{}/api/sync/changes", self.server_url);

        let mut request = self.client.get(&url).query(&[("since_version", since_version)]);

        if let Some(token) = &self.auth_token {
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

        let changes = response
            .json::<SyncChangesResponse>()
            .await
            .context("解析变更响应失败")?;

        Ok(changes)
    }

    /// 获取当前同步版本号
    pub async fn get_version(&self) -> Result<u64> {
        let url = format!("{}/api/sync/version", self.server_url);

        let mut request = self.client.get(&url);

        if let Some(token) = &self.auth_token {
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
    }

    /// 推送变更到服务器
    pub async fn push_changes(&self, changes: PushChangesRequest) -> Result<PushChangesResponse> {
        let url = format!("{}/api/sync/push", self.server_url);

        let mut request = self.client.post(&url).json(&changes);

        if let Some(token) = &self.auth_token {
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
