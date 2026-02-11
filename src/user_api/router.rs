//! User API 路由配置

use std::sync::Arc;

use axum::{Router, routing::{get, post}};
use parking_lot::RwLock;

use crate::api_key_store::ApiKeyStore;
use crate::kiro::provider::KiroProvider;
use crate::token_usage::TokenUsageTracker;

use super::handlers;

/// User API 共享状态
#[derive(Clone)]
pub struct UserApiState {
    pub api_key_store: Arc<RwLock<ApiKeyStore>>,
    pub token_usage_tracker: Arc<TokenUsageTracker>,
    pub kiro_provider: Option<Arc<KiroProvider>>,
    pub profile_arn: Option<String>,
}

/// 创建 User API 路由
///
/// # 端点
/// - `GET /usage` - 获取当前 API Key 的 token 使用统计
/// - `POST /connectivity/test` - 连通性测试（与 Admin 一致）
///
/// # 认证
/// 通过 `x-api-key` 或 `Authorization: Bearer` header 传递用户自身的 API Key
pub fn create_user_api_router(state: UserApiState) -> Router {
    Router::new()
        .route("/usage", get(handlers::get_user_usage))
        .route("/connectivity/test", post(handlers::test_connectivity))
        .with_state(state)
}
