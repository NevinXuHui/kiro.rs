#!/bin/bash
# Kiro Tools TUI 启动脚本

cd "$(dirname "$0")"

# 激活虚拟环境
source venv/bin/activate

# 运行 TUI
python3 kiro_tools_tui.py
