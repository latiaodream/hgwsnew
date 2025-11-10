# 皇冠数据抓取服务

独立的皇冠数据抓取服务，通过 WebSocket 实时推送赛事数据。

## 功能特性

- ✅ 支持滚球、今日、早盘三种类型的数据抓取
- ✅ 每种类型使用独立的账号，避免封号风险
- ✅ WebSocket 实时推送数据变化
- ✅ 支持增量更新（新增、删除、更新、比分变化、赔率变化）
- ✅ 自动重连和心跳检测
- ✅ 完整的日志记录
- ✅ PM2 进程管理

## 架构设计

```
┌─────────────────────────────────────┐
│   皇冠数据抓取服务                    │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  ScraperManager              │  │
│  │  - 管理多个抓取器             │  │
│  │  - 检测数据变化               │  │
│  │  - 发送事件通知               │  │
│  └──────────────────────────────┘  │
│              │                      │
│              ▼                      │
│  ┌──────────────────────────────┐  │
│  │  CrownScraper (x3)           │  │
│  │  - 滚球抓取器（账号1）        │  │
│  │  - 今日抓取器（账号2）        │  │
│  │  - 早盘抓取器（账号3）        │  │
│  └──────────────────────────────┘  │
│              │                      │
│              ▼                      │
│  ┌──────────────────────────────┐  │
│  │  WebSocket Server            │  │
│  │  - 推送实时数据               │  │
│  │  - 认证和订阅管理             │  │
│  │  - 心跳检测                   │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
              │
              │ WSS
              ▼
        [下注网站客户端]
```

## 安装

```bash
cd crown-scraper-service
npm install
```

## 配置

复制 `.env.example` 到 `.env` 并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# WebSocket 服务器配置
WS_PORT=8080
WS_AUTH_TOKEN=your-secret-token-here

# 滚球账号配置
LIVE_CROWN_USERNAME=live_account
LIVE_CROWN_PASSWORD=live_password
LIVE_ACCOUNT_POOL=hg339352/2OLqr44s,hg387962/xGeZj3fx,hg841992/YW07Z7lu

# 今日账号配置
TODAY_CROWN_USERNAME=today_account
TODAY_CROWN_PASSWORD=today_password
TODAY_ACCOUNT_POOL=

# 早盘账号配置
EARLY_CROWN_USERNAME=early_account
EARLY_CROWN_PASSWORD=early_password
EARLY_ACCOUNT_POOL=

# 抓取间隔（秒）
LIVE_FETCH_INTERVAL=2
TODAY_FETCH_INTERVAL=10
EARLY_FETCH_INTERVAL=30

# 账号轮换（分钟）
ACCOUNT_ROTATION_MINUTES=60
ACCOUNT_ROTATION_REST_MINUTES=10

# 皇冠 API 配置
CROWN_API_BASE_URL=https://api.example.com
CROWN_SITE_URL=https://www.example.com

# 多盘口抓取
# 0 或留空表示对全部赛事抓取更多盘口，正整数限制抓取数量，负数可禁用
MORE_MARKETS_LIMIT=0
ENABLE_MORE_MARKETS=false
```

## 开发

```bash
# 开发模式（自动重启）
npm run dev
```

## 生产部署

### 1. 编译

```bash
npm run build
```

### 2. 使用 PM2 启动

```bash
# 安装 PM2（如果还没安装）
npm install -g pm2

# 启动服务
npm run pm2:start

# 查看日志
npm run pm2:logs

# 重启服务
npm run pm2:restart

# 停止服务
npm run pm2:stop
```

### 3. 设置开机自启动

```bash
pm2 startup
pm2 save
```

## WebSocket 协议

### 连接

```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### 认证

连接后需要先认证：

```javascript
ws.send(JSON.stringify({
  type: 'auth',
  data: {
    token: 'your-secret-token'
  }
}));
```

### 订阅

认证成功后订阅数据：

```javascript
// 订阅所有类型
ws.send(JSON.stringify({
  type: 'subscribe',
  data: {
    showTypes: ['live', 'today', 'early']
  }
}));

// 只订阅滚球
ws.send(JSON.stringify({
  type: 'subscribe',
  data: {
    showTypes: ['live']
  }
}));
```

### 接收消息

```javascript
ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  switch (message.type) {
    case 'full_data':
      // 全量数据
      console.log('收到全量数据:', message.data.matches);
      break;
      
    case 'match_add':
      // 新增赛事
      console.log('新增赛事:', message.data.match);
      break;
      
    case 'match_remove':
      // 删除赛事
      console.log('删除赛事:', message.data.gid);
      break;
      
    case 'match_update':
      // 赛事更新
      console.log('赛事更新:', message.data.match);
      break;
      
    case 'score_update':
      // 比分更新
      console.log('比分更新:', message.data.match);
      break;
      
    case 'odds_update':
      // 赔率更新
      console.log('赔率更新:', message.data.match);
      break;
      
    case 'heartbeat':
      // 心跳
      console.log('心跳:', message.data);
      break;
      
    case 'error':
      // 错误
      console.error('错误:', message.data.error);
      break;
  }
});
```

