//! 账户信息数据模型
//!
//! 包含 getAccount API 的响应类型定义

use serde::Deserialize;

/// 账户信息查询响应
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountResponse {
    /// 用户邮箱
    #[serde(default)]
    pub email: Option<String>,

    /// 账户 ID
    #[serde(default)]
    pub account_id: Option<String>,

    /// 用户名
    #[serde(default)]
    pub username: Option<String>,
}
