#!/bin/bash

echo "🔍 检查服务器日志"
echo "========================================"
echo ""

# 检查最近的错误日志
echo "📋 最近的错误日志（最后 50 行）:"
echo "----------------------------------------"
if [ -f logs/error.log ]; then
    tail -50 logs/error.log
else
    echo "⚠️  error.log 文件不存在"
fi
echo ""

# 检查最近的综合日志
echo "📋 最近的综合日志（最后 50 行）:"
echo "----------------------------------------"
if [ -f logs/combined.log ]; then
    tail -50 logs/combined.log
else
    echo "⚠️  combined.log 文件不存在"
fi
echo ""

# 检查 PM2 日志
echo "📋 PM2 日志:"
echo "----------------------------------------"
pm2 logs crown-scraper --lines 50 --nostream
echo ""

# 测试 API
echo "🧪 测试 API 端点:"
echo "----------------------------------------"
echo "测试 /api/thirdparty/isports ..."
RESPONSE=$(curl -s http://localhost:10089/api/thirdparty/isports)
echo "$RESPONSE" | head -c 500
echo ""
echo ""

echo "========================================"
echo "💡 如果看到错误，请将上面的日志发给我分析"

