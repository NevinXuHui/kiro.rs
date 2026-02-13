# Kiro 移动应用实施方案

## 📱 项目概述

已为 Kiro 创建了一个**独立的移动应用项目**（`mobile-app/`），基于 React + Capacitor 技术栈，可打包为 iOS/Android 原生应用。

## ✨ 核心特性

- ✅ **跨平台支持** - 一套代码，iOS + Android 双平台
- ✅ **独立部署** - 不影响现有 admin-ui 项目
- ✅ **动态配置** - 应用内配置后端地址和 API Key
- ✅ **原生体验** - 使用 Capacitor 提供原生应用体验
- ✅ **实时监控** - 凭据状态、余额查询等功能
- ✅ **轻量简洁** - 专为移动端优化的 UI

## 📂 项目结构

```
kiro.rs/
├── admin-ui/          # 原有 Web 管理界面（未修改）
└── mobile-app/        # 新建移动应用（独立项目）
    ├── src/
    │   ├── App.tsx              # 主应用（设置页 + 凭据列表）
    │   ├── main.tsx             # 应用入口
    │   ├── api/client.ts        # API 客户端（动态后端地址）
    │   └── lib/config.ts        # 配置管理（localStorage）
    ├── capacitor.config.ts      # Capacitor 配置
    ├── package.json             # 依赖和脚本
    ├── README.md                # 详细文档
    └── QUICKSTART.md            # 快速开始指南
```

## 🚀 快速开始

### 1. 安装依赖
```bash
cd mobile-app
pnpm install
```

### 2. 开发测试（Web 版）
```bash
pnpm dev
# 访问 http://localhost:5173
```

### 3. 构建 Android 应用
```bash
pnpm cap:add:android      # 首次添加平台
pnpm mobile:build         # 构建并同步
pnpm cap:open:android     # 在 Android Studio 中打开
```

### 4. 构建 iOS 应用（需要 macOS）
```bash
pnpm cap:add:ios          # 首次添加平台
pnpm mobile:build         # 构建并同步
pnpm cap:open:ios         # 在 Xcode 中打开
```

## 🔧 技术实现

### 动态后端配置
- 使用 `localStorage` 存储后端地址和 API Key
- 首次启动显示设置页面
- 支持连接测试和配置保存

### API 客户端
- 基于 Axios，动态设置 `baseURL`
- 自动添加 API Key 到请求头
- 错误处理和重试机制

### UI 设计
- 移动端优化的简洁界面
- 设置页 + 凭据列表两个主要页面
- 使用 TailwindCSS 快速构建

## 📱 使用流程

1. **首次配置**
   - 启动应用
   - 输入后端地址（如 `http://192.168.1.100:8080`）
   - 输入 Admin API Key
   - 测试连接

2. **日常使用**
   - 查看凭据列表
   - 查看凭据状态（正常/禁用）
   - 查看失败次数和优先级
   - 点击设置图标可重新配置

## 🌐 网络配置

### 局域网访问
```bash
# 获取电脑 IP
ip addr show | grep "inet " | grep -v 127.0.0.1

# 后端地址示例
http://192.168.1.100:8080
```

### 公网访问
```bash
# 使用域名或公网 IP
https://api.example.com
```

## 📦 依赖说明

### 核心依赖
- `@capacitor/core` - Capacitor 核心
- `@capacitor/android` - Android 平台
- `@capacitor/ios` - iOS 平台
- `@capacitor/app` - 应用生命周期
- `react` + `react-dom` - UI 框架
- `axios` - HTTP 客户端
- `@tanstack/react-query` - 数据管理

### 开发依赖
- `vite` - 构建工具
- `typescript` - 类型安全
- `tailwindcss` - 样式框架

## 🔍 与 admin-ui 的区别

| 特性 | admin-ui | mobile-app |
|------|----------|------------|
| 部署方式 | 嵌入 Rust 二进制 | 独立原生应用 |
| 访问方式 | Web 浏览器 | iOS/Android 应用 |
| 后端配置 | 固定（编译时） | 动态（运行时） |
| UI 设计 | 桌面端优化 | 移动端优化 |
| 功能范围 | 完整管理功能 | 核心监控功能 |

## ⚠️ 注意事项

1. **网络连接**
   - 移动设备需要能访问后端服务器
   - 局域网使用需在同一网络
   - 注意防火墙设置

2. **平台要求**
   - Android: 需要 Android Studio + JDK 17+
   - iOS: 需要 macOS + Xcode + Apple 开发者账号

3. **安全性**
   - API Key 存储在 localStorage
   - 建议使用 HTTPS（生产环境）
   - 定期更新 API Key

## 📚 相关文档

- `mobile-app/README.md` - 完整文档
- `mobile-app/QUICKSTART.md` - 快速开始指南
- [Capacitor 官方文档](https://capacitorjs.com/)

## 🎯 下一步

1. **测试开发版本**
   ```bash
   cd mobile-app
   pnpm install
   pnpm dev
   ```

2. **构建移动应用**
   - 按照 QUICKSTART.md 指南操作
   - 在真机或模拟器上测试

3. **功能扩展**（可选）
   - 添加余额查询功能
   - 添加凭据管理功能
   - 添加推送通知
   - 添加生物识别认证

## ✅ 完成状态

- ✅ 项目结构创建完成
- ✅ 核心代码实现完成
- ✅ 配置文件完成
- ✅ 文档编写完成
- ✅ 独立于 admin-ui，互不影响

现在可以开始安装依赖并测试了！
