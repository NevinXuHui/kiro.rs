//! API Key 存储管理模块
//!
//! 支持多个 API Key，每个 Key 带标签、权限控制和独立统计。
//! 持久化到 `api_keys.json` 文件，支持从旧 config.json 的单 `apiKey` 自动迁移。

use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::common::auth;

/// 持久化文件名
const API_KEYS_FILE: &str = "api_keys.json";

// ============ 数据结构 ============

/// 单个 API Key 条目（持久化）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyEntry {
    /// 唯一 ID
    pub id: u64,
    /// 实际 Key 值
    pub key: String,
    /// 用途标签（如 "Claude Code"、"Cursor"）
    pub label: String,
    /// 只读模式（仅允许 GET /v1/models）
    #[serde(default)]
    pub read_only: bool,
    /// 模型白名单（None = 允许全部模型）
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_models: Option<Vec<String>>,
    /// 是否禁用
    #[serde(default)]
    pub disabled: bool,
    /// 创建时间（RFC3339）
    pub created_at: String,
}

/// 传递给 Handler 的轻量认证信息（不含 key 值）
#[derive(Debug, Clone)]
pub struct ApiKeyInfo {
    pub id: u64,
    pub label: String,
    pub read_only: bool,
    pub allowed_models: Option<Vec<String>>,
}

/// API Key 视图（用于 API 响应，key 脱敏）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyEntryView {
    pub id: u64,
    /// 脱敏后的 Key
    pub key: String,
    /// 完整 Key（用于复制）
    pub full_key: String,
    /// Key 长度
    pub key_length: usize,
    pub label: String,
    pub read_only: bool,
    pub allowed_models: Option<Vec<String>>,
    pub disabled: bool,
    pub created_at: String,
}

/// 持久化的 Key 列表
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedApiKeys {
    next_id: u64,
    entries: Vec<ApiKeyEntry>,
}

// ============ ApiKeyStore ============

/// API Key 存储
///
/// 管理多个 API Key 的 CRUD、认证和持久化。
/// 通过 `Arc<RwLock<ApiKeyStore>>` 在 AppState 和 AdminState 间共享。
pub struct ApiKeyStore {
    data: PersistedApiKeys,
    file_path: Option<PathBuf>,
}

impl ApiKeyStore {
    /// 加载或从旧配置迁移
    ///
    /// 1. 尝试从 `api_keys.json` 加载
    /// 2. 若不存在但有旧 `apiKey`，自动迁移
    /// 3. 都没有则创建空 store
    pub fn load_or_migrate(config_dir: Option<&Path>, legacy_api_key: Option<&str>) -> Self {
        let file_path = config_dir.map(|d| d.join(API_KEYS_FILE));

        // 尝试从文件加载
        if let Some(ref path) = file_path {
            if path.exists() {
                if let Ok(content) = std::fs::read_to_string(path) {
                    if let Ok(data) = serde_json::from_str::<PersistedApiKeys>(&content) {
                        tracing::info!("已加载 {} 个 API Key", data.entries.len());
                        return Self { data, file_path };
                    } else {
                        tracing::warn!("解析 api_keys.json 失败，将重新创建");
                    }
                }
            }
        }

        // 文件不存在，尝试从旧 apiKey 迁移
        let mut store = Self {
            data: PersistedApiKeys {
                next_id: 1,
                entries: Vec::new(),
            },
            file_path,
        };

        if let Some(key) = legacy_api_key {
            if !key.trim().is_empty() {
                let entry = ApiKeyEntry {
                    id: 1,
                    key: key.to_string(),
                    label: "Default".to_string(),
                    read_only: false,
                    allowed_models: None,
                    disabled: false,
                    created_at: Utc::now().to_rfc3339(),
                };
                store.data.entries.push(entry);
                store.data.next_id = 2;
                store.save();
                tracing::info!("已从 config.json apiKey 迁移创建默认 API Key");
            }
        }

        store
    }

    // ============ 认证 ============

