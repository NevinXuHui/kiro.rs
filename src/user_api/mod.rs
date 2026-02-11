//! 用户 API 模块
//!
//! 提供面向终端用户的 API 端点，通过用户自身的 API Key 认证。
//! 与 Admin API 不同，此模块不需要管理员权限。

mod handlers;
mod router;

pub use router::{UserApiState, create_user_api_router};
