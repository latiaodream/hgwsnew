#!/bin/bash

# 皇冠数据抓取服务 - 更新脚本
# 用法: ./scripts/update.sh

set -e  # 遇到错误立即退出

echo "============================================"
echo "🔄 开始更新皇冠数据抓取服务"
echo "============================================"
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 1. 停止服务
echo "📛 步骤 1/6: 停止服务..."
if [ -f "crown-scraper.pid" ]; then
    PID=$(cat crown-scraper.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "   停止进程 $PID..."
        kill $PID
        sleep 2
        
        # 如果进程还在运行，强制停止
        if ps -p $PID > /dev/null 2>&1; then
            echo "   强制停止进程 $PID..."
            kill -9 $PID
        fi
        echo "   ✅ 服务已停止"
    else
        echo "   ⚠️ 进程 $PID 不存在"
    fi
else
    echo "   ⚠️ 未找到 PID 文件，服务可能未运行"
fi
echo ""

# 2. 备份当前版本
echo "💾 步骤 2/6: 备份当前版本..."
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r dist "$BACKUP_DIR/" 2>/dev/null || echo "   ⚠️ 未找到 dist 目录"
cp -r data "$BACKUP_DIR/" 2>/dev/null || echo "   ⚠️ 未找到 data 目录"
cp .env "$BACKUP_DIR/" 2>/dev/null || echo "   ⚠️ 未找到 .env 文件"
echo "   ✅ 备份完成: $BACKUP_DIR"
echo ""

# 3. 拉取最新代码
echo "📥 步骤 3/6: 拉取最新代码..."
git fetch origin
CURRENT_COMMIT=$(git rev-parse HEAD)
LATEST_COMMIT=$(git rev-parse origin/main)

if [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
    echo "   ℹ️ 已是最新版本"
else
    echo "   当前版本: $CURRENT_COMMIT"
    echo "   最新版本: $LATEST_COMMIT"
    git pull origin main
    echo "   ✅ 代码更新完成"
fi
echo ""

# 4. 安装依赖
echo "📦 步骤 4/6: 安装依赖..."
if git diff --name-only $CURRENT_COMMIT $LATEST_COMMIT | grep -q "package.json"; then
    echo "   检测到 package.json 变化，重新安装依赖..."
    npm install
    echo "   ✅ 依赖安装完成"
else
    echo "   ℹ️ package.json 未变化，跳过依赖安装"
fi
echo ""

# 5. 编译代码
echo "🔨 步骤 5/6: 编译代码..."
npm run build
if [ $? -eq 0 ]; then
    echo "   ✅ 编译成功"
else
    echo "   ❌ 编译失败，恢复备份..."
    rm -rf dist
    cp -r "$BACKUP_DIR/dist" .
    echo "   ✅ 已恢复备份"
    exit 1
fi
echo ""

# 6. 启动服务
echo "🚀 步骤 6/6: 启动服务..."
npm start &
sleep 3

# 检查服务是否启动成功
if [ -f "crown-scraper.pid" ]; then
    PID=$(cat crown-scraper.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "   ✅ 服务启动成功 (PID: $PID)"
    else
        echo "   ❌ 服务启动失败"
        exit 1
    fi
else
    echo "   ⚠️ 未找到 PID 文件，请手动检查服务状态"
fi
echo ""

# 7. 显示服务信息
echo "============================================"
echo "✅ 更新完成！"
echo "============================================"
echo ""
echo "📊 服务信息:"
echo "   - HTTP 服务器: http://localhost:10089"
echo "   - 管理界面: http://localhost:10089/admin.html"
echo "   - WebSocket: ws://localhost:8080 (需要 ENABLE_WEBSOCKET=1)"
echo ""
echo "📝 查看日志:"
echo "   tail -f server.out"
echo ""
echo "🔍 检查状态:"
echo "   npm run status"
echo ""
echo "📚 文档:"
echo "   - DATABASE.md - 数据库集成说明"
echo "   - WEBSOCKET.md - WebSocket 接入文档"
echo ""

