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
}

impl AdminState {
    pub fn new(admin_api_key: impl Into<String>, service: AdminService) -> Self {
        Self {
            admin_api_key: admin_api_key.into(),
            service: Arc::new(service),
            token_usage_tracker: None,
            api_key_store: None,
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
