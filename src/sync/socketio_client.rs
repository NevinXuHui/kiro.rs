//! 简化的 Socket.IO 客户端实现
//! 基于原生 WebSocket，兼容 Socket.IO v3/v4

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
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
}

impl SocketIOClient {
    pub fn new(server_url: String) -> Self {
        Self {
            server_url,
            state: Arc::new(RwLock::new(ConnectionState::Disconnected)),
        }
    }

    /// 连接并注册设备（保持连接活跃）
    pub async fn connect_and_register(&self, device_info: DeviceInfo) -> Result<()> {
        *self.state.write() = ConnectionState::Connecting;

        // 构建 Socket.IO 握手 URL
        let ws_url = self.server_url
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
        let ping_interval = if let Some(Ok(Message::Text(msg))) = read.next().await {
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

        *self.state.write() = ConnectionState::Connected;

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

        let mut registered = false;
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
                                    *self.state.write() = ConnectionState::Registered;
                                    registered = true;
                                    break;
                                } else if event_name == "device:error" {
                                    let error_msg = arr.get(1)
                                        .and_then(|v| v.get("message"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("未知错误");
                                    tracing::error!("设备注册失败: {}", error_msg);
                                    *self.state.write() = ConnectionState::Error(error_msg.to_string());
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

        if !registered {
            anyhow::bail!("设备注册失败");
        }

        // 启动后台任务保持连接和心跳
        let state = self.state.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(result) = read.next() => {
                        match result {
                            Ok(Message::Text(msg)) => {
                                tracing::debug!("收到消息: {}", msg);

                                // 处理服务器的 ping (2)，回复 pong (3)
                                if msg == "2" {
                                    tracing::debug!("收到服务器 ping，回复 pong");
                                    if let Err(e) = write.send(Message::Text("3".to_string())).await {
                                        tracing::warn!("发送 pong 失败: {}", e);
                                        *state.write() = ConnectionState::Error("心跳失败".to_string());
                                        break;
                                    }
                                }
                            }
                            Ok(Message::Close(_)) => {
                                tracing::info!("WebSocket 连接关闭");
                                *state.write() = ConnectionState::Disconnected;
                                break;
                            }
                            Err(e) => {
                                tracing::warn!("WebSocket 读取错误: {}", e);
                                *state.write() = ConnectionState::Error(format!("读取错误: {}", e));
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub fn get_state(&self) -> ConnectionState {
        self.state.read().clone()
    }
}
