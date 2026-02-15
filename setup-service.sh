#!/bin/bash

# kiro-rs systemd 服务管理脚本
# 仅负责 systemd 服务的创建/配置/启动，不包含编译

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="kiro-rs"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# 架构检测（含发行版大版本）：优先使用架构匹配的二进制
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

ARCH_SUFFIX=$(detect_arch)
ARCH_BINARY="$PROJECT_DIR/target/release/kiro-rs-${ARCH_SUFFIX}"
if [[ -f "$ARCH_BINARY" ]]; then
    BINARY_PATH="$ARCH_BINARY"
else
    BINARY_PATH="$PROJECT_DIR/target/release/kiro-rs"
fi

info()  { echo -e "${GREEN}[INFO] $*${NC}"; }
warn()  { echo -e "${YELLOW}[WARN] $*${NC}"; }
error() { echo -e "${RED}[ERROR] $*${NC}"; exit 1; }

# 检查 root 权限
[[ $EUID -ne 0 ]] && error "请使用 root 权限运行此脚本"

# 检查二进制文件
[[ -f "$BINARY_PATH" ]] || error "二进制文件不存在: $BINARY_PATH\n请先编译项目: cargo build --release"

# 检查配置文件
[[ -f "$PROJECT_DIR/config.json" ]]     || error "缺少 config.json"
[[ -f "$PROJECT_DIR/credentials.json" ]] || error "缺少 credentials.json"

# 创建日志目录
mkdir -p "$PROJECT_DIR/logs"

# 杀掉非 systemd 管理的残留进程
if pgrep -x kiro-rs &>/dev/null && ! systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    warn "检测到非 systemd 管理的 kiro-rs 进程，正在终止..."
    pkill -x kiro-rs || true
    sleep 1
    pgrep -x kiro-rs &>/dev/null && { pkill -9 -x kiro-rs || true; sleep 0.5; }
fi

# 判断服务是否已存在
if [[ -f "$SERVICE_FILE" ]]; then
    info "检测到已有 systemd 服务，更新配置..."
    sed "s|ExecStart=.*|ExecStart=${BINARY_PATH} -c ${PROJECT_DIR}/config.json --credentials ${PROJECT_DIR}/credentials.json|" \
        "$PROJECT_DIR/${SERVICE_NAME}.service" > "$SERVICE_FILE"
    systemctl daemon-reload
    info "重启服务..."
    systemctl restart "$SERVICE_NAME"
else
    info "创建 systemd 服务..."
    sed "s|ExecStart=.*|ExecStart=${BINARY_PATH} -c ${PROJECT_DIR}/config.json --credentials ${PROJECT_DIR}/credentials.json|" \
        "$PROJECT_DIR/${SERVICE_NAME}.service" > "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    info "启动服务..."
    systemctl start "$SERVICE_NAME"
fi

sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "服务运行中 ✓"
    echo ""
    echo "  服务状态:  systemctl status $SERVICE_NAME"
    echo "  查看日志:  journalctl -u $SERVICE_NAME -f"
    echo "  应用日志:  tail -f $PROJECT_DIR/logs/kiro.log"
else
    error "服务启动失败，请检查: journalctl -u $SERVICE_NAME -e"
fi
