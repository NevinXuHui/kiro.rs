//! Admin API 路由配置

use axum::{
    Router, middleware,
    routing::{delete, get, post},
};

use super::{
    handlers::{
        add_credential, create_api_key, delete_api_key, delete_credential,
        get_all_credentials, get_api_key_by_id,
        get_credential_balance, get_device_info, get_load_balancing_mode, get_logs,
        get_online_devices, get_proxy_config, get_sync_config, get_token_usage,
        get_token_usage_timeseries, list_api_keys,
        reset_failure_count, reset_token_usage, save_sync_config,
        set_credential_disabled, set_credential_primary, set_credential_priority,
        set_load_balancing_mode, set_proxy_config, sync_now,
        test_connectivity, test_sync_connection, update_api_key,
    },
    middleware::{AdminState, admin_auth_middleware},
};

/// 创建 Admin API 路由
///
/// # 端点
/// - `GET /credentials` - 获取所有凭据状态
/// - `POST /credentials` - 添加新凭据
/// - `DELETE /credentials/:id` - 删除凭据
/// - `POST /credentials/:id/disabled` - 设置凭据禁用状态
/// - `POST /credentials/:id/priority` - 设置凭据优先级
/// - `POST /credentials/:id/reset` - 重置失败计数
/// - `GET /credentials/:id/balance` - 获取凭据余额
/// - `GET /config/load-balancing` - 获取负载均衡模式
/// - `PUT /config/load-balancing` - 设置负载均衡模式
/// - `GET /config/proxy` - 获取代理配置
/// - `PUT /config/proxy` - 设置代理配置
/// - `GET /api-keys` - 列出所有 API Key（脱敏）
/// - `POST /api-keys` - 添加新 API Key
/// - `GET /api-keys/:id` - 查询单个 API Key
/// - `PUT /api-keys/:id` - 更新 API Key
/// - `DELETE /api-keys/:id` - 删除 API Key
/// - `GET /token-usage` - 获取 token 使用统计
/// - `POST /token-usage/reset` - 重置 token 使用统计
///
/// # 认证
/// 需要 Admin API Key 认证，支持：
/// - `x-api-key` header
/// - `Authorization: Bearer <token>` header
pub fn create_admin_router(state: AdminState) -> Router {
    Router::new()
        .route(
            "/credentials",
            get(get_all_credentials).post(add_credential),
        )
        .route("/credentials/{id}", delete(delete_credential))
        .route("/credentials/{id}/disabled", post(set_credential_disabled))
        .route("/credentials/{id}/priority", post(set_credential_priority))
        .route("/credentials/{id}/set-primary", post(set_credential_primary))
        .route("/credentials/{id}/reset", post(reset_failure_count))
        .route("/credentials/{id}/balance", get(get_credential_balance))
        .route(
            "/config/load-balancing",
            get(get_load_balancing_mode).put(set_load_balancing_mode),
        )
        .route(
            "/config/proxy",
            get(get_proxy_config).put(set_proxy_config),
        )
        .route("/connectivity/test", post(test_connectivity))
        .route("/token-usage", get(get_token_usage))
        .route("/token-usage/reset", post(reset_token_usage))
        .route("/token-usage/timeseries", get(get_token_usage_timeseries))
        .route("/api-keys", get(list_api_keys).post(create_api_key))
        .route(
            "/api-keys/{id}",
            get(get_api_key_by_id)
                .put(update_api_key)
                .delete(delete_api_key),
        )
        .route("/logs", get(get_logs))
        .route("/sync/config", get(get_sync_config).post(save_sync_config))
        .route("/sync/device", get(get_device_info))
        .route("/sync/devices", get(get_online_devices))
        .route("/sync/test", post(test_sync_connection))
        .route("/sync/now", post(sync_now))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            admin_auth_middleware,
        ))
        .with_state(state)
}
