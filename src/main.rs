mod admin;
mod admin_ui;
mod anthropic;
pub mod api_key_store;
mod common;
mod http_client;
mod kiro;
mod model;
mod sync;
pub mod token;
pub mod token_usage;
mod user_api;
mod user_ui;

use std::sync::Arc;

use clap::Parser;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use kiro::model::credentials::{CredentialsConfig, KiroCredentials};
use kiro::provider::KiroProvider;
use kiro::token_manager::MultiTokenManager;
use model::arg::Args;
use model::config::Config;
use axum::{
    response::{IntoResponse, Redirect},
    routing::get,
};

#[tokio::main]
async fn main() {
    // 清除代理环境变量，避免内网连接走代理
    // 注意：rust_socketio 使用的 reqwest 会自动检测系统代理
    // 我们需要设置 NO_PROXY 来排除内网地址
    unsafe {
        std::env::remove_var("HTTP_PROXY");
        std::env::remove_var("HTTPS_PROXY");
        std::env::remove_var("http_proxy");
        std::env::remove_var("https_proxy");

        // 设置 NO_PROXY 排除所有内网地址和本地地址
        std::env::set_var("NO_PROXY", "localhost,127.0.0.1,*.local,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,192.168.*,100.*");
        std::env::set_var("no_proxy", "localhost,127.0.0.1,*.local,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,192.168.*,100.*");
    }

    // 解析命令行参数
    let args = Args::parse();

    // 初始化日志（控制台 + 按天滚动文件）
    let file_appender = tracing_appender::rolling::daily("logs", "kiro");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("debug"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::fmt::layer().with_writer(non_blocking))
        .init();

    // 加载配置
    let config_path = args
        .config
        .unwrap_or_else(|| Config::default_config_path().to_string());
    let config = Config::load(&config_path).unwrap_or_else(|e| {
        tracing::error!("加载配置失败: {}", e);
        std::process::exit(1);
    });

    // 加载凭证（支持单对象或数组格式）
    let credentials_path = args
        .credentials
        .unwrap_or_else(|| KiroCredentials::default_credentials_path().to_string());
    let credentials_config = CredentialsConfig::load(&credentials_path).unwrap_or_else(|e| {
        tracing::error!("加载凭证失败: {}", e);
        std::process::exit(1);
    });

    // 判断是否为多凭据格式（用于刷新后回写）
    let is_multiple_format = credentials_config.is_multiple();

    // 转换为按优先级排序的凭据列表
    let credentials_list = credentials_config.into_sorted_credentials();
    tracing::info!("已加载 {} 个凭据配置", credentials_list.len());

    // 获取第一个凭据用于日志显示
    let first_credentials = credentials_list.first().cloned().unwrap_or_default();
    tracing::debug!("主凭证: {:?}", first_credentials);

    // 创建 API Key 存储（支持从旧 config.json apiKey 自动迁移）
    let config_dir = std::path::Path::new(&config_path).parent();
    let api_key_store = api_key_store::ApiKeyStore::load_or_migrate(
        config_dir,
        config.api_key.as_deref(),
    );
    if api_key_store.is_empty() {
        tracing::warn!("未配置任何 API Key，客户端请求将被拒绝");
    }
    let api_key_store = Arc::new(parking_lot::RwLock::new(api_key_store));

    // 构建代理配置（共享，支持热更新）
    let proxy_config = config.proxy_url.as_ref().map(|url| {
        let mut proxy = http_client::ProxyConfig::new(url);
        if let (Some(username), Some(password)) = (&config.proxy_username, &config.proxy_password) {
            proxy = proxy.with_auth(username, password);
        }
        proxy
    });

    if proxy_config.is_some() {
        tracing::info!("已配置 HTTP 代理: {}", config.proxy_url.as_ref().unwrap());
    }

    let shared_proxy = http_client::SharedProxy::new(proxy_config);

    // 创建 MultiTokenManager 和 KiroProvider
    let token_manager = MultiTokenManager::new(
        config.clone(),
        credentials_list.clone(),
        shared_proxy.clone(),
        Some(credentials_path.into()),
        is_multiple_format,
    )
    .unwrap_or_else(|e| {
        tracing::error!("创建 Token 管理器失败: {}", e);
        std::process::exit(1);
    });
    let token_manager = Arc::new(token_manager);
    let kiro_provider = KiroProvider::with_proxy(token_manager.clone(), shared_proxy.clone());
    // 为 Admin API 连通性测试创建独立的 KiroProvider（共享 token_manager 和 proxy）
    let kiro_provider_admin = Arc::new(
        KiroProvider::with_proxy(token_manager.clone(), shared_proxy.clone()),
    );

    // 初始化 count_tokens 配置
    token::init_config(token::CountTokensConfig {
        api_url: config.count_tokens_api_url.clone(),
        api_key: config.count_tokens_api_key.clone(),
        auth_type: config.count_tokens_auth_type.clone(),
        proxy: shared_proxy.clone(),
        tls_backend: config.tls_backend,
    });

    // 创建 Token 使用量追踪器
    let token_usage_tracker = Arc::new(token_usage::TokenUsageTracker::new(
        token_manager.cache_dir().map(|d| d.to_path_buf()),
    ));

    // 创建同步管理器
    let sync_manager = Arc::new(sync::SyncManager::new(&config));

    // 如果启用了同步，启动同步服务（在后台任务中）
    if sync_manager.is_enabled() {
        let sync_manager_clone = sync_manager.clone();
        let credentials_for_sync = credentials_list.clone();
        let token_manager_for_sync = token_manager.clone();

        // 使用 tokio::task::spawn 而不是 tokio::spawn
        tokio::task::spawn(async move {
            // 添加小延迟确保 tokio runtime 完全启动
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            let device_name = hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "kiro-rs".to_string());

            // 更新凭据数据
            sync_manager_clone.update_credentials(credentials_for_sync);

            if let Err(e) = sync_manager_clone.clone().start(device_name, token_manager_for_sync).await {
                tracing::error!("启动同步服务失败: {}", e);
            } else {
                tracing::info!("同步服务已启动");
            }
        });
    } else {
        tracing::info!("同步功能未启用");
    }

    // 构建 Anthropic API 路由（从第一个凭据获取 profile_arn）
    let anthropic_app = anthropic::create_router_with_provider(
        api_key_store.clone(),
        Some(kiro_provider),
        first_credentials.profile_arn.clone(),
        Some(token_usage_tracker.clone()),
    );

    // 构建 User API 路由（始终启用，通过用户自身 API Key 认证）
    let user_api_state = user_api::UserApiState {
        api_key_store: api_key_store.clone(),
        token_usage_tracker: token_usage_tracker.clone(),
        kiro_provider: Some(kiro_provider_admin.clone()),
        profile_arn: first_credentials.profile_arn.clone(),
    };
    let user_api_app = user_api::create_user_api_router(user_api_state);
    let user_ui_app = user_ui::create_user_ui_router();

    // 构建 Admin API 路由（如果配置了非空的 admin_api_key）
    // 安全检查：空字符串被视为未配置，防止空 key 绕过认证
    let admin_key_valid = config
        .admin_api_key
        .as_ref()
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false);

    let app = if let Some(admin_key) = &config.admin_api_key {
        if admin_key.trim().is_empty() {
            tracing::warn!("admin_api_key 配置为空，Admin API 未启用");
            anthropic_app
        } else {
            let admin_service = admin::AdminService::new(token_manager.clone());
            let admin_state = admin::AdminState::new(admin_key, admin_service)
                .with_token_usage_tracker(token_usage_tracker.clone())
                .with_api_key_store(api_key_store.clone())
                .with_shared_proxy(shared_proxy.clone())
                .with_kiro_provider(kiro_provider_admin.clone())
                .with_profile_arn(first_credentials.profile_arn.clone())
                .with_sync_manager(sync_manager.clone());
            let admin_app = admin::create_admin_router(admin_state);

            // 创建 Admin UI 路由
            let admin_ui_app = admin_ui::create_admin_ui_router();

            tracing::info!("Admin API 已启用");
            tracing::info!("Admin UI 已启用: /admin");
            anthropic_app
                .nest("/api/admin", admin_app)
                .nest("/admin", admin_ui_app)
                .route("/admin/", get(|| async { Redirect::permanent("/admin") }))
                .nest("/api/user", user_api_app)
                .nest("/user", user_ui_app)
        }
    } else {
        anthropic_app
            .nest("/api/user", user_api_app)
            .nest("/user", user_ui_app)
    };

    // 启动服务器
    let addr = format!("{}:{}", config.host, config.port);
    let api_key_count = api_key_store.read().list().len();
    tracing::info!("启动 Anthropic API 端点: {}", addr);
    tracing::info!("已加载 {} 个 API Key", api_key_count);
    tracing::info!("可用 API:");
    tracing::info!("  GET  /v1/models");
    tracing::info!("  POST /v1/messages");
    tracing::info!("  POST /v1/messages/count_tokens");
    if admin_key_valid {
        tracing::info!("Admin API:");
        tracing::info!("  GET  /api/admin/credentials");
        tracing::info!("  POST /api/admin/credentials/:index/disabled");
        tracing::info!("  POST /api/admin/credentials/:index/priority");
        tracing::info!("  POST /api/admin/credentials/:index/reset");
        tracing::info!("  GET  /api/admin/credentials/:index/balance");
        tracing::info!("  GET  /api/admin/token-usage");
        tracing::info!("  POST /api/admin/token-usage/reset");
        tracing::info!("  GET  /api/admin/api-keys");
        tracing::info!("  POST /api/admin/api-keys");
        tracing::info!("  GET  /api/admin/api-keys/:id");
        tracing::info!("  PUT  /api/admin/api-keys/:id");
        tracing::info!("  DELETE /api/admin/api-keys/:id");
        tracing::info!("Admin UI:");
        tracing::info!("  GET  /admin");
    }
    tracing::info!("User API:");
    tracing::info!("  GET  /api/user/usage");
    tracing::info!("User UI:");
    tracing::info!("  GET  /user");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}
