//! Admin API HTTP 处理器

use axum::{
    Json,
    extract::{Path, State},
    response::IntoResponse,
};

use super::{
    middleware::AdminState,
    types::{
        AddCredentialRequest, ConnectivityTestRequest, ConnectivityTestResponse,
        CreateApiKeyRequest, CreateApiKeyResponse, ProxyConfigResponse,
        SetDisabledRequest, SetLoadBalancingModeRequest, SetPriorityRequest, SuccessResponse,
        UpdateApiKeyRequest, UpdateProxyConfigRequest,
    },
};

/// GET /api/admin/credentials
/// 获取所有凭据状态
pub async fn get_all_credentials(State(state): State<AdminState>) -> impl IntoResponse {
    let response = state.service.get_all_credentials();
    Json(response)
}

/// POST /api/admin/credentials/:id/disabled
/// 设置凭据禁用状态
pub async fn set_credential_disabled(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<SetDisabledRequest>,
) -> impl IntoResponse {
    match state.service.set_disabled(id, payload.disabled) {
        Ok(_) => {
            let action = if payload.disabled { "禁用" } else { "启用" };
            Json(SuccessResponse::new(format!("凭据 #{} 已{}", id, action))).into_response()
        }
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/priority
/// 设置凭据优先级
pub async fn set_credential_priority(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<SetPriorityRequest>,
) -> impl IntoResponse {
    match state.service.set_priority(id, payload.priority) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} 优先级已设置为 {}",
            id, payload.priority
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/reset
/// 重置失败计数并重新启用
pub async fn reset_failure_count(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.reset_and_enable(id) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} 失败计数已重置并重新启用",
            id
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// GET /api/admin/credentials/:id/balance
/// 获取指定凭据的余额
pub async fn get_credential_balance(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.get_balance(id).await {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials
/// 添加新凭据
pub async fn add_credential(
    State(state): State<AdminState>,
    Json(payload): Json<AddCredentialRequest>,
) -> impl IntoResponse {
    match state.service.add_credential(payload).await {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// DELETE /api/admin/credentials/:id
/// 删除凭据
pub async fn delete_credential(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.delete_credential(id) {
        Ok(_) => Json(SuccessResponse::new(format!("凭据 #{} 已删除", id))).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// GET /api/admin/config/load-balancing
/// 获取负载均衡模式
pub async fn get_load_balancing_mode(State(state): State<AdminState>) -> impl IntoResponse {
    let response = state.service.get_load_balancing_mode();
    Json(response)
}

/// PUT /api/admin/config/load-balancing
/// 设置负载均衡模式
pub async fn set_load_balancing_mode(
    State(state): State<AdminState>,
    Json(payload): Json<SetLoadBalancingModeRequest>,
) -> impl IntoResponse {
    match state.service.set_load_balancing_mode(payload) {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// GET /api/admin/token-usage
/// 获取 token 使用统计
pub async fn get_token_usage(State(state): State<AdminState>) -> impl IntoResponse {
    match &state.token_usage_tracker {
        Some(tracker) => Json(tracker.get_stats()).into_response(),
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "Token usage tracking is not enabled",
            )),
        )
            .into_response(),
    }
}

/// POST /api/admin/token-usage/reset
/// 重置 token 使用统计
pub async fn reset_token_usage(State(state): State<AdminState>) -> impl IntoResponse {
    match &state.token_usage_tracker {
        Some(tracker) => {
            tracker.reset();
            Json(super::types::SuccessResponse::new("Token 使用统计已重置")).into_response()
        }
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "Token usage tracking is not enabled",
            )),
        )
            .into_response(),
    }
}

/// GET /api/admin/api-keys
/// 列出所有 API Key（脱敏）
pub async fn list_api_keys(State(state): State<AdminState>) -> impl IntoResponse {
    match &state.api_key_store {
        Some(store) => {
            let store = store.read();
            Json(store.list()).into_response()
        }
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "API Key 管理未启用",
            )),
        )
            .into_response(),
    }
}

/// GET /api/admin/api-keys/:id
/// 查询单个 API Key（脱敏）
pub async fn get_api_key_by_id(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match &state.api_key_store {
        Some(store) => {
            let store = store.read();
            match store.get(id) {
                Some(view) => Json(view).into_response(),
                None => (
                    axum::http::StatusCode::NOT_FOUND,
                    Json(super::types::AdminErrorResponse::not_found(format!(
                        "API Key #{} 不存在",
                        id
                    ))),
                )
                    .into_response(),
            }
        }
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "API Key 管理未启用",
            )),
        )
            .into_response(),
    }
}

