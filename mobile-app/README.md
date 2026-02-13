# Kiro Mobile App

基于 React + Capacitor 的 Kiro 管理移动应用。

## 功能特性

- ✅ 跨平台支持（iOS / Android）
- ✅ 凭据管理
- ✅ 余额查询
- ✅ 实时状态监控
- ✅ 后端地址配置
- ✅ 原生应用体验

## 快速开始

### 1. 安装依赖

```bash
cd mobile-app
pnpm install
```

### 2. 开发模式

```bash
pnpm dev
```

访问 `http://localhost:5173` 进行开发调试。

### 3. 构建移动应用

#### Android

```bash
# 添加 Android 平台（首次）
pnpm cap:add:android

# 构建并同步
pnpm mobile:build

# 在 Android Studio 中打开
pnpm cap:open:android
```

在 Android Studio 中点击运行按钮即可在模拟器或真机上运行。

#### iOS

```bash
# 添加 iOS 平台（首次，需要 macOS）
pnpm cap:add:ios

# 构建并同步
pnpm mobile:build

# 在 Xcode 中打开
pnpm cap:open:ios
```

在 Xcode 中点击运行按钮即可在模拟器或真机上运行。

## 使用说明

### 首次配置

1. 启动应用后会显示设置页面
2. 输入后端服务器地址（如 `http://192.168.1.100:8080`）
3. 输入 Admin API Key
4. 点击"保存并测试连接"

### 后端地址说明

- **局域网访问**：使用局域网 IP，如 `http://192.168.1.100:8080`
- **公网访问**：使用域名或公网 IP，如 `https://api.example.com`
- **注意**：移动设备需要能够访问到后端服务器

### 获取局域网 IP

**Linux/macOS:**
```bash
ip addr show | grep inet
# 或
ifconfig | grep inet
```

**Windows:**
```cmd
ipconfig
```

## 项目结构

```
mobile-app/
├── src/
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx             # 应用入口
│   ├── index.css            # 全局样式
│   ├── api/
│   │   └── client.ts        # API 客户端
│   └── lib/
│       └── config.ts        # 配置管理
├── android/                 # Android 原生项目（自动生成）
├── ios/                     # iOS 原生项目（自动生成）
├── capacitor.config.ts      # Capacitor 配置
├── package.json
└── vite.config.ts
```

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Capacitor 6** - 跨平台框架
- **TailwindCSS** - 样式
- **React Query** - 数据管理
- **Axios** - HTTP 客户端

## 常见问题

### 1. 无法连接到后端

- 确保移动设备和后端服务器在同一网络
- 检查防火墙设置
- 使用 `http://` 而非 `https://`（除非配置了 SSL）

### 2. Android 构建失败

- 确保安装了 Android Studio 和 SDK
- 检查 Java 版本（推荐 JDK 17）

### 3. iOS 构建失败

- 需要 macOS 系统
- 需要安装 Xcode
- 需要 Apple 开发者账号（真机测试）

## 开发建议

- 使用 Chrome DevTools 调试 Web 版本
- 使用 Android Studio Logcat 调试 Android
- 使用 Xcode Console 调试 iOS

## License

MIT