    /// 认证请求中的 API Key
    ///
    /// 遍历所有未禁用的 Key，使用常量时间比较防止时序攻击。
    /// 返回匹配的 `ApiKeyInfo`（不含 key 值）。
    pub fn authenticate(&self, key: &str) -> Option<ApiKeyInfo> {
        for entry in &self.data.entries {
            if !entry.disabled && auth::constant_time_eq(key, &entry.key) {
                return Some(ApiKeyInfo {
                    id: entry.id,
                    label: entry.label.clone(),
                    read_only: entry.read_only,
                    allowed_models: entry.allowed_models.clone(),
                });
            }
        }
        None
    }

    /// 检查 store 是否为空（无任何 Key）
    pub fn is_empty(&self) -> bool {
        self.data.entries.is_empty()
    }

    // ============ CRUD ============

    /// 列出所有 Key（脱敏）
    pub fn list(&self) -> Vec<ApiKeyEntryView> {
        self.data
            .entries
            .iter()
            .map(|e| self.to_view(e))
            .collect()
    }

    /// 查询单个 Key（脱敏）
    pub fn get(&self, id: u64) -> Option<ApiKeyEntryView> {
        self.data
            .entries
            .iter()
            .find(|e| e.id == id)
            .map(|e| self.to_view(e))
    }

    /// 添加新 Key，返回分配的 ID
    pub fn add(&mut self, key: String, label: String, read_only: bool, allowed_models: Option<Vec<String>>) -> u64 {
        let id = self.data.next_id;
        self.data.next_id += 1;

        let entry = ApiKeyEntry {
            id,
            key,
            label,
            read_only,
            allowed_models,
            disabled: false,
            created_at: Utc::now().to_rfc3339(),
        };
        self.data.entries.push(entry);
        self.save();
        id
    }

    /// 更新 Key 的可变字段
    pub fn update(
        &mut self,
        id: u64,
        key: Option<String>,
        label: Option<String>,
        read_only: Option<bool>,
        allowed_models: Option<Option<Vec<String>>>,
        disabled: Option<bool>,
    ) -> Result<(), String> {
        let entry = self
            .data
            .entries
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| format!("API Key #{} 不存在", id))?;

        if let Some(k) = key {
            let k = k.trim().to_string();
            if !k.is_empty() {
                entry.key = k;
            }
        }
        if let Some(l) = label {
            entry.label = l;
        }
        if let Some(r) = read_only {
            entry.read_only = r;
        }
        if let Some(m) = allowed_models {
            entry.allowed_models = m;
        }
        if let Some(d) = disabled {
            entry.disabled = d;
        }

        self.save();
        Ok(())
    }

    /// 删除 Key
    pub fn delete(&mut self, id: u64) -> Result<(), String> {
        let len_before = self.data.entries.len();
        self.data.entries.retain(|e| e.id != id);
        if self.data.entries.len() == len_before {
            return Err(format!("API Key #{} 不存在", id));
        }
        self.save();
        Ok(())
    }

    // ============ 持久化 ============

    fn save(&self) {
        let path = match &self.file_path {
            Some(p) => p,
            None => return,
        };

        match serde_json::to_string_pretty(&self.data) {
            Ok(json) => {
                if let Err(e) = std::fs::write(path, json) {
                    tracing::error!("保存 api_keys.json 失败: {}", e);
                }
            }
            Err(e) => {
                tracing::error!("序列化 api_keys.json 失败: {}", e);
            }
        }
    }

    // ============ 辅助 ============

    fn to_view(&self, entry: &ApiKeyEntry) -> ApiKeyEntryView {
        ApiKeyEntryView {
            id: entry.id,
            key: mask_key(&entry.key),
            full_key: entry.key.clone(),
            key_length: entry.key.len(),
            label: entry.label.clone(),
            read_only: entry.read_only,
            allowed_models: entry.allowed_models.clone(),
            disabled: entry.disabled,
            created_at: entry.created_at.clone(),
        }
    }
}

/// 对 Key 进行脱敏：保留前 6 位和后 3 位，中间用 *** 替代
pub fn mask_key(key: &str) -> String {
    let len = key.len();
    if len <= 9 {
        let prefix = &key[..std::cmp::min(2, len)];
        return format!("{}***", prefix);
    }
    let prefix = &key[..6];
    let suffix = &key[len - 3..];
    format!("{}***{}", prefix, suffix)
}