/// POST /api/admin/api-keys
/// 添加新 API Key
pub async fn create_api_key(
    State(state): State<AdminState>,
    Json(payload): Json<CreateApiKeyRequest>,
) -> impl IntoResponse {
    match &state.api_key_store {
        Some(store) => {
            let key = payload
                .key
                .filter(|k| !k.trim().is_empty())
                .unwrap_or_else(generate_api_key);
            let mut store = store.write();
            let id = store.add(key.clone(), payload.label, payload.read_only, payload.allowed_models);
            Json(CreateApiKeyResponse {
                success: true,
                message: format!("API Key #{} 已创建", id),
                id,
                key,
            })
            .into_response()
        }
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "API Key 管理未启用",
            )),
        )
            .into_response(),
    }
}

/// PUT /api/admin/api-keys/:id
/// 更新 API Key 属性
pub async fn update_api_key(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<UpdateApiKeyRequest>,
) -> impl IntoResponse {
    match &state.api_key_store {
        Some(store) => {
            let mut store = store.write();
            match store.update(
                id,
                payload.label,
                payload.read_only,
                payload.allowed_models,
                payload.disabled,
            ) {
                Ok(_) => {
                    Json(SuccessResponse::new(format!("API Key #{} 已更新", id))).into_response()
                }
                Err(e) => (
                    axum::http::StatusCode::NOT_FOUND,
                    Json(super::types::AdminErrorResponse::not_found(e)),
                )
                    .into_response(),
            }
        }
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "API Key 管理未启用",
            )),
        )
            .into_response(),
    }
}

/// DELETE /api/admin/api-keys/:id
/// 删除 API Key
pub async fn delete_api_key(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match &state.api_key_store {
        Some(store) => {
            let mut store = store.write();
            match store.delete(id) {
                Ok(_) => {
                    Json(SuccessResponse::new(format!("API Key #{} 已删除", id))).into_response()
                }
                Err(e) => (
                    axum::http::StatusCode::NOT_FOUND,
                    Json(super::types::AdminErrorResponse::not_found(e)),
                )
                    .into_response(),
            }
        }
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "API Key 管理未启用",
            )),
        )
            .into_response(),
    }
}

/// 自动生成 API Key
fn generate_api_key() -> String {
    format!("sk-{}", uuid::Uuid::new_v4().to_string().replace('-', ""))
}

// ============ 代理配置 ============

/// GET /api/admin/config/proxy
/// 获取当前代理配置
pub async fn get_proxy_config(State(state): State<AdminState>) -> impl IntoResponse {
    match &state.shared_proxy {
        Some(proxy) => {
            let config = proxy.get();
            let response = match config {
                Some(cfg) => ProxyConfigResponse {
                    enabled: true,
                    url: Some(cfg.url),
                    username: cfg.username,
                    has_password: cfg.password.is_some(),
                },
                None => ProxyConfigResponse {
                    enabled: false,
                    url: None,
                    username: None,
                    has_password: false,
                },
            };
            Json(response).into_response()
        }
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "代理配置不可用",
            )),
        )
            .into_response(),
    }
}

