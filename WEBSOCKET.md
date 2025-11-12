# WebSocket 接入文档

## 📡 概述

本服务提供 WebSocket 实时数据推送功能，支持：
- **皇冠赛事数据**：滚球(live)、今日(today)、早盘(early)
- **第三方赔率数据**：iSportsAPI、Odds-API.io

## 🔧 连接信息

```
WebSocket 地址：ws://localhost:8080
认证令牌：通过环境变量 WS_AUTH_TOKEN 配置（默认：default-token）
```

## 📝 消息格式

所有消息均为 JSON 格式：

```typescript
interface WSMessage {
  type: MessageType;      // 消息类型
  data?: any;             // 消息数据
  timestamp?: number;     // 时间戳（毫秒）
}
```

## 🔐 认证流程

### 1. 连接 WebSocket

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('WebSocket 连接成功');
  
  // 发送认证消息
  ws.send(JSON.stringify({
    type: 'auth',
    data: { token: 'your-auth-token' }
  }));
};
```

### 2. 接收认证响应

```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'heartbeat' && message.data.message === '认证成功') {
    console.log('认证成功');
    // 开始订阅数据
    subscribeData();
  }
};
```

## 📊 订阅数据

### 订阅皇冠赛事数据

```javascript
function subscribeData() {
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: {
      showTypes: ['live', 'today', 'early'],  // 可选：不传则订阅全部
      includeThirdparty: false                 // 是否包含第三方数据
    }
  }));
}
```

### 订阅第三方赔率数据

```javascript
function subscribeThirdparty() {
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: {
      showTypes: ['live', 'today', 'early'],
      includeThirdparty: true,                           // 启用第三方数据
      thirdpartySources: ['isports', 'oddsapi']          // 订阅的数据源
    }
  }));
}
```

### 取消订阅

```javascript
function unsubscribe() {
  ws.send(JSON.stringify({
    type: 'unsubscribe',
    data: {
      showTypes: ['early']  // 取消订阅早盘数据
    }
  }));
}
```

## 📥 接收数据

### 消息类型

#### 1. 全量数据 (full_data)

订阅成功后立即推送，包含当前所有赛事数据：

```javascript
{
  type: 'full_data',
  data: {
    showType: 'live',
    matches: [
      {
        gid: '3456789',
        home: 'Manchester United',
        away: 'Liverpool',
        league: 'English Premier League',
        match_time: '2025-11-12T15:00:00-04:00',
        markets: {
          moneyline: { home: 2.10, draw: 3.40, away: 3.20 },
          full: {
            handicapLines: [{ hdp: -0.5, home: 1.95, away: 1.95 }],
            overUnderLines: [{ hdp: 2.5, over: 1.90, under: 2.00 }]
          }
        }
      }
    ]
  },
  timestamp: 1699876543210
}
```

#### 2. 新增赛事 (match_add)

```javascript
{
  type: 'match_add',
  data: {
    showType: 'live',
    match: { /* 赛事数据 */ }
  },
  timestamp: 1699876543210
}
```

#### 3. 赛事更新 (match_update)

```javascript
{
  type: 'match_update',
  data: {
    showType: 'live',
    gid: '3456789',
    match: { /* 更新后的赛事数据 */ }
  },
  timestamp: 1699876543210
}
```

#### 4. 删除赛事 (match_remove)

```javascript
{
  type: 'match_remove',
  data: {
    showType: 'live',
    gid: '3456789'
  },
  timestamp: 1699876543210
}
```

#### 5. 赔率更新 (odds_update)

```javascript
{
  type: 'odds_update',
  data: {
    showType: 'live',
    gid: '3456789',
    match: { /* 包含最新赔率的赛事数据 */ }
  },
  timestamp: 1699876543210
}
```

#### 6. 比分更新 (score_update)

```javascript
{
  type: 'score_update',
  data: {
    showType: 'live',
    gid: '3456789',
    match: { /* 包含最新比分的赛事数据 */ }
  },
  timestamp: 1699876543210
}
```

#### 7. 第三方全量数据 (thirdparty_full_data)

```javascript
{
  type: 'thirdparty_full_data',
  data: {
    source: 'isports',
    matches: [
      {
        match_id: '12345',
        league_name_cn: '英格兰超级联赛',
        league_name_en: 'English Premier League',
        team_home_cn: '曼联',
        team_home_en: 'Manchester United',
        team_away_cn: '利物浦',
        team_away_en: 'Liverpool',
        match_time: '2025-11-12T15:00:00-04:00',
        status: 'live',
        odds: {
          handicap: [{ home_odds: 1.95, away_odds: 1.95, handicap_line: -0.5 }],
          totals: [{ over_odds: 1.90, under_odds: 2.00, total_line: 2.5 }],
          moneyline: { home_odds: 2.10, draw_odds: 3.40, away_odds: 3.20 }
        }
      }
    ],
    count: 442,
    last_update: '2025-11-12T13:45:02.000Z'
  },
  timestamp: 1699876543210
}
```

#### 8. 第三方数据更新 (thirdparty_update)

```javascript
{
  type: 'thirdparty_update',
  data: {
    source: 'isports',
    matches: [ /* 更新的赛事列表 */ ],
    count: 442
  },
  timestamp: 1699876543210
}
```

#### 9. 心跳 (heartbeat)

服务器每 30 秒发送一次心跳：

```javascript
{
  type: 'heartbeat',
  data: {
    timestamp: 1699876543210,
    status: [
      { showType: 'live', isRunning: true, matchCount: 0 },
      { showType: 'today', isRunning: true, matchCount: 64 },
      { showType: 'early', isRunning: true, matchCount: 450 }
    ]
  },
  timestamp: 1699876543210
}
```

#### 10. 错误 (error)

```javascript
{
  type: 'error',
  data: { error: '错误信息' },
  timestamp: 1699876543210
}
```

## 💓 心跳机制

### 客户端发送 Ping

```javascript
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);  // 每 30 秒发送一次
```

### 服务器响应

```javascript
{
  type: 'heartbeat',
  data: { message: 'pong' },
  timestamp: 1699876543210
}
```

## 📋 完整示例

### Node.js 客户端

```javascript
const WebSocket = require('ws');

class CrownWSClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.isAuthenticated = false;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('✅ WebSocket 连接成功');
      this.authenticate();
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      this.handleMessage(message);
    });

    this.ws.on('close', () => {
      console.log('❌ WebSocket 连接关闭');
      // 重连逻辑
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket 错误:', error.message);
    });
  }

  authenticate() {
    this.send({ type: 'auth', data: { token: this.token } });
  }

  subscribe(options) {
    this.send({ type: 'subscribe', data: options });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'heartbeat':
        if (message.data.message === '认证成功') {
          console.log('✅ 认证成功');
          this.isAuthenticated = true;
          // 订阅数据
          this.subscribe({
            showTypes: ['live', 'today', 'early'],
            includeThirdparty: true,
            thirdpartySources: ['isports', 'oddsapi']
          });
        }
        break;

      case 'full_data':
        console.log(`📊 全量数据 (${message.data.showType}): ${message.data.matches.length} 场`);
        break;

      case 'thirdparty_full_data':
        console.log(`📊 第三方全量数据 (${message.data.source}): ${message.data.count} 场`);
        break;

      case 'match_add':
        console.log(`➕ 新增赛事: ${message.data.match.gid}`);
        break;

      case 'match_update':
        console.log(`🔄 赛事更新: ${message.data.gid}`);
        break;

      case 'odds_update':
        console.log(`💰 赔率更新: ${message.data.gid}`);
        break;

      case 'thirdparty_update':
        console.log(`🔄 第三方数据更新 (${message.data.source}): ${message.data.count} 场`);
        break;

      case 'error':
        console.error(`❌ 错误: ${message.data.error}`);
        break;
    }
  }
}

// 使用示例
const client = new CrownWSClient('ws://localhost:8080', 'your-auth-token');
client.connect();
```

## 🔒 安全建议

1. **使用强认证令牌**：在生产环境中使用复杂的认证令牌
2. **启用 WSS**：在生产环境中使用 wss:// 加密连接
3. **限制连接数**：服务器端应限制单个 IP 的连接数
4. **心跳超时**：客户端 60 秒无响应将被断开

## 📈 性能优化

1. **增量更新**：只推送变化的数据，减少带宽消耗
2. **按需订阅**：只订阅需要的数据类型
3. **批量推送**：服务器端批量推送更新，减少消息数量
4. **压缩传输**：考虑使用 WebSocket 压缩扩展

## 🐛 故障排查

### 连接失败

- 检查 WebSocket 服务器是否启动（环境变量 `ENABLE_WEBSOCKET=1`）
- 检查端口是否被占用（默认 8080）
- 检查防火墙设置

### 认证失败

- 检查认证令牌是否正确
- 查看服务器日志确认错误原因

### 数据未推送

- 确认已成功订阅
- 检查订阅的 showTypes 是否正确
- 查看服务器日志确认数据抓取是否正常

