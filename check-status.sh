#!/bin/bash

# 服务状态检查脚本
# 使用方法：bash check-status.sh

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 皇冠数据抓取服务 - 状态检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 加载环境变量
if [ -f ".env" ]; then
    source .env
else
    echo -e "${RED}❌ 未找到 .env 文件${NC}"
    exit 1
fi

WS_PORT=${WS_PORT:-8080}

# 1. 检查 PM2 服务状态
echo -e "${BLUE}1. PM2 服务状态${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v pm2 &> /dev/null; then
    pm2 list | grep crown-scraper
    
    if pm2 list | grep -q "crown-scraper.*online"; then
        echo -e "${GREEN}✅ 服务运行正常${NC}"
    else
        echo -e "${RED}❌ 服务未运行或状态异常${NC}"
    fi
else
    echo -e "${RED}❌ PM2 未安装${NC}"
fi
echo ""

# 2. 检查端口监听
echo -e "${BLUE}2. 端口监听状态${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if netstat -tunlp | grep -q ":$WS_PORT"; then
    echo -e "${GREEN}✅ 端口 $WS_PORT 正在监听${NC}"
    netstat -tunlp | grep ":$WS_PORT"
else
    echo -e "${RED}❌ 端口 $WS_PORT 未监听${NC}"
fi
echo ""

# 3. 检查进程资源使用
echo -e "${BLUE}3. 进程资源使用${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v pm2 &> /dev/null; then
    pm2 show crown-scraper 2>/dev/null | grep -E "cpu|memory|uptime|restarts"
else
    echo -e "${RED}❌ PM2 未安装${NC}"
fi
echo ""

# 4. 检查最近的日志
echo -e "${BLUE}4. 最近的日志（最后 10 条）${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v pm2 &> /dev/null; then
    pm2 logs crown-scraper --lines 10 --nostream
else
    echo -e "${RED}❌ PM2 未安装${NC}"
fi
echo ""

# 5. 检查错误日志
echo -e "${BLUE}5. 错误日志（最后 5 条）${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "logs/error.log" ]; then
    tail -n 5 logs/error.log
    
    ERROR_COUNT=$(wc -l < logs/error.log)
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  共有 $ERROR_COUNT 条错误日志${NC}"
    else
        echo -e "${GREEN}✅ 无错误日志${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  未找到错误日志文件${NC}"
fi
echo ""

# 6. 检查磁盘空间
echo -e "${BLUE}6. 磁盘空间${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
df -h | grep -E "Filesystem|/$"
echo ""

# 7. 检查内存使用
echo -e "${BLUE}7. 内存使用${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
free -h
echo ""

# 8. 检查网络连接
echo -e "${BLUE}8. WebSocket 连接数${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONNECTION_COUNT=$(netstat -an | grep ":$WS_PORT" | grep ESTABLISHED | wc -l)
echo "当前连接数: $CONNECTION_COUNT"
if [ "$CONNECTION_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ 有活跃的 WebSocket 连接${NC}"
    netstat -an | grep ":$WS_PORT" | grep ESTABLISHED
else
    echo -e "${YELLOW}⚠️  暂无 WebSocket 连接${NC}"
fi
echo ""

# 9. 测试本地连接
echo -e "${BLUE}9. 测试本地连接${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if curl -s http://localhost:$WS_PORT > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 本地连接正常${NC}"
else
    echo -e "${RED}❌ 本地连接失败${NC}"
fi
echo ""

# 10. 检查防火墙
echo -e "${BLUE}10. 防火墙状态${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v firewall-cmd &> /dev/null; then
    # CentOS/RHEL
    if firewall-cmd --list-ports | grep -q "$WS_PORT/tcp"; then
        echo -e "${GREEN}✅ 防火墙已开放端口 $WS_PORT${NC}"
    else
        echo -e "${YELLOW}⚠️  防火墙未开放端口 $WS_PORT${NC}"
        echo "   使用命令开放: firewall-cmd --permanent --add-port=$WS_PORT/tcp && firewall-cmd --reload"
    fi
elif command -v ufw &> /dev/null; then
    # Ubuntu/Debian
    if ufw status | grep -q "$WS_PORT"; then
        echo -e "${GREEN}✅ 防火墙已开放端口 $WS_PORT${NC}"
    else
        echo -e "${YELLOW}⚠️  防火墙未开放端口 $WS_PORT${NC}"
        echo "   使用命令开放: ufw allow $WS_PORT/tcp"
    fi
else
    echo -e "${YELLOW}⚠️  未检测到防火墙管理工具${NC}"
    echo "   请在宝塔面板中手动开放端口 $WS_PORT"
fi
echo ""

# 11. 获取服务器 IP
echo -e "${BLUE}11. 服务器信息${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SERVER_IP=$(curl -s ifconfig.me || echo "获取失败")
echo "服务器 IP: $SERVER_IP"
echo "WebSocket 地址: ws://$SERVER_IP:$WS_PORT"
echo ""

# 12. 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📊 状态总结${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ISSUES=0

# 检查服务状态
if ! pm2 list | grep -q "crown-scraper.*online"; then
    echo -e "${RED}❌ 服务未运行${NC}"
    ISSUES=$((ISSUES + 1))
fi

# 检查端口
if ! netstat -tunlp | grep -q ":$WS_PORT"; then
    echo -e "${RED}❌ 端口未监听${NC}"
    ISSUES=$((ISSUES + 1))
fi

# 检查错误日志
if [ -f "logs/error.log" ]; then
    ERROR_COUNT=$(wc -l < logs/error.log)
    if [ "$ERROR_COUNT" -gt 10 ]; then
        echo -e "${YELLOW}⚠️  错误日志较多 ($ERROR_COUNT 条)${NC}"
        ISSUES=$((ISSUES + 1))
    fi
fi

if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}✅ 所有检查通过，服务运行正常！${NC}"
else
    echo -e "${YELLOW}⚠️  发现 $ISSUES 个问题，请检查上述详情${NC}"
fi

echo ""
echo -e "${YELLOW}💡 常用命令:${NC}"
echo "   重启服务: pm2 restart crown-scraper"
echo "   查看日志: pm2 logs crown-scraper"
echo "   监控资源: pm2 monit"
echo "   完整日志: tail -f logs/combined.log"
echo ""