/// PUT /api/admin/config/proxy
/// 更新代理配置（热更新 + 持久化）
pub async fn set_proxy_config(
    State(state): State<AdminState>,
    Json(payload): Json<UpdateProxyConfigRequest>,
) -> impl IntoResponse {
    let Some(shared_proxy) = &state.shared_proxy else {
        return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(super::types::AdminErrorResponse::new(
                "service_unavailable",
                "代理配置不可用",
            )),
        )
            .into_response();
    };

    // 验证：启用时必须提供 URL
    if payload.enabled {
        match &payload.url {
            Some(url) if !url.is_empty() => {}
            _ => {
                return (
                    axum::http::StatusCode::BAD_REQUEST,
                    Json(super::types::AdminErrorResponse::invalid_request(
                        "启用代理时必须提供代理地址",
                    )),
                )
                    .into_response();
            }
        }
    }

    // 构建新的代理配置
    let new_proxy = if payload.enabled {
        let url = payload.url.clone().unwrap_or_default();
        let mut proxy_config = crate::http_client::ProxyConfig::new(&url);
        if let (Some(username), Some(password)) = (&payload.username, &payload.password) {
            proxy_config = proxy_config.with_auth(username.clone(), password.clone());
        }
        Some(proxy_config)
    } else {
        None
    };

    // 持久化到 config.json
    let config_path = state.service.token_manager().config().config_path();
    if let Some(path) = config_path {
        let path = path.to_path_buf();
        match crate::model::config::Config::load(&path) {
            Ok(mut config) => {
                if payload.enabled {
                    config.proxy_url = payload.url.clone();
                    config.proxy_username = payload.username.clone();
                    config.proxy_password = payload.password.clone();
                } else {
                    config.proxy_url = None;
                    config.proxy_username = None;
                    config.proxy_password = None;
                }
                if let Err(e) = config.save() {
                    tracing::warn!("代理配置持久化失败: {}", e);
                }
            }
            Err(e) => {
                tracing::warn!("加载配置文件失败，代理配置仅在当前进程生效: {}", e);
            }
        }
    }

    // 热更新 SharedProxy
    shared_proxy.set(new_proxy);
    tracing::info!(
        "代理配置已更新: enabled={}",
        payload.enabled
    );

    // 返回更新后的配置
    let config = shared_proxy.get();
    let response = match config {
        Some(cfg) => ProxyConfigResponse {
            enabled: true,
            url: Some(cfg.url),
            username: cfg.username,
            has_password: cfg.password.is_some(),
        },
        None => ProxyConfigResponse {
            enabled: false,
            url: None,
            username: None,
            has_password: false,
        },
    };
    Json(response).into_response()
}

// ============ 连通性测试 ============

/// POST /api/admin/connectivity/test
/// 测试 API 接口连通性
pub async fn test_connectivity(
    State(state): State<AdminState>,
    Json(payload): Json<ConnectivityTestRequest>,
) -> impl IntoResponse {
    match payload.mode.as_str() {
        "anthropic" => test_anthropic_connectivity(&state).await.into_response(),
        "openai" => {
            Json(ConnectivityTestResponse {
                success: false,
                mode: "openai".to_string(),
                latency_ms: 0,
                credential_id: None,
                model: None,
                reply: None,
                input_tokens: None,
                output_tokens: None,
                error: Some("OpenAI 兼容端点暂未实现".to_string()),
            })
            .into_response()
        }
        _ => (
            axum::http::StatusCode::BAD_REQUEST,
            Json(super::types::AdminErrorResponse::invalid_request(
                "无效的测试模式，支持: anthropic, openai",
            )),
        )
            .into_response(),
    }
}

