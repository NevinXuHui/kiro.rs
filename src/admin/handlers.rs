//! Admin API HTTP 处理器

use axum::{
    Json,
    extract::{Path, Query, State},
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

/// POST /api/admin/credentials/:id/set-primary
/// 将凭据设为首选（priority=0，其他同级凭据降级）
pub async fn set_credential_primary(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.set_primary(id) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} 已设为首选",
            id
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
/// 获取指定凭据的余额（?force=true 跳过缓存）
pub async fn get_credential_balance(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let force = params.get("force").map(|v| v == "true").unwrap_or(false);
    let result = if force {
        state.service.get_balance_fresh(id).await
    } else {
        state.service.get_balance(id).await
    };
    match result {
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

/// GET /api/admin/token-usage/timeseries?granularity=hour|day|week
/// 获取时间序列统计数据
pub async fn get_token_usage_timeseries(
    State(state): State<AdminState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    use crate::token_usage::TimeGranularity;

    match &state.token_usage_tracker {
        Some(tracker) => {
            let granularity_str = params.get("granularity").map(|s| s.as_str()).unwrap_or("day");
            let granularity = match TimeGranularity::from_str(granularity_str) {
                Some(g) => g,
                None => {
                    return (
                        axum::http::StatusCode::BAD_REQUEST,
                        Json(super::types::AdminErrorResponse::new(
                            "invalid_parameter",
                            "granularity must be one of: hour, day, week",
                        )),
                    )
                        .into_response()
                }
            };

            Json(tracker.get_timeseries_stats(granularity)).into_response()
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
                payload.key,
                payload.label,
                payload.read_only,
                payload.allowed_models,
                payload.disabled,
                payload.bound_credential_ids,
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
    let mut bytes = [0u8; 24];
    for b in &mut bytes {
        *b = fastrand::u8(..);
    }
    format!("sk-{}", hex::encode(bytes))
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

// ============ 日志查看 ============

/// GET /api/admin/logs
/// 获取实时日志（最新 N 行）
pub async fn get_logs(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let lines = params
        .get("lines")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);

    let level = params.get("level").map(|s| s.as_str()).unwrap_or("all");

    // 分页参数
    let page = params
        .get("page")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(1);

    let page_size = params
        .get("pageSize")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);

    // 查找最新的日志文件
    let log_path = match std::fs::read_dir("logs") {
        Ok(entries) => {
            let mut log_files: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .starts_with("kiro.")
                })
                .collect();

            // 按修改时间排序，获取最新的
            log_files.sort_by_key(|e| {
                e.metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
            });

            log_files
                .last()
                .map(|e| format!("logs/{}", e.file_name().to_string_lossy()))
                .unwrap_or_else(|| "logs/kiro.log".to_string())
        }
        Err(_) => "logs/kiro.log".to_string(),
    };

    // 读取日志文件内容
    let content = match std::fs::read_to_string(&log_path) {
        Ok(content) => {
            // 获取最后 N 行
            let all_lines: Vec<&str> = content.lines().collect();
            let start_idx = if all_lines.len() > lines {
                all_lines.len() - lines
            } else {
                0
            };
            all_lines[start_idx..].join("\n")
        }
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(super::types::AdminErrorResponse::internal_error(&format!(
                    "读取日志文件失败: {}",
                    e
                ))),
            )
                .into_response();
        }
    };

    // 将 UTC 时间转换为本地时间（CST +8）
    let local_content = convert_utc_to_local(&content);

    // 根据日志级别过滤
    let filtered_content = filter_by_level(&local_content, level);

    // 分页处理
    let all_lines: Vec<&str> = filtered_content.lines().collect();
    let total_lines = all_lines.len();
    let total_pages = (total_lines + page_size - 1) / page_size;

    let start_idx = (page - 1) * page_size;
    let end_idx = std::cmp::min(start_idx + page_size, total_lines);

    let page_lines: Vec<&str> = if start_idx < total_lines {
        all_lines[start_idx..end_idx].to_vec()
    } else {
        Vec::new()
    };

    let page_content = page_lines.join("\n");

    Json(serde_json::json!({
        "success": true,
        "content": page_content,
        "lines": page_lines.len(),
        "totalLines": total_lines,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages
    }))
    .into_response()
}

/// 根据日志级别过滤
fn filter_by_level(content: &str, level: &str) -> String {
    if level == "all" {
        return content.to_string();
    }

    let mut result = String::new();
    for line in content.lines() {
        let should_include = match level {
            "error" => line.contains("ERROR"),
            "warn" => line.contains("ERROR") || line.contains("WARN"),
            "info" => line.contains("ERROR") || line.contains("WARN") || line.contains("INFO"),
            "debug" => true, // debug 包含所有级别
            _ => true,
        };

        if should_include {
            result.push_str(line);
            result.push('\n');
        }
    }

    result
}

