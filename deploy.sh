#!/bin/bash

# kiro-rs 部署脚本
# 编译项目、部署 systemd 服务和 nginx 反代

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="kiro-rs"
# 自动检测 nginx 配置目录（兼容宝塔和标准安装）
if [[ -d "/www/server/nginx/conf/vhost" ]]; then
    NGINX_CONF_DIR="/www/server/nginx/conf/vhost"
elif [[ -d "/etc/nginx/conf.d" ]]; then
    NGINX_CONF_DIR="/etc/nginx/conf.d"
else
    NGINX_CONF_DIR=""
fi

info()  { echo -e "${GREEN}[INFO] $*${NC}"; }
warn()  { echo -e "${YELLOW}[WARN] $*${NC}"; }
error() { echo -e "${RED}[ERROR] $*${NC}"; exit 1; }

# 架构检测（含发行版大版本）
detect_arch() {
    local arch=$(uname -m)
    local distro="unknown"
    local ver=""
    if [[ -f /etc/os-release ]]; then
        distro=$(. /etc/os-release && echo "${ID}")
        ver=$(. /etc/os-release && echo "${VERSION_ID%%.*}")
    fi
    echo "${arch}-${distro}${ver}"
}

# 检查 root 权限
[[ $EUID -ne 0 ]] && error "请使用 root 权限运行此脚本"

# 继承调用者的 PATH（sudo 下保留 nvm/cargo 等用户态工具路径）
if [[ -n "$SUDO_USER" ]]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
    # 直接以 root 运行时，使用 root 的 HOME
    USER_HOME="$HOME"
fi

# nvm / node / pnpm
NVM_DIR="$USER_HOME/.nvm"
if [[ -d "$NVM_DIR" ]]; then
    NODE_DIR=$(find "$NVM_DIR/versions/node" -maxdepth 1 -type d | sort -V | tail -1)
    [[ -d "$NODE_DIR/bin" ]] && export PATH="$NODE_DIR/bin:$PATH"
fi
# cargo / rustup
[[ -d "$USER_HOME/.cargo/bin" ]] && export PATH="$USER_HOME/.cargo/bin:$PATH"

# 检查必要文件
[[ -f "$PROJECT_DIR/config.json" ]]      || error "缺少 config.json"
[[ -f "$PROJECT_DIR/credentials.json" ]]  || error "缺少 credentials.json"

# 构建命令前缀：sudo 下以原用户身份执行，避免产物变成 root 所有
if [[ -n "$SUDO_USER" ]]; then
    RUN_AS=(sudo -u "$SUDO_USER" env "PATH=$PATH" "HOME=$USER_HOME")
else
    RUN_AS=()
fi

# ── 1. 构建 ──────────────────────────────────────────────
info "构建前端..."
if [[ -d "$PROJECT_DIR/admin-ui/src" ]]; then
    cd "$PROJECT_DIR/admin-ui"
    "${RUN_AS[@]}" pnpm install
    "${RUN_AS[@]}" pnpm build
    cd "$PROJECT_DIR"
    info "前端构建完成"
else
    warn "未找到前端源码，跳过前端构建"
fi

info "构建 Rust 项目 (release)..."
# 修复 cc 路径问题
if [[ -x /usr/bin/cc ]] && file /usr/local/bin/cc 2>/dev/null | grep -q "shell script"; then
    export PATH="/usr/bin:$PATH"
    export CC=/usr/bin/cc
fi
cd "$PROJECT_DIR"
"${RUN_AS[@]}" cargo build --release
info "Rust 项目构建完成"

# 复制架构产物 + 创建符号链接
ARCH_SUFFIX=$(detect_arch)
ARCH_BINARY="$PROJECT_DIR/target/release/kiro-rs-${ARCH_SUFFIX}"
cp -f "$PROJECT_DIR/target/release/kiro-rs" "$ARCH_BINARY"
chmod +x "$ARCH_BINARY"
ln -sf "kiro-rs-${ARCH_SUFFIX}" "$PROJECT_DIR/target/release/kiro-rs"
info "架构产物: kiro-rs-${ARCH_SUFFIX}"

# ── 2. 创建日志目录 ─────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"

# ── 3. 部署 systemd 服务 ────────────────────────────────
info "部署 systemd 服务..."
DEPLOY_BINARY="$PROJECT_DIR/target/release/kiro-rs-$(detect_arch)"
[[ -f "$DEPLOY_BINARY" ]] || DEPLOY_BINARY="$PROJECT_DIR/target/release/kiro-rs"
sed "s|ExecStart=.*|ExecStart=${DEPLOY_BINARY} -c ${PROJECT_DIR}/config.json --credentials ${PROJECT_DIR}/credentials.json|" \
    "$PROJECT_DIR/$SERVICE_NAME.service" > "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
info "systemd 服务已部署并启用"

# ── 4. 部署 nginx 配置 ──────────────────────────────────
if command -v nginx &>/dev/null && [[ -n "$NGINX_CONF_DIR" ]]; then
    info "部署 nginx 配置到 $NGINX_CONF_DIR ..."
    cp "$PROJECT_DIR/kiro-rs.conf" "$NGINX_CONF_DIR/kiro-rs.conf"
    nginx -t 2>/dev/null && {
        systemctl reload nginx
        info "nginx 配置已部署并重载"
    } || {
        warn "nginx 配置检测失败，请手动检查: nginx -t"
    }
else
    warn "未安装 nginx，跳过反代配置"
fi

# ── 5. 启动/重启服务 ────────────────────────────────────
# 先杀掉非 systemd 管理的残留进程（如 run.sh 启动的）
if pgrep -x kiro-rs &>/dev/null; then
    warn "检测到残留 kiro-rs 进程，正在终止..."
    pkill -x kiro-rs || true
    sleep 1
    pgrep -x kiro-rs &>/dev/null && { pkill -9 -x kiro-rs || true; sleep 0.5; }
fi

info "重启 $SERVICE_NAME 服务..."
systemctl restart "$SERVICE_NAME"
sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "部署完成！服务运行中"
    echo ""
    echo "  服务状态:  systemctl status $SERVICE_NAME"
    echo "  查看日志:  journalctl -u $SERVICE_NAME -f"
    echo "  应用日志:  tail -f $PROJECT_DIR/logs/kiro.log"
else
    error "服务启动失败，请检查: journalctl -u $SERVICE_NAME -e"
fi
