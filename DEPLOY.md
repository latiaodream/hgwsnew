# 部署说明

## 本次更新内容

### 1. 修复赔率字段解析（提交 680d157）
- 添加 `pick()` 辅助函数，从多个候选字段中选择第一个有值的
- 独赢：支持 `IOR_RMH`/`IOR_MH`/`RATIO_MH` 等多种格式
- 让球：支持 `RATIO_RE`/`RATIO_R`/`STRONG` 等多种格式
- 大小球：支持 `RATIO_ROUO`/`RATIO_OUO`/`RATIO_O` 等多种格式
- 半场盘口：支持 `RATIO_HRE`/`RATIO_HR` 等多种格式
- 修正大小球赔率顺序（大球=C，小球=H）

### 2. 重新设计赛事展示页面（提交 cb2d42b）
- 横向布局：队伍信息在左侧，赔率盘口在右侧横向滚动
- 显示完整赔率信息：独赢、让球、大小球（全场+半场）
- 支持多条让球/大小球盘口
- 优化样式，更接近赛事中心页面
- 修复 WebSocket 认证和订阅消息格式

## 服务器部署步骤

### 1. 连接服务器
```bash
ssh root@wss.aibcbot.top
```

### 2. 停止旧服务
```bash
cd /www/wwwroot/wss.aibcbot.top
pm2 stop crown-scraper
```

### 3. 拉取最新代码
```bash
git pull origin main
```

### 4. 编译 TypeScript
```bash
npm run build
```

### 5. 重启服务
```bash
pm2 restart crown-scraper
```

### 6. 查看日志
```bash
pm2 logs crown-scraper --lines 100
```

应该看到：
- ✅ 登录成功
- 抓取到 X 场赛事（live/today/early）
- WebSocket 服务器启动成功
- HTTP 服务器启动成功

### 7. 测试前端页面

访问：`https://wss.aibcbot.top/matches`

**强制刷新**（Ctrl+Shift+R 或 Cmd+Shift+R）

应该看到：
1. ✅ 右上角显示"已连接"（绿点）
2. ✅ 显示赛事数量（滚球 X、今日 X、早盘 X）
3. ✅ 横向布局，左侧队伍信息，右侧多个赔率盘口
4. ✅ 显示独赢、让球、大小球等完整赔率信息
5. ✅ 可以横向滚动查看更多盘口

### 8. 浏览器控制台调试（如果有问题）

打开浏览器开发者工具（F12），在 Console 中执行：

```javascript
// 查看当前连接状态
console.log('WebSocket URL:', WS_URL);
console.log('Auth Token:', AUTH_TOKEN);

// 查看收到的赛事数据
console.log('Live matches:', matches.live);
console.log('Today matches:', matches.today);
console.log('Early matches:', matches.early);

// 查看第一场赛事的详细信息
if (matches.live.length > 0) {
    console.log('第一场赛事:', matches.live[0]);
    console.log('Markets:', matches.live[0].markets);
}
```

## 常见问题

### 问题 1：前端不显示赔率

**原因**：
- 皇冠 API 返回的字段名可能不同（`IOR_RMH` vs `RATIO_MH`）
- 本次更新已修复，支持多种字段名格式

**解决**：
1. 查看服务端日志，确认是否抓取到赔率数据
2. 在浏览器控制台查看 `matches.live[0].markets` 是否有数据
3. 如果还是没有，可能是当前没有比赛或盘口已关闭

### 问题 2：WebSocket 连接失败

**原因**：
- Nginx 配置问题
- 认证 Token 不匹配

**解决**：
1. 检查 Nginx 配置是否有 `/ws` 路径的代理
2. 检查 `.env` 中的 `WS_AUTH_TOKEN` 是否和 `matches.html` 中的一致
3. 查看服务端日志是否有认证失败的记录

### 问题 3：抓取到 0 场赛事

**原因**：
- 当前时间段没有比赛
- 皇冠 API 返回的数据格式变化
- 登录成功但获取赛事列表失败

**解决**：
1. 查看服务端日志，确认登录是否成功
2. 检查是否有 API 错误日志
3. 尝试手动访问皇冠网站，确认是否有比赛

## 技术细节

### 赔率字段映射

| 盘口类型 | 字段名候选列表 |
|---------|--------------|
| 独赢-主队 | `IOR_RMH`, `IOR_MH`, `RATIO_MH` |
| 独赢-平局 | `IOR_RMN`, `IOR_MN`, `RATIO_MN`, `IOR_RMD` |
| 独赢-客队 | `IOR_RMC`, `IOR_MC`, `RATIO_MC` |
| 让球-盘口 | `RATIO_RE`, `RATIO_R`, `STRONG` |
| 让球-主队 | `IOR_REH`, `IOR_RH`, `RATIO_RH` |
| 让球-客队 | `IOR_REC`, `IOR_RC`, `RATIO_RC` |
| 大小球-盘口 | `RATIO_ROUO`, `RATIO_OUO`, `RATIO_O` |
| 大小球-大 | `IOR_ROUC`, `IOR_OUC`, `RATIO_OUC` |
| 大小球-小 | `IOR_ROUH`, `IOR_OUH`, `RATIO_OUH` |
| 半场让球-盘口 | `RATIO_HRE`, `RATIO_HR`, `HSTRONG` |
| 半场让球-主队 | `IOR_HREH`, `IOR_HRH`, `RATIO_HRH` |
| 半场让球-客队 | `IOR_HREC`, `IOR_HRC`, `RATIO_HRC` |
| 半场大小球-盘口 | `RATIO_HROUO`, `RATIO_HO` |
| 半场大小球-大 | `IOR_HROUC`, `IOR_HOUC`, `RATIO_HOUC` |
| 半场大小球-小 | `IOR_HROUH`, `IOR_HOUH`, `RATIO_HOUH` |

### WebSocket 消息格式

**客户端 → 服务端**：
```json
{
  "type": "auth",
  "data": {
    "token": "latiaolatiaozhurenzhuren"
  }
}
```

```json
{
  "type": "subscribe",
  "data": {
    "showTypes": ["live", "today", "early"]
  }
}
```

**服务端 → 客户端**：
```json
{
  "type": "full_data",
  "data": {
    "showType": "live",
    "matches": [...]
  },
  "timestamp": 1762732342377
}
```

## 下一步优化建议

1. **添加赔率变化提示**：当赔率变化时，高亮显示变化的盘口
2. **添加筛选功能**：按联赛、球队名称筛选赛事
3. **添加排序功能**：按比赛时间、联赛名称排序
4. **添加收藏功能**：收藏关注的赛事
5. **添加赔率历史**：记录赔率变化历史，绘制趋势图
6. **添加下注功能**：直接在页面上下注（需要集成下注 API）

## 联系方式

如有问题，请联系开发者。