/// 将日志中的 UTC 时间转换为本地时间（CST +8）
fn convert_utc_to_local(content: &str) -> String {
    let mut result = String::with_capacity(content.len());

    for line in content.lines() {
        // 查找时间戳格式：2026-02-15T10:40:31
        if let Some(t_pos) = line.find('T') {
            if t_pos > 10 && line.len() > t_pos + 8 {
                // 提取小时部分
                let hour_str = &line[t_pos + 1..t_pos + 3];
                if let Ok(hour) = hour_str.parse::<i32>() {
                    let local_hour = (hour + 8) % 24;
                    // 替换小时并移除 Z 后缀
                    let mut new_line = line.to_string();
                    new_line = new_line.replacen(
                        &format!("T{:02}:", hour),
                        &format!("T{:02}:", local_hour),
                        1
                    );
                    new_line = new_line.replace("Z\u{1b}", "+08:00\u{1b}"); // 处理带颜色代码的
                    new_line = new_line.replace("Z ", "+08:00 ");
                    result.push_str(&new_line);
                    result.push('\n');
                    continue;
                }
            }
        }
        result.push_str(line);
        result.push('\n');
    }

    result
}

// ============ 连通性测试 ============

/// POST /api/admin/connectivity/test
/// 测试 API 接口连通性
pub async fn test_connectivity(
    State(state): State<AdminState>,
    Json(payload): Json<ConnectivityTestRequest>,
) -> impl IntoResponse {
    match payload.mode.as_str() {
        "anthropic" => test_anthropic_connectivity(&state, payload.model).await.into_response(),
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
async fn test_anthropic_connectivity(state: &AdminState, model: Option<String>) -> Json<ConnectivityTestResponse> {
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

    let test_model = model.as_deref().unwrap_or("claude-sonnet-4-20250514");

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
        provider.call_api(&request_body, None),
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

    // 记录 Token 使用量（使用实际模型名称）
    if let Some(ref tracker) = state.token_usage_tracker {
        let final_input = input_tokens.unwrap_or(0);
        tracker.record(
            actual_model.to_string(),
            credential_id,
            final_input,
            output_tokens,
            None, // 测试请求不关联 API Key
            None, // 测试请求不记录 client_ip
        );
    }

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

/// GET /api/admin/sync/config
/// 获取同步配置
pub async fn get_sync_config(State(state): State<AdminState>) -> impl IntoResponse {
    // 从 Config 读取同步配置
    let config = state.service.token_manager().config();
    
    if let Some(sync_manager) = &state.sync_manager {
        let (server_url, auth_token, sync_interval, heartbeat_interval) = if let Some(ref sc) = config.sync_config {
            (
                sc.server_url.clone(),
                sc.auth_token.clone().unwrap_or_default(),
                sc.sync_interval,
                sc.heartbeat_interval
            )
        } else {
            (String::new(), String::new(), 300, 15)
        };
        
        Json(serde_json::json!({
            "config": {
                "serverUrl": server_url,
                "authToken": auth_token,
                "enabled": sync_manager.is_enabled(),
                "syncInterval": sync_interval,
                "heartbeatInterval": heartbeat_interval
            }
        }))
    } else {
        Json(serde_json::json!({
            "config": null
        }))
    }
}

/// POST /api/admin/sync/config
/// 保存同步配置
pub async fn save_sync_config(
    State(state): State<AdminState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    // 解析请求数据
    let server_url = payload.get("serverUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let auth_token = payload.get("authToken")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    
    let enabled = payload.get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    let sync_interval = payload.get("syncInterval")
        .and_then(|v| v.as_u64())
        .unwrap_or(300);
    
    let heartbeat_interval = payload.get("heartbeatInterval")
        .and_then(|v| v.as_u64())
        .unwrap_or(15);
    
    // 获取配置文件路径
    let config_path = state.service.token_manager().config().config_path();
    if let Some(path) = config_path {
        let path = path.to_path_buf();
        match crate::model::config::Config::load(&path) {
            Ok(mut config) => {
                // 更新 sync_config
                if let Some(ref mut sc) = config.sync_config {
                    sc.server_url = server_url;
                    sc.auth_token = auth_token;
                    sc.enabled = enabled;
                    sc.sync_interval = sync_interval;
                    sc.heartbeat_interval = heartbeat_interval;
                } else {
                    // 如果不存在，创建新的
                    config.sync_config = Some(crate::model::config::SyncConfig {
                        server_url,
                        auth_token,
                        enabled,
                        sync_interval,
                        heartbeat_interval,
                        email: None,
                        password: None,
                        account_type: crate::model::config::AccountType::Consumer,
                        device_type: crate::model::config::DeviceType::Desktop,
                    });
                }
                
                // 保存配置
                if let Err(e) = config.save() {
                    return (
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                        Json(super::types::AdminErrorResponse::internal_error(&format!(
                            "保存配置失败: {}",
                            e
                        ))),
                    )
                        .into_response();
                }

                // 热更新 sync_manager 配置
                if let Some(sync_manager) = &state.sync_manager {
                    if let Some(sync_config) = &config.sync_config {
                        if let Err(e) = sync_manager.update_config(sync_config.clone()) {
                            tracing::warn!("更新同步管理器配置失败: {}", e);
                        } else {
                            tracing::info!("同步配置已热更新: enabled={}", enabled);
                        }
                    }
                }

                tracing::info!("同步配置已保存");
                Json(SuccessResponse::new("配置保存成功")).into_response()
            }
            Err(e) => (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(super::types::AdminErrorResponse::internal_error(&format!(
                    "加载配置文件失败: {}",
                    e
                ))),
            )
                .into_response(),
        }
    } else {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(super::types::AdminErrorResponse::internal_error(
                "配置文件路径未设置",
            )),
        )
            .into_response()
    }
}


/// GET /api/admin/sync/device
/// 获取当前设备信息
pub async fn get_device_info(State(state): State<AdminState>) -> impl IntoResponse {
    if let Some(sync_manager) = &state.sync_manager {
        if let Some(device_info) = sync_manager.get_device_info() {
            return Json(serde_json::json!({
                "device": {
                    "deviceId": device_info.device_id,
                    "deviceName": device_info.device_name,
                    "deviceType": device_info.device_type
                }
            }));
        }
    }
    Json(serde_json::json!({ "device": null }))
}

/// GET /api/admin/sync/devices
/// 获取在线设备列表
pub async fn get_online_devices(State(state): State<AdminState>) -> impl IntoResponse {
    // 从配置获取 Token 管理平台地址
    let config = state.service.token_manager().config();

    if let Some(ref sync_config) = config.sync_config {
        if !sync_config.enabled {
            return Json(serde_json::json!({
                "devices": []
            }));
        }

        let server_url = &sync_config.server_url;
        let auth_token = sync_config.auth_token.as_ref();

        if server_url.is_empty() || auth_token.is_none() {
            return Json(serde_json::json!({
                "devices": []
            }));
        }

        // 调用 Token 管理平台 API
        let url = format!("{}/api/devices", server_url);
        let client = reqwest::Client::new();

        match client
            .get(&url)
            .header("Authorization", format!("Bearer {}", auth_token.unwrap()))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<serde_json::Value>().await {
                        Ok(data) => {
                            // 提取 devices 数组
                            if let Some(devices) = data.get("devices") {
                                return Json(serde_json::json!({
                                    "devices": devices
                                }));
                            }
                        }
                        Err(e) => {
                            tracing::warn!("解析在线设备响应失败: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!("获取在线设备失败: {}", e);
            }
        }
    }

    Json(serde_json::json!({
        "devices": []
    }))
}


/// POST /api/admin/sync/test
/// 测试同步连接
pub async fn test_sync_connection(
    State(state): State<AdminState>,
    Json(_payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    if let Some(sync_manager) = &state.sync_manager {
        match sync_manager.test_connection().await {
            Ok(_) => Json(serde_json::json!({
                "success": true
            })),
            Err(e) => Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            })),
        }
    } else {
        Json(serde_json::json!({
            "success": false,
            "error": "同步管理器未初始化"
        }))
    }
}

/// POST /api/admin/sync/now
/// 立即执行同步
pub async fn sync_now(State(state): State<AdminState>) -> impl IntoResponse {
    if let Some(sync_manager) = &state.sync_manager {
        match sync_manager.sync_now().await {
            Ok(_) => Json(SuccessResponse::new("同步成功")).into_response(),
            Err(e) => Json(serde_json::json!({
                "error": e.to_string()
            })).into_response(),
        }
    } else {
        Json(serde_json::json!({
            "error": "同步管理器未初始化"
        })).into_response()
    }
}

/// GET /api/admin/sync/status
/// 获取同步连接状态
pub async fn get_sync_status(State(state): State<AdminState>) -> Json<serde_json::Value> {
    let (enabled, connection_state) = if let Some(sync_manager) = &state.sync_manager {
        let connection_state = sync_manager.get_connection_state();
        (sync_manager.is_enabled(), connection_state)
    } else {
        (false, None)
    };

    Json(serde_json::json!({
        "enabled": enabled,
        "connectionState": connection_state
    }))
}
