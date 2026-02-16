//! 同步服务器认证客户端

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::http_client::{build_client, ProxyConfig};
use crate::model::config::TlsBackend;

/// 注册请求
#[derive(Debug, Serialize)]
struct RegisterRequest {
    email: String,
    password: String,
}

/// 登录请求
#[derive(Debug, Serialize)]
struct LoginRequest {
    email: String,
    password: String,
}

/// 认证响应
#[derive(Debug, Deserialize)]
struct AuthResponse {
    token: String,
    user: UserInfo,
}

/// 用户信息
#[derive(Debug, Deserialize)]
struct UserInfo {
    id: u64,
    email: String,
    role: String,
}

/// 认证客户端
pub struct AuthClient {
    client: Client,
    server_url: String,
}

impl AuthClient {
    /// 创建新的认证客户端
    pub fn new(
        server_url: String,
        proxy: Option<&ProxyConfig>,
        tls_backend: TlsBackend,
    ) -> Result<Self> {
        let client = build_client(proxy, 30, tls_backend)
            .context("创建 HTTP 客户端失败")?;

        Ok(Self {
            client,
            server_url,
        })
    }

    /// 注册新用户
    pub async fn register(&self, email: String, password: String) -> Result<String> {
        let url = format!("{}/api/auth/register", self.server_url);
        tracing::debug!("发送注册请求到: {}", url);

        let request = RegisterRequest { email, password };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .context("发送注册请求失败")?;

        tracing::debug!("收到注册响应: {}", response.status());

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("注册失败: HTTP {} - {}", status, error_text);
        }

        let auth_response = response
            .json::<AuthResponse>()
            .await
            .context("解析注册响应失败")?;

        tracing::info!("注册成功: {}", auth_response.user.email);
        Ok(auth_response.token)
    }

    /// 用户登录
    pub async fn login(&self, email: String, password: String) -> Result<String> {
        let url = format!("{}/api/auth/login", self.server_url);
        tracing::debug!("发送登录请求到: {}", url);

        let request = LoginRequest { email, password };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .context("发送登录请求失败")?;

        tracing::debug!("收到登录响应: {}", response.status());

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("登录失败: HTTP {} - {}", status, error_text);
        }

        let auth_response = response
            .json::<AuthResponse>()
            .await
            .context("解析登录响应失败")?;

        tracing::info!("登录成功: {}", auth_response.user.email);
        Ok(auth_response.token)
    }

    /// 自动认证：先尝试登录，失败则注册
    pub async fn auto_authenticate(&self, email: String, password: String) -> Result<String> {
        // 先尝试登录
        match self.login(email.clone(), password.clone()).await {
            Ok(token) => {
                tracing::info!("使用现有账号登录成功");
                Ok(token)
            }
            Err(e) => {
                tracing::info!("登录失败，尝试注册新账号: {}", e);
                // 登录失败，尝试注册
                self.register(email, password).await
            }
        }
    }
}
