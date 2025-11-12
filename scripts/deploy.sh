#!/bin/bash

# 皇冠数据抓取服务 - 首次部署脚本
# 用法: ./scripts/deploy.sh

set -e  # 遇到错误立即退出

echo "============================================"
echo "🚀 皇冠数据抓取服务 - 首次部署"
echo "============================================"
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 1. 检查 Node.js 版本
echo "📋 步骤 1/8: 检查环境..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "   ❌ Node.js 版本过低 (需要 >= 16.x)"
    exit 1
fi
echo "   ✅ Node.js 版本: $(node -v)"
echo "   ✅ npm 版本: $(npm -v)"
echo ""

# 2. 安装依赖
echo "📦 步骤 2/8: 安装依赖..."
npm install
echo "   ✅ 依赖安装完成"
echo ""

# 3. 配置环境变量
echo "⚙️ 步骤 3/8: 配置环境变量..."
if [ ! -f ".env" ]; then
    echo "   创建 .env 文件..."
    cp .env.example .env
    echo "   ⚠️ 请编辑 .env 文件，填入你的配置"
    echo "   ⚠️ 按 Enter 继续..."
    read
else
    echo "   ✅ .env 文件已存在"
fi
echo ""

# 4. 创建必要的目录
echo "📁 步骤 4/8: 创建目录..."
mkdir -p data
mkdir -p logs
mkdir -p backups
echo "   ✅ 目录创建完成"
echo ""

# 5. 询问是否创建数据库
echo "🗄️ 步骤 5/8: 数据库配置..."
read -p "   是否创建 PostgreSQL 数据库? (y/n): " CREATE_DB

if [ "$CREATE_DB" = "y" ] || [ "$CREATE_DB" = "Y" ]; then
    echo "   创建数据库..."
    
    # 检查 PostgreSQL 是否安装
    if ! command -v psql &> /dev/null; then
        echo "   ❌ 未找到 psql 命令，请先安装 PostgreSQL"
    else
        # 读取数据库配置
        read -p "   数据库名称 [hgwss]: " DB_NAME
        DB_NAME=${DB_NAME:-hgwss}
        
        read -p "   数据库用户 [hgwss]: " DB_USER
        DB_USER=${DB_USER:-hgwss}
        
        read -sp "   数据库密码 [JG3KN46JGXWN4CbJ]: " DB_PASSWORD
        DB_PASSWORD=${DB_PASSWORD:-JG3KN46JGXWN4CbJ}
        echo ""
        
        # 创建数据库和用户
        psql -U postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "   ⚠️ 数据库可能已存在"
        psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "   ⚠️ 用户可能已存在"
        psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null
        
        # 初始化表结构
        if [ -f "database-schema.sql" ]; then
            echo "   初始化表结构..."
            PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -f database-schema.sql
            echo "   ✅ 数据库创建完成"
        else
            echo "   ⚠️ 未找到 database-schema.sql 文件"
        fi
    fi
else
    echo "   ℹ️ 跳过数据库创建，将使用 JSON 文件存储"
fi
echo ""

# 6. 编译代码
echo "🔨 步骤 6/8: 编译代码..."
npm run build
if [ $? -eq 0 ]; then
    echo "   ✅ 编译成功"
else
    echo "   ❌ 编译失败"
    exit 1
fi
echo ""

# 7. 询问是否启用 WebSocket
echo "📡 步骤 7/8: WebSocket 配置..."
read -p "   是否启用 WebSocket 服务? (y/n): " ENABLE_WS

if [ "$ENABLE_WS" = "y" ] || [ "$ENABLE_WS" = "Y" ]; then
    # 更新 .env 文件
    if grep -q "ENABLE_WEBSOCKET" .env; then
        sed -i.bak 's/ENABLE_WEBSOCKET=.*/ENABLE_WEBSOCKET=1/' .env
    else
        echo "ENABLE_WEBSOCKET=1" >> .env
    fi
    echo "   ✅ WebSocket 已启用"
else
    echo "   ℹ️ WebSocket 未启用"
fi
echo ""

# 8. 启动服务
echo "🚀 步骤 8/8: 启动服务..."
npm start &
sleep 3

# 检查服务是否启动成功
if [ -f "crown-scraper.pid" ]; then
    PID=$(cat crown-scraper.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "   ✅ 服务启动成功 (PID: $PID)"
    else
        echo "   ❌ 服务启动失败，请查看日志: tail -f server.out"
        exit 1
    fi
else
    echo "   ⚠️ 未找到 PID 文件，请手动检查服务状态"
fi
echo ""

# 显示服务信息
echo "============================================"
echo "✅ 部署完成！"
echo "============================================"
echo ""
echo "📊 服务信息:"
echo "   - HTTP 服务器: http://localhost:10089"
echo "   - 管理界面: http://localhost:10089/admin.html"
if [ "$ENABLE_WS" = "y" ] || [ "$ENABLE_WS" = "Y" ]; then
    echo "   - WebSocket: ws://localhost:8080"
fi
echo ""
echo "📝 常用命令:"
echo "   - 查看日志: tail -f server.out"
echo "   - 停止服务: npm run stop"
echo "   - 重启服务: npm run restart"
echo "   - 更新代码: ./scripts/update.sh"
echo ""
echo "📚 文档:"
echo "   - DATABASE.md - 数据库集成说明"
echo "   - WEBSOCKET.md - WebSocket 接入文档"
echo "   - README.md - 项目说明"
echo ""
echo "🔧 下一步:"
echo "   1. 编辑 .env 文件，配置你的账号和 API 密钥"
echo "   2. 访问管理界面配置球队和联赛映射"
echo "   3. 查看日志确认服务运行正常"
echo ""