### 心跳

客户端应该定期发送 ping：

```javascript
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

## 消息类型

### 服务端 -> 客户端

| 类型 | 说明 | 数据格式 |
|------|------|---------|
| `full_data` | 全量数据 | `{ matches: Match[] }` |
| `match_add` | 新增赛事 | `{ showType, match }` |
| `match_remove` | 删除赛事 | `{ showType, gid }` |
| `match_update` | 赛事更新 | `{ showType, gid, match }` |
| `score_update` | 比分更新 | `{ showType, gid, match }` |
| `odds_update` | 赔率更新 | `{ showType, gid, match }` |
| `heartbeat` | 心跳 | `{ timestamp, status }` |
| `error` | 错误 | `{ error: string }` |

### 客户端 -> 服务端

| 类型 | 说明 | 数据格式 |
|------|------|---------|
| `auth` | 认证 | `{ token: string }` |
| `subscribe` | 订阅 | `{ showTypes?: ShowType[] }` |
| `unsubscribe` | 取消订阅 | `{ showTypes?: ShowType[] }` |
| `ping` | Ping | `{}` |

## 数据结构

### Match（赛事）

```typescript
interface Match {
  gid: string;              // 皇冠 GID
  home: string;             // 主队英文名
  home_zh: string;          // 主队中文名
  away: string;             // 客队英文名
  away_zh: string;          // 客队中文名
  league: string;           // 联赛英文名
  league_zh: string;        // 联赛中文名
  match_time: string;       // 比赛时间
  state: number;            // 状态：0-未开始, 1-进行中, 2-已结束
  home_score?: number;      // 主队比分
  away_score?: number;      // 客队比分
  showType: ShowType;       // 类型：live/today/early
  markets?: Markets;        // 盘口数据
}
```

### Markets（盘口）

```typescript
interface Markets {
  moneyline?: {             // 独赢
    home?: number;
    draw?: number;
    away?: number;
  };
  full?: {                  // 全场
    handicapLines?: HandicapLine[];      // 让球
    overUnderLines?: OverUnderLine[];    // 大小球
  };
  half?: {                  // 半场
    handicapLines?: HandicapLine[];
    overUnderLines?: OverUnderLine[];
  };
}
```

## 监控

### 查看日志

```bash
# PM2 日志
npm run pm2:logs

# 应用日志
tail -f logs/combined.log
tail -f logs/error.log
```

### 查看状态

心跳消息中包含抓取器状态：

```json
{
  "type": "heartbeat",
  "data": {
    "timestamp": 1699999999999,
    "status": [
      {
        "showType": "live",
        "isRunning": true,
        "lastFetchTime": 1699999999999,
        "matchCount": 58,
        "errorCount": 0
      },
      {
        "showType": "today",
        "isRunning": true,
        "lastFetchTime": 1699999999999,
        "matchCount": 151,
        "errorCount": 0
      },
      {
        "showType": "early",
        "isRunning": true,
        "lastFetchTime": 1699999999999,
        "matchCount": 45,
        "errorCount": 0
      }
    ]
  }
}
```

## 注意事项

1. **账号安全**：建议使用专门的抓取账号，不要使用下注账号
2. **账号轮换**：使用 `LIVE_ACCOUNT_POOL` 等变量可以配置多个账号，程序会按照 `ACCOUNT_ROTATION_MINUTES` 自动切换，并在 `ACCOUNT_ROTATION_REST_MINUTES` 内暂停抓取以降低封号风险
3. **多盘口开关**：如需暂时停用 `get_game_more`，可把 `ENABLE_MORE_MARKETS=false`；启用时将其设置为 `true` 并按需配置 `MORE_MARKETS_LIMIT`
4. **抓取频率**：根据实际需求调整抓取间隔，避免过于频繁
5. **错误处理**：如果某个账号被封，只影响对应类型的数据，其他类型不受影响
6. **网络稳定**：确保服务器网络稳定，建议使用固定 IP
7. **日志管理**：定期清理日志文件，避免占用过多磁盘空间

## 故障排查

### 连接失败

1. 检查 WebSocket 端口是否开放
2. 检查防火墙设置
3. 检查服务是否正常运行：`pm2 status`

### 认证失败

1. 检查 `.env` 中的 `WS_AUTH_TOKEN` 是否正确
2. 检查客户端发送的 token 是否匹配

### 数据不更新

1. 检查抓取器状态（心跳消息中的 status）
2. 查看错误日志：`tail -f logs/error.log`
3. 检查账号是否被封
4. 检查网络连接

## 许可证

ISC
