//! 同步相关的数据类型定义

use serde::{Deserialize, Serialize};

/// 同步变更响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncChangesResponse {
    /// 服务器当前同步版本号
    pub current_version: u64,
    /// Token 变更
    pub tokens: EntityChanges<TokenSync>,
    /// Token 使用量变更
    pub token_usage: EntityChanges<TokenUsageSync>,
    /// Token 订阅变更
    pub token_subscriptions: EntityChanges<TokenSubscriptionSync>,
    /// Token 奖励变更
    pub token_bonuses: EntityChanges<TokenBonusSync>,
}

/// 实体变更（包含更新和删除）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityChanges<T> {
    /// 新增或更新的记录
    pub updated: Vec<T>,
    /// 已删除的记录 ID 列表
    pub deleted: Vec<u64>,
}

/// Token 同步数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TokenSync {
    pub id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    pub sync_version: u64,
}

/// Token 使用量同步数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TokenUsageSync {
    pub token_id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_usage: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent_used: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_current: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_trial_limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_trial_current: Option<i64>,
}

/// Token 订阅同步数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TokenSubscriptionSync {
    pub token_id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub days_remaining: Option<i32>,
}

/// Token 奖励同步数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TokenBonusSync {
    pub token_id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_usage: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_limit: Option<i64>,
}

/// 推送变更请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushChangesRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<Vec<TokenSync>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<Vec<TokenUsageSync>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_subscriptions: Option<Vec<TokenSubscriptionSync>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_bonuses: Option<Vec<TokenBonusSync>>,
}

/// 推送变更响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushChangesResponse {
    /// 冲突的记录 ID 列表
    pub conflicts: Vec<u64>,
    /// 服务器当前同步版本号
    pub current_version: u64,
}

/// 同步版本响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncVersionResponse {
    pub current_version: u64,
}

/// 删除响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct DeleteResponse {
    pub message: String,
    pub current_version: u64,
}

/// 设备命令（服务器推送到客户端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DeviceCommand {
    AddCredential {
        credential: crate::kiro::model::credentials::KiroCredentials,
        command_id: String,
    },
    DeleteCredential {
        credential_id: u64,
        command_id: String,
    },
    SetDisabled {
        credential_id: u64,
        disabled: bool,
        command_id: String,
    },
}

/// 命令执行响应
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse {
    pub command_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// 在线设备信息（从服务器 API 返回）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineDeviceInfo {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    pub account_type: String,
    pub user_id: u64,
    pub user_email: String,
    pub connected_at: u64,
    pub last_heartbeat: u64,
}

/// 设备列表响应
#[derive(Debug, Deserialize)]
pub struct DevicesResponse {
    pub devices: Vec<OnlineDeviceInfo>,
    pub count: usize,
}

/// 推送凭证结果
#[derive(Debug, Deserialize)]
pub struct PushCredentialResult {
    pub success: bool,
    pub command_id: String,
    pub message: String,
}
