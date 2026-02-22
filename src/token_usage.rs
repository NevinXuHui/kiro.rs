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

/// 持久化 debounce 间隔（秒）
const SAVE_DEBOUNCE_SECS: u64 = 30;

/// 持久化文件名
const USAGE_FILE_NAME: &str = "kiro_token_usage.json";

/// 最大保留的历史记录数量
const MAX_RECENT_REQUESTS: usize = 10000;

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
    /// 客户端 IP 地址（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_ip: Option<String>,
    /// 用户输入内容（可选，截断到前 500 字符）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_input: Option<String>,
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

/// 时间维度枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeGranularity {
    Hour,
    Day,
    Week,
}

impl TimeGranularity {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "hour" => Some(Self::Hour),
            "day" => Some(Self::Day),
            "week" => Some(Self::Week),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Hour => "hour",
            Self::Day => "day",
            Self::Week => "week",
        }
    }
}

/// 时间段统计数据
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRangeStats {
    /// 时间标识（ISO 8601 格式）
    pub time_key: String,
    /// 输入 tokens
    pub input_tokens: i64,
    /// 输出 tokens
    pub output_tokens: i64,
    /// 请求次数
    pub requests: u64,
}

/// 时间聚合响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageTimeSeriesResponse {
    /// 时间维度
    pub granularity: String,
    /// 时间序列数据
    pub data: Vec<TimeRangeStats>,
    /// 总输入 tokens
    pub total_input_tokens: i64,
    /// 总输出 tokens
    pub total_output_tokens: i64,
    /// 总请求次数
    pub total_requests: u64,
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
        client_ip: Option<String>,
        user_input: Option<String>,
    ) {
        let record = TokenUsageRecord {
            timestamp: Utc::now().to_rfc3339(),
            model: model.clone(),
            credential_id,
            api_key_id,
            input_tokens,
            output_tokens,
            client_ip,
            user_input,
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

            // 记录最近请求
            stats.recent_requests.push_back(record);

            // 限制历史记录数量，超出时删除最旧的记录
            while stats.recent_requests.len() > MAX_RECENT_REQUESTS {
                stats.recent_requests.pop_front();
            }
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

    /// 获取指定 API Key 的统计数据
    pub fn get_stats_for_api_key(&self, api_key_id: u64) -> TokenUsageResponse {
        let stats = self.stats.lock();
        let key_str = api_key_id.to_string();

        // 该 Key 的聚合统计（来自全量累计，准确值）
        let key_stats = stats.by_api_key.get(&key_str).cloned().unwrap_or_default();

        // 从最近请求中过滤该 Key 的记录
        let recent: Vec<_> = stats
            .recent_requests
            .iter()
            .filter(|r| r.api_key_id == Some(api_key_id))
            .cloned()
            .collect();

        // 从过滤后的最近请求重新计算按模型/凭据分组（近似值）
        let mut by_model: HashMap<String, GroupTokenStats> = HashMap::new();
        let mut by_credential: HashMap<String, GroupTokenStats> = HashMap::new();
        for r in &recent {
            let m = by_model.entry(r.model.clone()).or_default();
            m.input_tokens += r.input_tokens as i64;
            m.output_tokens += r.output_tokens as i64;
            m.requests += 1;

            let c = by_credential
                .entry(r.credential_id.to_string())
                .or_default();
            c.input_tokens += r.input_tokens as i64;
            c.output_tokens += r.output_tokens as i64;
            c.requests += 1;
        }

        TokenUsageResponse {
            total_input_tokens: key_stats.input_tokens,
            total_output_tokens: key_stats.output_tokens,
            total_requests: key_stats.requests,
            by_credential,
            by_model,
            by_api_key: HashMap::new(),
            recent_requests: recent,
        }
    }

    /// 获取时间序列统计数据
    pub fn get_timeseries_stats(&self, granularity: TimeGranularity) -> TokenUsageTimeSeriesResponse {
        use chrono::{DateTime, Datelike, Duration, IsoWeek};

        let stats = self.stats.lock();
        let mut aggregated: HashMap<String, TimeRangeStats> = HashMap::new();

        // 遍历所有最近请求，按时间维度聚合
        for record in stats.recent_requests.iter() {
            // 解析时间戳
            let dt = match DateTime::parse_from_rfc3339(&record.timestamp) {
                Ok(dt) => dt.with_timezone(&chrono::Utc),
                Err(_) => continue, // 跳过无效时间戳
            };

            // 根据时间维度生成 time_key
            let time_key = match granularity {
                TimeGranularity::Hour => {
                    // 截断到小时边界
                    dt.format("%Y-%m-%dT%H:00:00Z").to_string()
                }
                TimeGranularity::Day => {
                    // 截断到日期边界
                    dt.format("%Y-%m-%dT00:00:00Z").to_string()
                }
                TimeGranularity::Week => {
                    // 计算周一日期作为周标识（ISO 8601）
                    let _iso_week: IsoWeek = dt.iso_week();

                    // 计算该周的周一日期
                    let days_from_monday = dt.weekday().num_days_from_monday();
                    let monday = dt - Duration::days(days_from_monday as i64);
                    monday.format("%Y-%m-%dT00:00:00Z").to_string()
                }
            };

            // 聚合数据
            let entry = aggregated.entry(time_key.clone()).or_insert_with(|| TimeRangeStats {
                time_key,
                input_tokens: 0,
                output_tokens: 0,
                requests: 0,
            });

            entry.input_tokens += record.input_tokens as i64;
            entry.output_tokens += record.output_tokens as i64;
            entry.requests += 1;
        }

        // 转换为 Vec 并按时间倒序排列（最新在前）
        let mut data: Vec<TimeRangeStats> = aggregated.into_values().collect();
        data.sort_by(|a, b| b.time_key.cmp(&a.time_key));

        // 限制返回的数据点数量
        let limit = match granularity {
            TimeGranularity::Hour => 48,  // 最近 48 小时
            TimeGranularity::Day => 30,   // 最近 30 天
            TimeGranularity::Week => 12,  // 最近 12 周
        };
        data.truncate(limit);

        // 计算总计
        let total_input_tokens = data.iter().map(|d| d.input_tokens).sum();
        let total_output_tokens = data.iter().map(|d| d.output_tokens).sum();
        let total_requests = data.iter().map(|d| d.requests).sum();

        TokenUsageTimeSeriesResponse {
            granularity: granularity.as_str().to_string(),
            data,
            total_input_tokens,
            total_output_tokens,
            total_requests,
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
            Ok(loaded) => {
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
