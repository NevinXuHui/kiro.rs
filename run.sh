#!/bin/bash

# kiro-rs 运行脚本
# 用于构建和运行 kiro-rs 服务

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
CONFIG_FILE="config.json"
CREDENTIALS_FILE="credentials.json"
BUILD_FRONTEND=false
BUILD_RELEASE=false
SKIP_BUILD=false

# 打印帮助信息
print_help() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -c, --config FILE          指定配置文件 (默认: config.json)"
    echo "  -r, --credentials FILE     指定凭据文件 (默认: credentials.json)"
    echo "  -f, --frontend             重新构建前端"
    echo "  -b, --release              使用 release 模式构建"
    echo "  -s, --skip-build           跳过构建，直接运行"
    echo "  -h, --help                 显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                         # 使用默认配置运行"
    echo "  $0 -f -b                   # 重新构建前端和 release 版本"
    echo "  $0 -c my-config.json       # 使用自定义配置文件"
    exit 0
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -r|--credentials)
            CREDENTIALS_FILE="$2"
            shift 2
            ;;
        -f|--frontend)
            BUILD_FRONTEND=true
            shift
            ;;
        -b|--release)
            BUILD_RELEASE=true
            shift
            ;;
        -s|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -h|--help)
            print_help
            ;;
        *)
            echo -e "${RED}错误: 未知选项 $1${NC}"
            print_help
            ;;
    esac
done

# 检查配置文件
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}错误: 配置文件 $CONFIG_FILE 不存在${NC}"
    echo "请创建配置文件或使用 -c 指定其他配置文件"
    exit 1
fi

if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo -e "${RED}错误: 凭据文件 $CREDENTIALS_FILE 不存在${NC}"
    echo "请创建凭据文件或使用 -r 指定其他凭据文件"
    exit 1
fi

# 构建前端
if [ "$BUILD_FRONTEND" = true ]; then
    echo -e "${GREEN}==> 构建前端 Admin UI...${NC}"
    cd admin-ui
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}首次构建，安装依赖...${NC}"
        pnpm install
    fi
    pnpm build
    cd ..
    echo -e "${GREEN}✓ 前端构建完成${NC}"
fi

# 检查前端是否已构建
if [ ! -d "admin-ui/dist" ] && [ "$SKIP_BUILD" = false ]; then
    echo -e "${YELLOW}警告: admin-ui/dist 不存在，需要先构建前端${NC}"
    echo -e "${YELLOW}正在构建前端...${NC}"
    cd admin-ui
    if [ ! -d "node_modules" ]; then
        pnpm install
    fi
    pnpm build
    cd ..
    echo -e "${GREEN}✓ 前端构建完成${NC}"
fi

# 构建 Rust 项目
if [ "$SKIP_BUILD" = false ]; then
    if [ "$BUILD_RELEASE" = true ]; then
        echo -e "${GREEN}==> 构建 Rust 项目 (release 模式)...${NC}"
        cargo build --release
        BINARY_PATH="./target/release/kiro-rs"
    else
        echo -e "${GREEN}==> 构建 Rust 项目 (debug 模式)...${NC}"
        cargo build
        BINARY_PATH="./target/debug/kiro-rs"
    fi
    echo -e "${GREEN}✓ Rust 项目构建完成${NC}"
else
    if [ "$BUILD_RELEASE" = true ]; then
        BINARY_PATH="./target/release/kiro-rs"
    else
        BINARY_PATH="./target/debug/kiro-rs"
    fi
    
    if [ ! -f "$BINARY_PATH" ]; then
        echo -e "${RED}错误: 二进制文件 $BINARY_PATH 不存在${NC}"
        echo "请先构建项目或移除 -s 选项"
        exit 1
    fi
fi

# 运行服务
echo -e "${GREEN}==> 启动 kiro-rs 服务...${NC}"
echo -e "${YELLOW}配置文件: $CONFIG_FILE${NC}"
echo -e "${YELLOW}凭据文件: $CREDENTIALS_FILE${NC}"
echo ""

exec "$BINARY_PATH" -c "$CONFIG_FILE" --credentials "$CREDENTIALS_FILE"
