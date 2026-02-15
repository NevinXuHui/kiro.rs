#!/bin/bash
# Kiro Admin Mobile APK 构建脚本
# 用法: ./build-apk.sh [版本号]
# 示例: ./build-apk.sh 2.1.0

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 读取当前版本
CURRENT_VERSION=$(grep '__APP_VERSION__' vite.config.ts | sed "s/.*'\(.*\)'.*/\1/")
CURRENT_VERSION_CODE=$(grep 'versionCode' android/app/build.gradle | awk '{print $2}')

if [ -n "$1" ]; then
  NEW_VERSION="$1"
else
  NEW_VERSION="$CURRENT_VERSION"
fi

# 版本号比较，决定是否需要更新
if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
  NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))
  info "版本升级: $CURRENT_VERSION -> $NEW_VERSION (versionCode: $NEW_VERSION_CODE)"

  # 更新 vite.config.ts
  sed -i "s/__APP_VERSION__: JSON.stringify('.*')/__APP_VERSION__: JSON.stringify('$NEW_VERSION')/" vite.config.ts

  # 更新 android/app/build.gradle
  sed -i "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" android/app/build.gradle
  sed -i "s/versionName \"$CURRENT_VERSION\"/versionName \"$NEW_VERSION\"/" android/app/build.gradle
else
  NEW_VERSION_CODE="$CURRENT_VERSION_CODE"
  info "构建版本: $NEW_VERSION (versionCode: $NEW_VERSION_CODE)"
fi

# Step 1: 前端构建
info "构建前端..."
pnpm build || error "前端构建失败"

# Step 2: Capacitor 同步
info "同步 Capacitor..."
npx cap sync android || error "Capacitor 同步失败"

# Step 3: Gradle 构建 APK
info "构建 APK..."
cd android
./gradlew assembleDebug || error "Gradle 构建失败"
cd ..

# Step 4: 复制产物
APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
APK_DST="kiro-admin-v${NEW_VERSION}.apk"

if [ ! -f "$APK_SRC" ]; then
  error "APK 产物未找到: $APK_SRC"
fi

cp "$APK_SRC" "$APK_DST"
APK_SIZE=$(du -h "$APK_DST" | cut -f1)

echo ""
info "========================================="
info "构建完成!"
info "版本: $NEW_VERSION (versionCode: $NEW_VERSION_CODE)"
info "产物: $APK_DST ($APK_SIZE)"
info "========================================="
