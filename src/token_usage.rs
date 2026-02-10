//! Token 使用量统计模块
//!
//! 记录每次 API 请求的 input_tokens / output_tokens，
//! 提供全局总计、按凭据分组、按模型分组和最近请求列表。
//!
//! 持久化策略：debounced 写入 JSON 文件（30s 间隔），
//! 参照 `kiro_stats.json` 的模式。

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use chrono::Utc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

/// 最近请求列表的最大条目数
const MAX_RECENT_REQUESTS: usize = 200;

/// 持久化 debounce 间隔（秒）
const SAVE_DEBOUNCE_SECS: u64 = 30;

/// 持久化文件名
const USAGE_FILE_NAME: &str = "kiro_token_usage.json";

// ============ 持久化数据结构 ============

/// 单条请求的 token 使用记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageRecord {
    /// 请求时间（RFC3339 格式）
    pub timestamp: String,
    /// 请求的模型名称
    pub model: String,
    /// 使用的凭据 ID
    pub credential_id: u64,
    /// 使用的 API Key ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_id: Option<u64>,
    /// 输入 tokens
    pub input_tokens: i32,
    /// 输出 tokens
    pub output_tokens: i32,
}

/// 分组统计（按凭据或按模型）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupTokenStats {
    /// 输入 tokens 总计
    pub input_tokens: i64,
    /// 输出 tokens 总计
    pub output_tokens: i64,
    /// 请求次数
    pub requests: u64,
}

/// 持久化的统计数据
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedStats {
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_requests: u64,
    by_credential: HashMap<String, GroupTokenStats>,
    by_model: HashMap<String, GroupTokenStats>,
    by_api_key: HashMap<String, GroupTokenStats>,
    recent_requests: VecDeque<TokenUsageRecord>,
}

// ============ API 响应类型 ============

/// Token 使用统计响应（返回给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageResponse {
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_requests: u64,
    pub by_credential: HashMap<String, GroupTokenStats>,
    pub by_model: HashMap<String, GroupTokenStats>,
    pub by_api_key: HashMap<String, GroupTokenStats>,
    pub recent_requests: Vec<TokenUsageRecord>,
}

// ============ Tracker 核心 ============

/// Token 使用量追踪器
///
/// 线程安全，通过 `Arc<TokenUsageTracker>` 在多个 handler 间共享。
/// `record()` 方法仅做内存操作（微秒级），不阻塞请求。
pub struct TokenUsageTracker {
    stats: Mutex<PersistedStats>,
    file_path: Option<PathBuf>,
    dirty: AtomicBool,
    last_save: Mutex<Option<Instant>>,
}

impl TokenUsageTracker {
    /// 创建新的 tracker 实例
    ///
    /// `cache_dir` 为 None 时仅做内存统计，不持久化。
    pub fn new(cache_dir: Option<PathBuf>) -> Self {
        let file_path = cache_dir.map(|d| d.join(USAGE_FILE_NAME));
        let mut tracker = Self {
            stats: Mutex::new(PersistedStats::default()),
            file_path,
            dirty: AtomicBool::new(false),
            last_save: Mutex::new(None),
        };
        tracker.load();
        tracker
    }

