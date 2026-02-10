//! Admin API 中间件

use std::sync::Arc;

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
};
use parking_lot::RwLock;

use super::service::AdminService;
use super::types::AdminErrorResponse;
use crate::api_key_store::ApiKeyStore;
use crate::common::auth;
use crate::http_client::SharedProxyConfig;
use crate::kiro::provider::KiroProvider;
use crate::token_usage::TokenUsageTracker;

/// Admin API 共享状态
#[derive(Clone)]
pub struct AdminState {
    /// Admin API 密钥
    pub admin_api_key: String,
    /// Admin 服务
    pub service: Arc<AdminService>,
    /// Token 使用量追踪器
    pub token_usage_tracker: Option<Arc<TokenUsageTracker>>,
    /// API Key 存储（共享引用，支持热更新 CRUD）
    pub api_key_store: Option<Arc<RwLock<ApiKeyStore>>>,
    /// 共享代理配置（支持热更新）
    pub shared_proxy: Option<SharedProxyConfig>,
    /// KiroProvider（用于连通性测试）
    pub kiro_provider: Option<Arc<KiroProvider>>,
    /// Profile ARN（用于连通性测试）
    pub profile_arn: Option<String>,
}

impl AdminState {
    pub fn new(admin_api_key: impl Into<String>, service: AdminService) -> Self {
        Self {
            admin_api_key: admin_api_key.into(),
            service: Arc::new(service),
            token_usage_tracker: None,
            api_key_store: None,
            shared_proxy: None,
            kiro_provider: None,
            profile_arn: None,
        }
    }

    pub fn with_token_usage_tracker(mut self, tracker: Arc<TokenUsageTracker>) -> Self {
        self.token_usage_tracker = Some(tracker);
        self
    }

    pub fn with_api_key_store(mut self, store: Arc<RwLock<ApiKeyStore>>) -> Self {
        self.api_key_store = Some(store);
        self
    }

    pub fn with_shared_proxy(mut self, proxy: SharedProxyConfig) -> Self {
        self.shared_proxy = Some(proxy);
        self
    }

    pub fn with_kiro_provider(mut self, provider: Arc<KiroProvider>) -> Self {
        self.kiro_provider = Some(provider);
        self
    }

    pub fn with_profile_arn(mut self, arn: Option<String>) -> Self {
        self.profile_arn = arn;
        self
    }
}

/// Admin API 认证中间件
pub async fn admin_auth_middleware(
    State(state): State<AdminState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let api_key = auth::extract_api_key(&request);

    match api_key {
        Some(key) if auth::constant_time_eq(&key, &state.admin_api_key) => next.run(request).await,
        _ => {
            let error = AdminErrorResponse::authentication_error();
            (StatusCode::UNAUTHORIZED, Json(error)).into_response()
        }
    }
}
