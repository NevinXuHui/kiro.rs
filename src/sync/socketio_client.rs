//! 简化的 Socket.IO 客户端实现
//! 基于原生 WebSocket，兼容 Socket.IO v3/v4

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// 连接状态
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Registered,
    Error(String),
}

/// 设备信息
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

/// Socket.IO 客户端
#[derive(Clone)]
pub struct SocketIOClient {
    server_url: String,
    state: Arc<RwLock<ConnectionState>>,
    device_info: Arc<RwLock<Option<DeviceInfo>>>,
    registration_notifier: Option<tokio::sync::mpsc::Sender<()>>,
    command_sender: Option<tokio::sync::mpsc::UnboundedSender<crate::sync::types::DeviceCommand>>,
}

impl SocketIOClient {
    pub fn new(
        server_url: String,
        device_info: Arc<RwLock<Option<DeviceInfo>>>,
        registration_notifier: Option<tokio::sync::mpsc::Sender<()>>,
        command_sender: Option<tokio::sync::mpsc::UnboundedSender<crate::sync::types::DeviceCommand>>,
    ) -> Self {
        Self {
            server_url,
            state: Arc::new(RwLock::new(ConnectionState::Disconnected)),
            device_info,
            registration_notifier,
            command_sender,
        }
    }

    /// 连接并注册设备（带自动重连）
    pub async fn connect_and_register_with_retry(&self) {
        let state = self.state.clone();
        let server_url = self.server_url.clone();
        let device_info = self.device_info.clone();
        let registration_notifier = self.registration_notifier.clone();
        let command_sender = self.command_sender.clone();

        tokio::spawn(async move {
            let mut retry_delay = Duration::from_secs(1);
            let max_retry_delay = Duration::from_secs(30);
            let mut first_registration = true;

            loop {
                tracing::info!("尝试连接 Socket.IO 服务器...");

                // 每次重连时读取最新的 device_info（在 await 之前释放锁）
                let current_device_info = {
                    let guard = device_info.read();
                    guard.as_ref().cloned()
                };

                let current_device_info = match current_device_info {
                    Some(info) => info,
                    None => {
                        tracing::warn!("设备信息未设置，等待后重试");
                        tokio::time::sleep(retry_delay).await;
                        continue;
                    }
                };

                match Self::connect_once(&server_url, &current_device_info, state.clone(), registration_notifier.clone(), first_registration, command_sender.clone()).await {
                    Ok(_) => {
                        // 连接断开了，重置重试延迟和首次注册标志
                        tracing::info!("连接已断开，准备重连");
                        retry_delay = Duration::from_secs(1);
                        first_registration = false;
                    }
                    Err(e) => {
                        tracing::warn!("连接失败: {}，{}秒后重试", e, retry_delay.as_secs());
                        *state.write() = ConnectionState::Error(format!("连接失败: {}", e));
                        
                        // 指数退避，最多 30 秒
                        retry_delay = std::cmp::min(retry_delay * 2, max_retry_delay);
                    }
                }
                
                // 等待后重试
                tokio::time::sleep(retry_delay).await;
            }
        });
    }

