#!/bin/bash

echo "🧪 快速测试 Excel 导入导出功能"
echo "========================================"
echo ""

# 等待服务启动
echo "⏳ 等待服务启动（5秒）..."
sleep 5
echo ""

# 测试 1: 检查服务是否运行
echo "1️⃣ 检查服务状态..."
if curl -s http://localhost:10089/health > /dev/null 2>&1; then
    echo "   ✅ 服务正常运行"
else
    echo "   ⚠️  服务可能未启动，尝试访问 API..."
fi
echo ""

# 测试 2: 测试 iSports 数据
echo "2️⃣ 测试 iSports 数据..."
ISPORTS_RESULT=$(curl -s http://localhost:10089/api/thirdparty/isports)
if echo "$ISPORTS_RESULT" | grep -q '"success":true'; then
    echo "   ✅ iSports API 正常"
    # 尝试提取数据数量
    COUNT=$(echo "$ISPORTS_RESULT" | grep -o '"data":\[' | wc -l)
    if [ $COUNT -gt 0 ]; then
        echo "   ✅ 有数据返回"
    fi
else
    echo "   ❌ iSports API 失败"
    echo "   响应: $ISPORTS_RESULT"
fi
echo ""

# 测试 3: 测试导出球队（JSON）
echo "3️⃣ 测试导出球队（JSON）..."
TEAMS_RESULT=$(curl -s http://localhost:10089/api/thirdparty/export-teams)
if echo "$TEAMS_RESULT" | grep -q '"success":true'; then
    echo "   ✅ 导出球队 API 正常"
    # 提取 count
    COUNT=$(echo "$TEAMS_RESULT" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
    if [ ! -z "$COUNT" ]; then
        echo "   ✅ 球队数量: $COUNT"
    fi
else
    echo "   ❌ 导出球队 API 失败"
    echo "   响应: $TEAMS_RESULT"
fi
echo ""

# 测试 4: 测试导出球队（Excel）
echo "4️⃣ 测试导出球队（Excel）..."
HTTP_CODE=$(curl -s -o /tmp/test-teams.xlsx -w "%{http_code}" http://localhost:10089/api/thirdparty/export-teams-excel)
if [ "$HTTP_CODE" = "200" ]; then
    FILE_SIZE=$(stat -f%z /tmp/test-teams.xlsx 2>/dev/null || stat -c%s /tmp/test-teams.xlsx 2>/dev/null)
    if [ ! -z "$FILE_SIZE" ] && [ $FILE_SIZE -gt 0 ]; then
        echo "   ✅ Excel 文件生成成功"
        echo "   ✅ 文件大小: $FILE_SIZE 字节"
    else
        echo "   ⚠️  Excel 文件为空"
    fi
else
    echo "   ❌ Excel 导出失败，HTTP 状态码: $HTTP_CODE"
fi
echo ""

# 测试 5: 测试导出联赛（JSON）
echo "5️⃣ 测试导出联赛（JSON）..."
LEAGUES_RESULT=$(curl -s http://localhost:10089/api/thirdparty/export-leagues)
if echo "$LEAGUES_RESULT" | grep -q '"success":true'; then
    echo "   ✅ 导出联赛 API 正常"
    COUNT=$(echo "$LEAGUES_RESULT" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
    if [ ! -z "$COUNT" ]; then
        echo "   ✅ 联赛数量: $COUNT"
    fi
else
    echo "   ❌ 导出联赛 API 失败"
    echo "   响应: $LEAGUES_RESULT"
fi
echo ""

# 总结
echo "========================================"
echo "📊 测试总结:"
echo ""

if echo "$ISPORTS_RESULT" | grep -q '"success":true' && \
   echo "$TEAMS_RESULT" | grep -q '"success":true' && \
   [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 所有测试通过！"
    echo ""
    echo "📝 下一步操作:"
    echo "1. 访问 https://wss.aibcbot.top/admin.html"
    echo "2. 点击'第三方赔率' -> '导出球队'"
    echo "3. 下载 Excel 文件"
    echo "4. 点击'球队映射' -> '批量导入' -> 'Excel 导入'"
    echo "5. 上传刚才下载的文件"
    echo "6. 点击'导入'按钮"
    echo ""
    echo "💡 提示: crown_cn 列可以为空，不需要填写！"
else
    echo "❌ 部分测试失败"
    echo ""
    echo "🔍 排查建议:"
    echo "1. 检查服务日志: tail -f logs/combined.log"
    echo "2. 检查进程: ps aux | grep 'node dist/index.js'"
    echo "3. 运行详细测试: node test-export-data.js"
fi
echo ""