/// Anthropic 模式连通性测试
async fn test_anthropic_connectivity(state: &AdminState) -> Json<ConnectivityTestResponse> {
    let Some(provider) = &state.kiro_provider else {
        return Json(ConnectivityTestResponse {
            success: false,
            mode: "anthropic".to_string(),
            latency_ms: 0,
            credential_id: None,
            model: None,
            reply: None,
            input_tokens: None,
            output_tokens: None,
            error: Some("KiroProvider 未配置".to_string()),
        });
    };

    let test_model = "claude-sonnet-4-20250514";

    // 构建最小 MessagesRequest
    let messages_request = crate::anthropic::types::MessagesRequest {
        model: test_model.to_string(),
        max_tokens: 32,
        messages: vec![crate::anthropic::types::Message {
            role: "user".to_string(),
            content: serde_json::json!("Say hello in one short sentence."),
        }],
        stream: false,
        system: None,
        tools: None,
        tool_choice: None,
        thinking: None,
        output_config: None,
        metadata: None,
    };

    // 转换为 Kiro 格式
    let conversion_result = match crate::anthropic::converter::convert_request(&messages_request) {
        Ok(result) => result,
        Err(e) => {
            return Json(ConnectivityTestResponse {
                success: false,
                mode: "anthropic".to_string(),
                latency_ms: 0,
                credential_id: None,
                model: Some(test_model.to_string()),
                reply: None,
                input_tokens: None,
                output_tokens: None,
                error: Some(format!("请求转换失败: {}", e)),
            });
        }
    };

    let kiro_request = crate::kiro::model::requests::kiro::KiroRequest {
        conversation_state: conversion_result.conversation_state,
        profile_arn: state.profile_arn.clone(),
    };

    let request_body = match serde_json::to_string(&kiro_request) {
        Ok(body) => body,
        Err(e) => {
            return Json(ConnectivityTestResponse {
                success: false,
                mode: "anthropic".to_string(),
                latency_ms: 0,
                credential_id: None,
                model: Some(test_model.to_string()),
                reply: None,
                input_tokens: None,
                output_tokens: None,
                error: Some(format!("序列化失败: {}", e)),
            });
        }
    };

    let credential_id = provider.current_credential_id();
    let start = std::time::Instant::now();

    // 带超时的 API 调用
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        provider.call_api(&request_body),
    )
    .await;

    let latency_ms = start.elapsed().as_millis() as u64;

    let make_error = |error: String| -> Json<ConnectivityTestResponse> {
        Json(ConnectivityTestResponse {
            success: false,
            mode: "anthropic".to_string(),
            latency_ms,
            credential_id: Some(credential_id),
            model: Some(test_model.to_string()),
            reply: None,
            input_tokens: None,
            output_tokens: None,
            error: Some(error),
        })
    };

    let response = match result {
        Ok(Ok(resp)) => resp,
        Ok(Err(e)) => return make_error(format!("API 调用失败: {}", e)),
        Err(_) => return make_error("连接超时（30 秒）".to_string()),
    };

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return make_error(format!("HTTP {}: {}", status.as_u16(), error_text));
    }

    // 解析响应事件流
    let body_bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(e) => return make_error(format!("读取响应失败: {}", e)),
    };

    use crate::kiro::model::events::Event;
    use crate::kiro::parser::decoder::EventStreamDecoder;

    let mut decoder = EventStreamDecoder::new();
    if let Err(e) = decoder.feed(&body_bytes) {
        tracing::warn!("连通性测试解码缓冲区溢出: {}", e);
    }

    let mut text_content = String::new();
    let mut input_tokens: Option<i32> = None;

    for result in decoder.decode_iter() {
        if let Ok(frame) = result {
            if let Ok(event) = Event::from_frame(frame) {
                match event {
                    Event::AssistantResponse(resp) => {
                        text_content.push_str(&resp.content);
                    }
                    Event::ContextUsage(ctx) => {
                        input_tokens =
                            Some((ctx.context_usage_percentage * 200_000.0 / 100.0) as i32);
                    }
                    _ => {}
                }
            }
        }
    }

    let output_tokens = if !text_content.is_empty() {
        let content_blocks = vec![serde_json::json!({"type": "text", "text": text_content})];
        crate::token::estimate_output_tokens(&content_blocks)
    } else {
        0
    };

    Json(ConnectivityTestResponse {
        success: true,
        mode: "anthropic".to_string(),
        latency_ms,
        credential_id: Some(credential_id),
        model: Some(test_model.to_string()),
        reply: if text_content.is_empty() {
            None
        } else {
            Some(text_content)
        },
        input_tokens,
        output_tokens: Some(output_tokens),
        error: None,
    })
}
