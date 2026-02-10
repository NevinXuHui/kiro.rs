//! HTTP Client 构建模块
//!
//! 提供统一的 HTTP Client 构建功能，支持代理配置

use parking_lot::RwLock;
use reqwest::{Client, Proxy};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::model::config::TlsBackend;

/// 代理配置
#[derive(Debug, Clone, Default)]
pub struct ProxyConfig {
    /// 代理地址，支持 http/https/socks5
    pub url: String,
    /// 代理认证用户名
    pub username: Option<String>,
    /// 代理认证密码
    pub password: Option<String>,
}

impl ProxyConfig {
    /// 从 url 创建代理配置
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            username: None,
            password: None,
        }
    }

    /// 设置认证信息
    pub fn with_auth(mut self, username: impl Into<String>, password: impl Into<String>) -> Self {
        self.username = Some(username.into());
        self.password = Some(password.into());
        self
    }
}

/// 共享代理配置（支持热更新）
///
/// 通过版本号追踪变更，消费方可据此判断是否需要重建 HTTP Client
pub struct SharedProxy {
    config: RwLock<Option<ProxyConfig>>,
    version: AtomicU64,
}

impl SharedProxy {
    /// 创建共享代理配置
    pub fn new(config: Option<ProxyConfig>) -> Arc<Self> {
        Arc::new(Self {
            config: RwLock::new(config),
            version: AtomicU64::new(0),
        })
    }

    /// 读取当前代理配置
    pub fn get(&self) -> Option<ProxyConfig> {
        self.config.read().clone()
    }

    /// 更新代理配置（自动递增版本号）
    pub fn set(&self, config: Option<ProxyConfig>) {
        *self.config.write() = config;
        self.version.fetch_add(1, Ordering::SeqCst);
    }

    /// 获取当前版本号（用于变更检测）
    pub fn version(&self) -> u64 {
        self.version.load(Ordering::SeqCst)
    }
}

/// 共享代理配置类型别名
pub type SharedProxyConfig = Arc<SharedProxy>;

/// 构建 HTTP Client
///
/// # Arguments
/// * `proxy` - 可选的代理配置
/// * `timeout_secs` - 超时时间（秒）
///
/// # Returns
/// 配置好的 reqwest::Client
pub fn build_client(
    proxy: Option<&ProxyConfig>,
    timeout_secs: u64,
    tls_backend: TlsBackend,
) -> anyhow::Result<Client> {
    let mut builder = Client::builder().timeout(Duration::from_secs(timeout_secs));

    if tls_backend == TlsBackend::Rustls {
        builder = builder.use_rustls_tls();
    }

    if let Some(proxy_config) = proxy {
        let mut proxy = Proxy::all(&proxy_config.url)?;

        // 设置代理认证
        if let (Some(username), Some(password)) = (&proxy_config.username, &proxy_config.password) {
            proxy = proxy.basic_auth(username, password);
        }

        builder = builder.proxy(proxy);
        tracing::debug!("HTTP Client 使用代理: {}", proxy_config.url);
    }

    Ok(builder.build()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_config_new() {
        let config = ProxyConfig::new("http://127.0.0.1:7890");
        assert_eq!(config.url, "http://127.0.0.1:7890");
        assert!(config.username.is_none());
        assert!(config.password.is_none());
    }

    #[test]
    fn test_proxy_config_with_auth() {
        let config = ProxyConfig::new("socks5://127.0.0.1:1080").with_auth("user", "pass");
        assert_eq!(config.url, "socks5://127.0.0.1:1080");
        assert_eq!(config.username, Some("user".to_string()));
        assert_eq!(config.password, Some("pass".to_string()));
    }

    #[test]
    fn test_build_client_without_proxy() {
        let client = build_client(None, 30, TlsBackend::Rustls);
        assert!(client.is_ok());
    }

    #[test]
    fn test_build_client_with_proxy() {
        let config = ProxyConfig::new("http://127.0.0.1:7890");
        let client = build_client(Some(&config), 30, TlsBackend::Rustls);
        assert!(client.is_ok());
    }
}