    /// 单次连接尝试（保持连接活跃）
    async fn connect_once(
        server_url: &str,
        device_info: &DeviceInfo,
        state: Arc<RwLock<ConnectionState>>,
        registration_notifier: Option<tokio::sync::mpsc::Sender<()>>,
        is_first_registration: bool,
        command_sender: Option<tokio::sync::mpsc::UnboundedSender<crate::sync::types::DeviceCommand>>,
    ) -> Result<()> {
        *state.write() = ConnectionState::Connecting;

        // 构建 Socket.IO 握手 URL
        let ws_url = server_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");
        let handshake_url = format!("{}/socket.io/?EIO=4&transport=websocket", ws_url);

        tracing::info!("连接到 Socket.IO 服务器: {}", handshake_url);

        // 连接 WebSocket
        let (ws_stream, _) = connect_async(&handshake_url)
            .await
            .context("WebSocket 连接失败")?;

        let (mut write, mut read) = ws_stream.split();

        tracing::info!("WebSocket 连接成功");

        // 等待服务器的连接确认 (0{...})
        let _ping_interval = if let Some(Ok(Message::Text(msg))) = read.next().await {
            tracing::debug!("收到服务器消息: {}", msg);
            if !msg.starts_with('0') {
                anyhow::bail!("未收到 Socket.IO 连接确认");
            }

            // 解析 pingInterval
            let interval = if let Ok(handshake) = serde_json::from_str::<serde_json::Value>(&msg[1..]) {
                handshake.get("pingInterval")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(25000)
            } else {
                25000
            };
            Duration::from_millis(interval)
        } else {
            Duration::from_secs(25)
        };

        *state.write() = ConnectionState::Connected;

        // 发送 Socket.IO 连接包 (40)
        write.send(Message::Text("40".to_string())).await?;
        tracing::debug!("已发送 Socket.IO 连接包");

        // 等待命名空间连接确认
        if let Some(Ok(Message::Text(msg))) = read.next().await {
            tracing::debug!("收到命名空间确认: {}", msg);
        }

        // 发送设备注册事件
        let register_data = json!({
            "token": device_info.token,
            "deviceId": device_info.device_id,
            "deviceName": device_info.device_name,
            "deviceType": device_info.device_type,
            "accountType": device_info.account_type,
        });

        let event_packet = format!(
            "42{}",
            json!(["device:register", register_data]).to_string()
        );

        tracing::info!(
            "发送注册数据 - deviceId: {}, deviceName: {}, deviceType: {}",
            device_info.device_id,
            device_info.device_name,
            device_info.device_type
        );
        tracing::debug!("完整注册数据: {}", register_data);

        write.send(Message::Text(event_packet)).await?;
        tracing::info!("已发送设备注册请求");

        // 等待注册响应（最多 5 秒）
        let timeout = tokio::time::sleep(Duration::from_secs(5));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                Some(Ok(Message::Text(msg))) = read.next() => {
                    tracing::debug!("收到消息: {}", msg);

                    // 解析 Socket.IO 消息
                    if msg.starts_with("42") {
                        let json_str = &msg[2..];
                        if let Ok(arr) = serde_json::from_str::<serde_json::Value>(json_str) {
                            if let Some(event_name) = arr.get(0).and_then(|v| v.as_str()) {
                                if event_name == "device:registered" {
                                    tracing::info!("设备注册成功");
                                    *state.write() = ConnectionState::Registered;

                                    // 首次注册成功，通知 SyncManager 立即推送
                                    if is_first_registration {
                                        if let Some(ref notifier) = registration_notifier {
                                            let _ = notifier.send(()).await;
                                            tracing::debug!("已通知 SyncManager 执行首次推送");
                                        }
                                    }

                                    break;
                                } else if event_name == "device:error" {
                                    let error_msg = arr.get(1)
                                        .and_then(|v| v.get("message"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("未知错误");
                                    tracing::error!("设备注册失败: {}", error_msg);
                                    *state.write() = ConnectionState::Error(error_msg.to_string());
                                    anyhow::bail!("设备注册失败: {}", error_msg);
                                }
                            }
                        }
                    }
                }
                _ = &mut timeout => {
                    tracing::warn!("等待注册响应超时");
                    anyhow::bail!("设备注册超时");
                }
            }
        }

        // 保持连接和心跳（阻塞直到连接断开）
        let state_clone = state.clone();
        let device_id = device_info.device_id.clone();
        let heartbeat_interval = Duration::from_secs(15); // 15秒心跳间隔
        let mut heartbeat_timer = tokio::time::interval(heartbeat_interval);
        heartbeat_timer.tick().await; // 跳过第一次立即触发
        
        loop {
            tokio::select! {
                _ = heartbeat_timer.tick() => {
                    // 发送应用层心跳
                    let heartbeat_data = json!({
                        "deviceId": device_id,
                    });
                    let heartbeat_packet = format!(
                        "42{}",
                        json!(["device:heartbeat", heartbeat_data]).to_string()
                    );
                    
                    if let Err(e) = write.send(Message::Text(heartbeat_packet)).await {
                        tracing::warn!("发送心跳失败: {}", e);
                        *state_clone.write() = ConnectionState::Error("心跳失败".to_string());
                        break;
                    }
                    tracing::debug!("已发送心跳");
                }
                Some(result) = read.next() => {
                    match result {
                        Ok(Message::Text(msg)) => {
                            tracing::debug!("收到消息: {}", msg);

                            // 处理服务器的 ping (2)，回复 pong (3)
                            if msg == "2" {
                                tracing::debug!("收到服务器 ping，回复 pong");
                                if let Err(e) = write.send(Message::Text("3".to_string())).await {
                                    tracing::warn!("发送 pong 失败: {}", e);
                                    *state_clone.write() = ConnectionState::Error("心跳失败".to_string());
                                    break;
                                }
                            }

                            // 处理 Socket.IO 事件消息 (42)
                            if msg.starts_with("42") {
                                let json_str = &msg[2..];
                                if let Ok(arr) = serde_json::from_str::<serde_json::Value>(json_str) {
                                    if let Some(event_name) = arr.get(0).and_then(|v| v.as_str()) {
                                        // 处理凭据命令
                                        if event_name == "credential:command" {
                                            if let Some(command_data) = arr.get(1) {
                                                match serde_json::from_value::<crate::sync::types::DeviceCommand>(command_data.clone()) {
                                                    Ok(command) => {
                                                        tracing::info!("收到凭据命令: {:?}", command);
                                                        if let Some(ref sender) = command_sender {
                                                            if let Err(e) = sender.send(command) {
                                                                tracing::error!("发送命令到处理器失败: {}", e);
                                                            }
                                                        }
                                                    }
                                                    Err(e) => {
                                                        tracing::error!("解析凭据命令失败: {}", e);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Ok(Message::Close(_)) => {
                            tracing::info!("WebSocket 连接关闭");
                            *state_clone.write() = ConnectionState::Disconnected;
                            break;
                        }
                        Err(e) => {
                            tracing::warn!("WebSocket 读取错误: {}", e);
                            *state_clone.write() = ConnectionState::Error(format!("读取错误: {}", e));
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
        
        tracing::info!("连接已断开");
        Ok(())
    }

    /// 连接并注册设备（兼容旧接口）
    pub async fn connect_and_register(&self, device_info: DeviceInfo) -> Result<()> {
        Self::connect_once(&self.server_url, &device_info, self.state.clone(), None, false, None).await
    }

    pub fn get_state(&self) -> ConnectionState {
        self.state.read().clone()
    }
}
