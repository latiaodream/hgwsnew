# Excel 导入导出问题排查指南

## 问题：导入失败 - "没有有效的数据可导入"

### 可能的原因

1. **服务器代码未更新**
2. **第三方 API 没有数据**
3. **Excel 文件格式问题**
4. **服务未重启**

---

## 排查步骤

### 步骤 1: 更新服务器代码

```bash
cd /www/wwwroot/wss.aibcbot.top
git pull origin main
npm run build
pm2 restart crown-scraper
# 或
pkill -f "node dist/index.js"
npm start
```

### 步骤 2: 检查服务是否正常运行

```bash
# 检查进程
ps aux | grep "node dist/index.js"

# 检查端口
netstat -tuln | grep 10089

# 查看日志
tail -f logs/combined.log
```

### 步骤 3: 测试 API 端点

```bash
# 测试 iSports 数据
curl http://localhost:10089/api/thirdparty/isports | jq '.data | length'

# 测试导出球队（JSON）
curl http://localhost:10089/api/thirdparty/export-teams | jq '.count'

# 测试导出球队（Excel）
curl -I http://localhost:10089/api/thirdparty/export-teams-excel

# 应该返回:
# HTTP/1.1 200 OK
# Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

### 步骤 4: 下载并检查 Excel 文件

```bash
# 下载 Excel 文件
curl http://localhost:10089/api/thirdparty/export-teams-excel -o test-teams.xlsx

# 检查文件大小
ls -lh test-teams.xlsx

# 如果文件大小为 0，说明没有数据
```

### 步骤 5: 使用测试脚本

```bash
# 运行导出数据测试
node test-export-data.js

# 运行 Excel 导入测试
node test-excel-import.js
```

---

## 常见问题和解决方案

### 问题 1: 404 Not Found

**原因**: 路由未注册或服务未重启

**解决方案**:
```bash
# 重新编译
npm run build

# 重启服务
pm2 restart crown-scraper
```

### 问题 2: 导出的 Excel 文件为空

**原因**: 第三方 API 没有数据

**检查**:
```bash
# 查看 iSports 数据
curl http://localhost:10089/api/thirdparty/isports | jq '.data | length'

# 查看 Odds-API 数据
curl http://localhost:10089/api/thirdparty/odds-api | jq '.data | length'
```

**解决方案**:
- 等待数据抓取完成（可能需要几分钟）
- 检查 API 密钥是否正确
- 查看日志是否有错误

### 问题 3: Excel 文件有数据但导入失败

**原因**: Excel 格式问题或验证逻辑错误

**检查 Excel 格式**:
1. 打开 Excel 文件
2. 确认第一行是表头：`isports_en | isports_cn | crown_cn`
3. 确认数据从第二行开始
4. 确认 `isports_en` 列不为空

**查看服务器日志**:
```bash
tail -f logs/combined.log | grep "Excel\|导入"
```

日志应该显示:
```
[API] Excel 文件总行数: 10
[API] 第一行（表头）: ["isports_en","isports_cn","crown_cn"]
[API] 第二行（数据示例）: ["Manchester United","曼联",""]
[API] 解析第 2 行: isports_en="Manchester United", isports_cn="曼联", crown_cn=""
```

### 问题 4: 所有行都被跳过

**原因**: 空行判断逻辑或列顺序错误

**检查代码**:
```typescript
// 应该是这样的逻辑
if (!row || row.length === 0 || !row[0]) {
  continue; // 跳过空行
}

const isports_en = row[0]?.toString().trim();
if (!isports_en) {
  errors.push({ error: '缺少 isports_en 字段' });
  continue;
}
```

---

## 测试导入功能

### 方法 1: 使用测试脚本生成的文件

```bash
# 生成测试文件
node test-excel-import.js

# 会生成两个文件:
# - test-export-method1.xlsx
# - test-export-method2.xlsx

# 在前端上传这两个文件测试导入
```

### 方法 2: 使用实际导出的文件

```bash
# 1. 访问前端页面
https://wss.aibcbot.top/admin.html

# 2. 点击"第三方赔率" -> "导出球队"
# 3. 下载 Excel 文件
# 4. 直接导入（不需要填写 crown_cn）
# 5. 查看是否成功
```

### 方法 3: 手动创建 Excel 文件

在 Excel 中创建文件，格式如下:

| isports_en        | isports_cn | crown_cn |
|-------------------|------------|----------|
| Manchester United | 曼联       |          |
| Liverpool         | 利物浦     |          |
| Arsenal           | 阿森纳     | 阿仙奴   |

保存为 `.xlsx` 格式，然后上传测试。

---

## 验证导入是否成功

### 方法 1: 查看前端提示

成功: "导入成功！共导入 X 个球队"
失败: "导入失败: 没有有效的数据可导入"

### 方法 2: 查看数据库

```bash
# 连接数据库
psql -U postgres -d crown_scraper

# 查询球队映射
SELECT * FROM team_mapping ORDER BY created_at DESC LIMIT 10;

# 查询联赛映射
SELECT * FROM league_mapping ORDER BY created_at DESC LIMIT 10;
```

### 方法 3: 调用 API 查询

```bash
# 查询球队映射
curl http://localhost:10089/api/mapping/teams | jq '.data | length'

# 查询联赛映射
curl http://localhost:10089/api/league-mapping | jq '.data | length'
```

---

## 最终检查清单

- [ ] 代码已更新到最新版本
- [ ] 服务已重启
- [ ] 第三方 API 有数据
- [ ] 导出端点返回 200
- [ ] Excel 文件不为空
- [ ] Excel 格式正确（表头在第一行）
- [ ] 日志显示正确解析数据
- [ ] 导入成功并能查询到数据

---

## 联系支持

如果以上步骤都无法解决问题，请提供:

1. 服务器日志（最后 100 行）
2. 测试脚本输出
3. Excel 文件截图
4. 前端错误提示截图

```bash
# 收集诊断信息
echo "=== 服务状态 ===" > diagnosis.txt
ps aux | grep "node dist/index.js" >> diagnosis.txt
echo "\n=== 端口状态 ===" >> diagnosis.txt
netstat -tuln | grep 10089 >> diagnosis.txt
echo "\n=== 最近日志 ===" >> diagnosis.txt
tail -100 logs/combined.log >> diagnosis.txt
echo "\n=== 测试结果 ===" >> diagnosis.txt
node test-export-data.js >> diagnosis.txt 2>&1
```

