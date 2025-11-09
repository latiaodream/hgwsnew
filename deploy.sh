#!/bin/bash

# 皇冠数据抓取服务部署脚本

set -e

echo "================================"
echo "皇冠数据抓取服务部署脚本"
echo "================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 未安装 npm"
    exit 1
fi

echo "✅ npm 版本: $(npm -v)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install

# 检查 .env 文件
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  未找到 .env 文件"
    echo "正在从 .env.example 创建 .env 文件..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请编辑配置后重新运行部署脚本"
    echo ""
    echo "需要配置的项目："
    echo "  - WS_AUTH_TOKEN: WebSocket 认证令牌"
    echo "  - LIVE_CROWN_USERNAME: 滚球账号用户名"
    echo "  - LIVE_CROWN_PASSWORD: 滚球账号密码"
    echo "  - TODAY_CROWN_USERNAME: 今日账号用户名"
    echo "  - TODAY_CROWN_PASSWORD: 今日账号密码"
    echo "  - EARLY_CROWN_USERNAME: 早盘账号用户名"
    echo "  - EARLY_CROWN_PASSWORD: 早盘账号密码"
    echo "  - CROWN_API_BASE_URL: 皇冠 API 地址"
    echo ""
    exit 1
fi

echo "✅ 找到 .env 配置文件"

# 编译
echo ""
echo "🔨 编译 TypeScript..."
npm run build

echo "✅ 编译完成"

# 创建日志目录
echo ""
echo "📁 创建日志目录..."
mkdir -p logs

echo "✅ 日志目录已创建"

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "⚠️  未安装 PM2"
    read -p "是否安装 PM2? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📦 安装 PM2..."
        npm install -g pm2
        echo "✅ PM2 安装完成"
    else
        echo "❌ 需要 PM2 才能部署，退出"
        exit 1
    fi
fi

echo "✅ PM2 版本: $(pm2 -v)"

# 停止旧进程
echo ""
echo "🛑 停止旧进程..."
pm2 stop crown-scraper 2>/dev/null || true
pm2 delete crown-scraper 2>/dev/null || true

# 启动服务
echo ""
echo "🚀 启动服务..."
pm2 start ecosystem.config.js

# 保存 PM2 配置
echo ""
echo "💾 保存 PM2 配置..."
pm2 save

# 设置开机自启动
echo ""
read -p "是否设置开机自启动? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pm2 startup
    echo "✅ 已设置开机自启动"
    echo "⚠️  请按照上面的提示执行命令以完成设置"
fi

# 显示状态
echo ""
echo "================================"
echo "✅ 部署完成！"
echo "================================"
echo ""
pm2 status
echo ""
echo "📝 常用命令："
echo "  查看日志: pm2 logs crown-scraper"
echo "  查看状态: pm2 status"
echo "  重启服务: pm2 restart crown-scraper"
echo "  停止服务: pm2 stop crown-scraper"
echo ""
echo "🔗 WebSocket 地址: ws://localhost:$(grep WS_PORT .env | cut -d '=' -f2)"
echo "🔑 认证令牌: $(grep WS_AUTH_TOKEN .env | cut -d '=' -f2)"
echo ""

