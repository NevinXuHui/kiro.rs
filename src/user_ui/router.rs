//! User UI 路由 - 提供内嵌的用户页面

use axum::{Router, response::Html, routing::get};

/// 用户页面 HTML（内嵌，无需构建步骤）
const USER_PAGE_HTML: &str = include_str!("page.html");

/// 创建 User UI 路由
pub fn create_user_ui_router() -> Router {
    Router::new()
        .route("/", get(|| async { Html(USER_PAGE_HTML) }))
}
