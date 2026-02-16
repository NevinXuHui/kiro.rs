//! Socket.IO 设备连接管理

use anyhow::{Context, Result};
use futures::FutureExt;
use rust_socketio::{
    asynchronous::{Client, ClientBuilder},
    Payload,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// 设备注册信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub token: String,
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_type: Option<String>,
}

/// 设备注册响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRegisteredResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 在线设备信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineDevice {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    pub user_id: u64,
    pub user_email: String,
    pub connected_at: u64,
    pub last_heartbeat: u64,
    pub socket_id: String,
}

/// 设备列表更新
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicesUpdate {
    pub devices: Vec<OnlineDevice>,
    pub count: usize,
}

/// Socket.IO 客户端状态
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Registered,
    Error(String),
}

/// Socket.IO 设备客户端
#[derive(Clone)]
pub struct DeviceClient {
    server_url: String,
    device_info: Arc<RwLock<Option<DeviceInfo>>>,
    state: Arc<RwLock<ConnectionState>>,
    heartbeat_interval: Duration,
    client: Arc<RwLock<Option<Client>>>,
}

impl DeviceClient {
    /// 创建新的设备客户端
    pub fn new(server_url: String, heartbeat_interval: Duration) -> Self {
        Self {
            server_url,
            device_info: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(ConnectionState::Disconnected)),
            heartbeat_interval,
            client: Arc::new(RwLock::new(None)),
        }
    }

    /// 连接并注册设备
    pub async fn connect_and_register(&self, device_info: DeviceInfo) -> Result<()> {
        *self.device_info.write().await = Some(device_info.clone());
        *self.state.write().await = ConnectionState::Connecting;

        tracing::info!("连接到 Socket.IO 服务器: {}", self.server_url);

        let state = self.state.clone();
        let state_for_error = self.state.clone();
        let state_for_update = self.state.clone();

        // 构建 Socket.IO 客户端
        let client = ClientBuilder::new(&self.server_url)
            .on("connect", move |_payload, _client| {
                async move {
                    tracing::info!("Socket.IO 连接成功");
                }
                .boxed()
            })
            .on("device:registered", {
                let state = state.clone();
                move |payload, _client| {
                    let state = state.clone();
                    async move {
                        tracing::debug!("收到 device:registered 事件: {:?}", payload);
                        match payload {
                            Payload::Text(values) => {
                                if let Some(value) = values.first() {
                                    if let Ok(response) = serde_json::from_value::<DeviceRegisteredResponse>(value.clone()) {
                                        if response.success {
                                            *state.write().await = ConnectionState::Registered;
                                            tracing::info!("设备注册成功");
                                        } else {
                                            let error = response.error.unwrap_or_else(|| "未知错误".to_string());
                                            *state.write().await = ConnectionState::Error(error.clone());
                                            tracing::error!("设备注册失败: {}", error);
                                        }
                                    }
                                }
                            }
                            _ => {
                                tracing::warn!("收到非预期的 payload 类型");
                            }
                        }
                    }
                    .boxed()
                }
            })
            .on("device:error", {
                let state = state_for_error.clone();
                move |payload, _client| {
                    let state = state.clone();
                    async move {
                        tracing::error!("收到 device:error 事件: {:?}", payload);
                        match payload {
                            Payload::Text(values) => {
                                if let Some(value) = values.first() {
                                    if let Some(msg) = value.get("message").and_then(|v| v.as_str()) {
                                        *state.write().await = ConnectionState::Error(msg.to_string());
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    .boxed()
                }
            })
            .on("devices:update", {
                move |payload, _client| {
                    async move {
                        match payload {
                            Payload::Text(values) => {
                                if let Some(value) = values.first() {
                                    if let Ok(update) = serde_json::from_value::<DevicesUpdate>(value.clone()) {
                                        tracing::debug!("收到设备列表更新: {} 个在线设备", update.count);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    .boxed()
                }
            })
            .on("error", {
                let state = state_for_update.clone();
                move |payload, _client| {
                    let state = state.clone();
                    async move {
                        tracing::error!("Socket.IO 错误: {:?}", payload);
                        *state.write().await = ConnectionState::Error("连接错误".to_string());
                    }
                    .boxed()
                }
            })
            .connect()
            .await
            .context("Socket.IO 连接失败")?;

        *self.state.write().await = ConnectionState::Connected;
        *self.client.write().await = Some(client.clone());

        tracing::info!("Socket.IO 客户端已连接，准备发送注册请求");

        // 等待一小段时间确保连接稳定
        tokio::time::sleep(Duration::from_millis(100)).await;

        // 发送设备注册消息
        let mut register_data = json!({
            "token": device_info.token,
            "deviceId": device_info.device_id,
            "deviceName": device_info.device_name,
            "deviceType": device_info.device_type,
        });

        // 添加账号类型（如果有）
        if let Some(account_type) = &device_info.account_type {
            register_data["accountType"] = json!(account_type);
        }

        tracing::debug!("发送注册数据: {}", register_data);

        client
            .emit("device:register", register_data)
            .await
            .context("发送注册消息失败")?;

        tracing::info!("已发送设备注册请求");

        // 等待注册响应（最多等待 5 秒）
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let current_state = self.state.read().await.clone();
            if matches!(current_state, ConnectionState::Registered) {
                break;
            }
            if matches!(current_state, ConnectionState::Error(_)) {
                anyhow::bail!("设备注册失败");
            }
        }

        // 启动心跳任务
        let client_clone = client.clone();
        let device_id = device_info.device_id.clone();
        let heartbeat_interval = self.heartbeat_interval;
        let state_clone = self.state.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(heartbeat_interval);
            loop {
                interval.tick().await;

                // 检查连接状态
                let current_state = state_clone.read().await.clone();
                if !matches!(current_state, ConnectionState::Registered) {
                    tracing::debug!("设备未注册，停止心跳");
                    break;
                }

                // 发送心跳
                let heartbeat_data = json!({
                    "deviceId": device_id,
                });

                if let Err(e) = client_clone
                    .emit("device:heartbeat", heartbeat_data)
                    .await
                {
                    tracing::error!("发送心跳失败: {}", e);
                    *state_clone.write().await = ConnectionState::Error(e.to_string());
                    break;
                }

                tracing::debug!("已发送心跳");
            }
        });

        Ok(())
    }

    /// 获取当前连接状态
    pub async fn get_state(&self) -> ConnectionState {
        self.state.read().await.clone()
    }

    /// 检查是否已连接并注册
    pub async fn is_registered(&self) -> bool {
        matches!(*self.state.read().await, ConnectionState::Registered)
    }

    /// 断开连接
    pub async fn disconnect(&self) -> Result<()> {
        if let Some(client) = self.client.write().await.take() {
            client.disconnect().await?;
            *self.state.write().await = ConnectionState::Disconnected;
            tracing::info!("已断开 Socket.IO 连接");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_client_creation() {
        let client = DeviceClient::new(
            "http://localhost:3000".to_string(),
            Duration::from_secs(15),
        );

        assert_eq!(client.server_url, "http://localhost:3000");
        assert_eq!(client.heartbeat_interval, Duration::from_secs(15));
    }

    #[tokio::test]
    async fn test_device_client_initial_state() {
        let client = DeviceClient::new(
            "http://localhost:3000".to_string(),
            Duration::from_secs(15),
        );

        let state = client.get_state().await;
        assert_eq!(state, ConnectionState::Disconnected);
        assert!(!client.is_registered().await);
    }
}
