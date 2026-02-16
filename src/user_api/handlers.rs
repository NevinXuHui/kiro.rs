//! User API 请求处理器

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::Serialize;

use crate::admin::types::{ConnectivityTestRequest, ConnectivityTestResponse};

use super::router::UserApiState;

/// 错误响应
#[derive(Serialize)]
struct ErrorResponse {
    error: &'static str,
    message: &'static str,
}

/// 从请求头提取 API Key（支持 x-api-key 和 Bearer token）
fn extract_api_key(headers: &HeaderMap) -> Option<String> {
    // 优先 x-api-key
    if let Some(val) = headers.get("x-api-key") {
        return val.to_str().ok().map(|s| s.to_string());
    }
    // 其次 Authorization: Bearer
    if let Some(val) = headers.get("authorization") {
        if let Ok(s) = val.to_str() {
            if let Some(token) = s.strip_prefix("Bearer ") {
                return Some(token.to_string());
            }
        }
    }
    None
}

/// 认证辅助：提取并验证 API Key，失败时返回错误响应
fn authenticate(
    headers: &HeaderMap,
    state: &UserApiState,
) -> Result<crate::api_key_store::ApiKeyInfo, axum::response::Response> {
    let api_key = extract_api_key(headers).ok_or_else(|| {
        (StatusCode::UNAUTHORIZED, Json(ErrorResponse {
            error: "unauthorized",
            message: "缺少 API Key，请通过 x-api-key header 提供",
        })).into_response()
    })?;

    state.api_key_store.read().authenticate(&api_key).ok_or_else(|| {
        (StatusCode::UNAUTHORIZED, Json(ErrorResponse {
            error: "unauthorized",
            message: "API Key 无效或已禁用",
        })).into_response()
    })
}

/// GET /api/user/usage
///
/// 通过用户自身的 API Key 认证，返回该 Key 的 token 使用统计。
pub async fn get_user_usage(
    State(state): State<UserApiState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let key_info = match authenticate(&headers, &state) {
        Ok(info) => info,
        Err(resp) => return resp,
    };
    Json(state.token_usage_tracker.get_stats_for_api_key(key_info.id)).into_response()
}

/// POST /api/user/connectivity/test
///
/// 连通性测试，逻辑与 Admin API 一致。
pub async fn test_connectivity(
    State(state): State<UserApiState>,
    headers: HeaderMap,
    Json(payload): Json<ConnectivityTestRequest>,
) -> impl IntoResponse {
    // 先认证
    if let Err(resp) = authenticate(&headers, &state) {
        return resp;
    }

    match payload.mode.as_str() {
        "anthropic" => test_anthropic(&state).await.into_response(),
        "openai" => Json(ConnectivityTestResponse {
            success: false,
            mode: "openai".to_string(),
            latency_ms: 0,
            credential_id: None,
            model: None,
            reply: None,
            input_tokens: None,
            output_tokens: None,
            error: Some("OpenAI 兼容端点暂未实现".to_string()),
        }).into_response(),
        _ => (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "invalid_request",
            message: "无效的测试模式，支持: anthropic, openai",
        })).into_response(),
    }
}

/// Anthropic 模式连通性测试（与 admin 逻辑一致）
async fn test_anthropic(state: &UserApiState) -> Json<ConnectivityTestResponse> {
    let Some(provider) = &state.kiro_provider else {
        return Json(ConnectivityTestResponse {
            success: false, mode: "anthropic".to_string(), latency_ms: 0,
            credential_id: None, model: None, reply: None,
            input_tokens: None, output_tokens: None,
            error: Some("KiroProvider 未配置".to_string()),
        });
    };

    let test_model = "claude-sonnet-4-20250514";
    let messages_request = crate::anthropic::types::MessagesRequest {
        model: test_model.to_string(),
        max_tokens: 32,
        messages: vec![crate::anthropic::types::Message {
            role: "user".to_string(),
            content: serde_json::json!("Say hello in one short sentence."),
        }],
        stream: false,
        system: None, tools: None, tool_choice: None,
        thinking: None, output_config: None, metadata: None,
    };

    let conversion_result = match crate::anthropic::converter::convert_request(&messages_request) {
        Ok(r) => r,
        Err(e) => return Json(ConnectivityTestResponse {
            success: false, mode: "anthropic".to_string(), latency_ms: 0,
            credential_id: None, model: Some(test_model.to_string()), reply: None,
            input_tokens: None, output_tokens: None,
            error: Some(format!("请求转换失败: {}", e)),
        }),
    };

    let kiro_request = crate::kiro::model::requests::kiro::KiroRequest {
        conversation_state: conversion_result.conversation_state,
        profile_arn: state.profile_arn.clone(),
    };

    let request_body = match serde_json::to_string(&kiro_request) {
        Ok(b) => b,
        Err(e) => return Json(ConnectivityTestResponse {
            success: false, mode: "anthropic".to_string(), latency_ms: 0,
            credential_id: None, model: Some(test_model.to_string()), reply: None,
            input_tokens: None, output_tokens: None,
            error: Some(format!("序列化失败: {}", e)),
        }),
    };

    let credential_id = provider.current_credential_id();
    let start = std::time::Instant::now();

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        provider.call_api(&request_body),
    ).await;

    let latency_ms = start.elapsed().as_millis() as u64;

    let make_error = |error: String| -> Json<ConnectivityTestResponse> {
        Json(ConnectivityTestResponse {
            success: false, mode: "anthropic".to_string(), latency_ms,
            credential_id: Some(credential_id),
            model: Some(test_model.to_string()), reply: None,
            input_tokens: None, output_tokens: None, error: Some(error),
        })
    };

    let response = match result {
        Ok(Ok(api_resp)) => api_resp,
        Ok(Err(e)) => return make_error(format!("API 调用失败: {}", e)),
        Err(_) => return make_error("连接超时（30 秒）".to_string()),
    };

    // 获取实际使用的模型（可能因降级而不同）
    let actual_model = response.actual_model.as_deref().unwrap_or(test_model);
    let response = response.response;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return make_error(format!("HTTP {}: {}", status.as_u16(), error_text));
    }

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
                    Event::AssistantResponse(resp) => text_content.push_str(&resp.content),
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

    // 记录 Token 使用量（使用实际模型名称）
    let final_input = input_tokens.unwrap_or(0);
    state.token_usage_tracker.record(
        actual_model.to_string(),
        credential_id,
        final_input,
        output_tokens,
        None, // 测试请求不关联 API Key
    );

    Json(ConnectivityTestResponse {
        success: true,
        mode: "anthropic".to_string(),
        latency_ms,
        credential_id: Some(credential_id),
        model: Some(test_model.to_string()),
        reply: if text_content.is_empty() { None } else { Some(text_content) },
        input_tokens,
        output_tokens: Some(output_tokens),
        error: None,
    })
}