    /// 记录一次请求的 token 使用量
    ///
    /// 仅做内存操作（parking_lot::Mutex 锁内累加），微秒级完成。
    /// 文件写入通过 debounce 策略延迟执行，不阻塞调用方。
    pub fn record(
        &self,
        model: String,
        credential_id: u64,
        input_tokens: i32,
        output_tokens: i32,
        api_key_id: Option<u64>,
    ) {
        let record = TokenUsageRecord {
            timestamp: Utc::now().to_rfc3339(),
            model: model.clone(),
            credential_id,
            api_key_id,
            input_tokens,
            output_tokens,
        };

        {
            let mut stats = self.stats.lock();

            // 全局总计
            stats.total_input_tokens += input_tokens as i64;
            stats.total_output_tokens += output_tokens as i64;
            stats.total_requests += 1;

            // 按凭据分组
            let cred_stats = stats
                .by_credential
                .entry(credential_id.to_string())
                .or_default();
            cred_stats.input_tokens += input_tokens as i64;
            cred_stats.output_tokens += output_tokens as i64;
            cred_stats.requests += 1;

            // 按模型分组
            let model_stats = stats.by_model.entry(model).or_default();
            model_stats.input_tokens += input_tokens as i64;
            model_stats.output_tokens += output_tokens as i64;
            model_stats.requests += 1;

            // 按 API Key 分组
            if let Some(key_id) = api_key_id {
                let key_stats = stats
                    .by_api_key
                    .entry(key_id.to_string())
                    .or_default();
                key_stats.input_tokens += input_tokens as i64;
                key_stats.output_tokens += output_tokens as i64;
                key_stats.requests += 1;
            }

            // 最近请求（环形缓冲）
            if stats.recent_requests.len() >= MAX_RECENT_REQUESTS {
                stats.recent_requests.pop_front();
            }
            stats.recent_requests.push_back(record);
        }
        // 锁已释放，尝试 debounced 持久化
        self.save_debounced();
    }

    /// 获取当前统计数据（用于 API 响应）
    pub fn get_stats(&self) -> TokenUsageResponse {
        let stats = self.stats.lock();
        TokenUsageResponse {
            total_input_tokens: stats.total_input_tokens,
            total_output_tokens: stats.total_output_tokens,
            total_requests: stats.total_requests,
            by_credential: stats.by_credential.clone(),
            by_model: stats.by_model.clone(),
            by_api_key: stats.by_api_key.clone(),
            recent_requests: stats.recent_requests.iter().cloned().collect(),
        }
    }

    /// 重置所有统计数据
    pub fn reset(&self) {
        {
            let mut stats = self.stats.lock();
            *stats = PersistedStats::default();
        }
        self.dirty.store(true, Ordering::Relaxed);
        self.save();
    }

    // ============ 持久化 ============

    /// 从磁盘加载统计数据
    fn load(&mut self) {
        let path = match &self.file_path {
            Some(p) => p,
            None => return,
        };

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return, // 首次运行时文件不存在
        };

        match serde_json::from_str::<PersistedStats>(&content) {
            Ok(mut loaded) => {
                // 限制 recent_requests 大小（防止旧文件过大）
                while loaded.recent_requests.len() > MAX_RECENT_REQUESTS {
                    loaded.recent_requests.pop_front();
                }
                *self.stats.lock() = loaded;
                *self.last_save.lock() = Some(Instant::now());
                self.dirty.store(false, Ordering::Relaxed);
                tracing::info!("已加载 token 使用统计");
            }
            Err(e) => {
                tracing::warn!("解析 token 使用统计失败，将忽略: {}", e);
            }
        }
    }

    /// 将统计数据持久化到磁盘
    fn save(&self) {
        let path = match &self.file_path {
            Some(p) => p,
            None => return,
        };

        let json = {
            let stats = self.stats.lock();
            match serde_json::to_string_pretty(&*stats) {
                Ok(j) => j,
                Err(e) => {
                    tracing::warn!("序列化 token 使用统计失败: {}", e);
                    return;
                }
            }
        };

        if let Err(e) = std::fs::write(path, json) {
            tracing::warn!("保存 token 使用统计失败: {}", e);
        } else {
            *self.last_save.lock() = Some(Instant::now());
            self.dirty.store(false, Ordering::Relaxed);
        }
    }

    /// Debounced 持久化：仅当距上次保存超过 30s 时才写入
    fn save_debounced(&self) {
        self.dirty.store(true, Ordering::Relaxed);

        let should_flush = {
            let last = self.last_save.lock();
            match *last {
                None => true,
                Some(t) => t.elapsed().as_secs() >= SAVE_DEBOUNCE_SECS,
            }
        };

        if should_flush {
            self.save();
        }
    }
}

impl Drop for TokenUsageTracker {
    fn drop(&mut self) {
        if self.dirty.load(Ordering::Relaxed) {
            self.save();
        }
    }
}
