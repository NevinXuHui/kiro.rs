# 快速开始指南

## 1. 安装依赖

```bash
cd mobile-app
pnpm install
```

## 2. 开发测试（Web 版）

```bash
pnpm dev
```

访问 http://localhost:5173 测试功能。

## 3. 构建 Android 应用

### 前置要求
- 安装 Android Studio
- 安装 JDK 17+

### 步骤

```bash
# 首次添加 Android 平台
pnpm cap:add:android

# 构建并同步到 Android
pnpm mobile:build

# 在 Android Studio 中打开
pnpm cap:open:android
```

在 Android Studio 中点击 ▶️ 运行按钮。

## 4. 构建 iOS 应用

### 前置要求
- macOS 系统
- 安装 Xcode
- Apple 开发者账号（真机测试需要）

### 步骤

```bash
# 首次添加 iOS 平台
pnpm cap:add:ios

# 构建并同步到 iOS
pnpm mobile:build

# 在 Xcode 中打开
pnpm cap:open:ios
```

在 Xcode 中点击 ▶️ 运行按钮。

## 5. 首次使用配置

1. 启动应用
2. 输入后端地址（如 `http://192.168.1.100:8080`）
3. 输入 Admin API Key
4. 点击"保存并测试连接"

## 获取局域网 IP

**Linux/macOS:**
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```cmd
ipconfig | findstr IPv4
```

## 常见问题

### Android 无法连接
- 确保手机和电脑在同一 WiFi
- 检查防火墙是否允许 8080 端口
- 使用 `http://` 而非 `https://`

### iOS 无法连接
- 同 Android
- 检查 iOS 的网络权限设置

## 项目结构

```
mobile-app/
├── src/
│   ├── App.tsx           # 主应用
│   ├── main.tsx          # 入口
│   ├── api/client.ts     # API 客户端
│   └── lib/config.ts     # 配置管理
├── android/              # Android 项目
├── ios/                  # iOS 项目
└── capacitor.config.ts   # Capacitor 配置
```
