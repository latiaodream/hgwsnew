#!/bin/bash

# 宝塔面板一键部署脚本
# 使用方法：bash baota-deploy.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 皇冠数据抓取服务 - 宝塔面板一键部署脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ 请使用 root 用户运行此脚本${NC}"
    echo "   使用命令: sudo bash baota-deploy.sh"
    exit 1
fi

# 检查 Node.js
echo -e "${YELLOW}📦 检查 Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未检测到 Node.js${NC}"
    echo "   请先在宝塔面板中安装 Node.js 版本管理器"
    echo "   路径：软件商店 -> Node.js 版本管理器 -> 安装 Node.js 18.x"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js 版本: $NODE_VERSION${NC}"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 未检测到 npm${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm 版本: $NPM_VERSION${NC}"
echo ""

# 检查 PM2
echo -e "${YELLOW}📦 检查 PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  未检测到 PM2，正在安装...${NC}"
    npm install -g pm2
    echo -e "${GREEN}✅ PM2 安装完成${NC}"
else
    PM2_VERSION=$(pm2 -v)
    echo -e "${GREEN}✅ PM2 版本: $PM2_VERSION${NC}"
fi
echo ""

# 获取当前目录
CURRENT_DIR=$(pwd)
echo -e "${YELLOW}📁 当前目录: $CURRENT_DIR${NC}"
echo ""

# 检查 .env 文件
echo -e "${YELLOW}⚙️  检查配置文件...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  未找到 .env 文件，正在创建...${NC}"
    
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ 已从 .env.example 创建 .env 文件${NC}"
        echo -e "${RED}⚠️  请编辑 .env 文件，填入实际的配置信息！${NC}"
        echo "   使用命令: nano .env"
        echo ""
        read -p "是否现在编辑 .env 文件？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            nano .env
        else
            echo -e "${RED}❌ 请先配置 .env 文件后再继续部署${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ 未找到 .env.example 文件${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ 找到 .env 文件${NC}"
fi
echo ""

# 验证必需的环境变量
echo -e "${YELLOW}🔍 验证环境变量...${NC}"
source .env

REQUIRED_VARS=(
    "CROWN_API_BASE_URL"
    "LIVE_CROWN_USERNAME"
    "LIVE_CROWN_PASSWORD"
    "TODAY_CROWN_USERNAME"
    "TODAY_CROWN_PASSWORD"
    "EARLY_CROWN_USERNAME"
    "EARLY_CROWN_PASSWORD"
    "WS_PORT"
    "WS_AUTH_TOKEN"
)

MISSING_VARS=()
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        MISSING_VARS+=("$VAR")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo -e "${RED}❌ 以下环境变量未配置:${NC}"
    for VAR in "${MISSING_VARS[@]}"; do
        echo "   - $VAR"
    done
    echo ""
    echo "请编辑 .env 文件并填入这些变量"
    exit 1
fi

echo -e "${GREEN}✅ 所有必需的环境变量已配置${NC}"
echo ""

# 安装依赖
echo -e "${YELLOW}📥 安装项目依赖...${NC}"
npm install
echo -e "${GREEN}✅ 依赖安装完成${NC}"
echo ""

# 编译 TypeScript
echo -e "${YELLOW}🔨 编译 TypeScript...${NC}"
npm run build
echo -e "${GREEN}✅ 编译完成${NC}"
echo ""

# 停止旧服务（如果存在）
echo -e "${YELLOW}🛑 停止旧服务...${NC}"
if pm2 list | grep -q "crown-scraper"; then
    pm2 stop crown-scraper
    pm2 delete crown-scraper
    echo -e "${GREEN}✅ 旧服务已停止${NC}"
else
    echo -e "${YELLOW}⚠️  未找到运行中的服务${NC}"
fi
echo ""

# 启动服务
echo -e "${YELLOW}🚀 启动服务...${NC}"
pm2 start ecosystem.config.js
echo -e "${GREEN}✅ 服务启动成功${NC}"
echo ""

# 设置开机自启动
echo -e "${YELLOW}⚙️  配置开机自启动...${NC}"
pm2 startup > /dev/null 2>&1 || true
pm2 save
echo -e "${GREEN}✅ 开机自启动配置完成${NC}"
echo ""

# 显示服务状态
echo -e "${YELLOW}📊 服务状态:${NC}"
pm2 status
echo ""

# 等待服务启动
echo -e "${YELLOW}⏳ 等待服务启动...${NC}"
sleep 3

# 检查服务是否正常运行
if pm2 list | grep -q "crown-scraper.*online"; then
    echo -e "${GREEN}✅ 服务运行正常${NC}"
else
    echo -e "${RED}❌ 服务启动失败，请查看日志${NC}"
    echo "   使用命令: pm2 logs crown-scraper"
    exit 1
fi
echo ""

# 显示日志
echo -e "${YELLOW}📋 最近的日志:${NC}"
pm2 logs crown-scraper --lines 20 --nostream
echo ""

# 检查端口
WS_PORT=${WS_PORT:-8080}
echo -e "${YELLOW}🔍 检查端口 $WS_PORT...${NC}"
if netstat -tunlp | grep -q ":$WS_PORT"; then
    echo -e "${GREEN}✅ 端口 $WS_PORT 正在监听${NC}"
else
    echo -e "${RED}❌ 端口 $WS_PORT 未监听${NC}"
    echo "   请检查服务日志: pm2 logs crown-scraper"
fi
echo ""

# 显示防火墙提示
echo -e "${YELLOW}🔥 防火墙配置提示:${NC}"
echo "   1. 在宝塔面板中开放端口 $WS_PORT"
echo "      路径：安全 -> 添加端口规则 -> 端口: $WS_PORT, 协议: TCP"
echo ""
echo "   2. 在云服务器控制台中开放端口 $WS_PORT"
echo "      阿里云/腾讯云：安全组 -> 添加入站规则"
echo ""

# 显示连接信息
SERVER_IP=$(curl -s ifconfig.me || echo "获取失败")
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 部署完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📡 WebSocket 连接地址:${NC}"
echo "   ws://$SERVER_IP:$WS_PORT"
echo ""
echo -e "${YELLOW}🔑 认证 Token:${NC}"
echo "   $WS_AUTH_TOKEN"
echo ""
echo -e "${YELLOW}📊 常用命令:${NC}"
echo "   查看状态: pm2 status"
echo "   查看日志: pm2 logs crown-scraper"
echo "   重启服务: pm2 restart crown-scraper"
echo "   停止服务: pm2 stop crown-scraper"
echo "   监控资源: pm2 monit"
echo ""
echo -e "${YELLOW}📚 文档:${NC}"
echo "   完整文档: cat README.md"
echo "   宝塔部署: cat BAOTA-DEPLOY.md"
echo "   Nginx 配置: cat NGINX-SETUP.md"
echo ""
echo -e "${YELLOW}🔗 下一步:${NC}"
echo "   1. 确保防火墙已开放端口 $WS_PORT"
echo "   2. 在下注网站中集成 WebSocket 客户端（参考 client-example.ts）"
echo "   3. 测试连接是否正常"
echo "   4. 监控服务运行状态"
echo ""
echo -e "${GREEN}✅ 祝你使用愉快！${NC}"
echo ""

