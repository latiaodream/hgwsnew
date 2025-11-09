# 快速开始指南

## 1. 准备工作

### 1.1 准备三个皇冠账号

为了避免封号风险，建议准备三个独立的皇冠账号：

- **滚球账号**：用于抓取滚球数据（更新频率高，2秒一次）
- **今日账号**：用于抓取今日赛事（更新频率中，10秒一次）
- **早盘账号**：用于抓取早盘赛事（更新频率低，30秒一次）

### 1.2 准备服务器

- **操作系统**：Linux（推荐 Ubuntu 20.04+）
- **Node.js**：v16+ 
- **内存**：至少 512MB
- **网络**：稳定的网络连接

## 2. 安装

### 2.1 克隆代码

```bash
cd /path/to/your/project
# 代码已经在 crown-scraper-service 目录中
```

### 2.2 安装依赖

```bash
cd crown-scraper-service
npm install
```

### 2.3 配置环境变量

```bash
cp .env.example .env
nano .env  # 或使用其他编辑器
```

编辑 `.env` 文件，填入你的配置：

```env
# WebSocket 服务器配置
WS_PORT=8080
WS_AUTH_TOKEN=my-secret-token-123456  # 改成你自己的密钥

# 滚球账号配置
LIVE_CROWN_USERNAME=live_user
LIVE_CROWN_PASSWORD=live_pass

# 今日账号配置
TODAY_CROWN_USERNAME=today_user
TODAY_CROWN_PASSWORD=today_pass

# 早盘账号配置
EARLY_CROWN_USERNAME=early_user
EARLY_CROWN_PASSWORD=early_pass

# 抓取间隔（秒）
LIVE_FETCH_INTERVAL=2
TODAY_FETCH_INTERVAL=10
EARLY_FETCH_INTERVAL=30

# 皇冠 API 配置（根据实际情况填写）
CROWN_API_BASE_URL=https://api.crown.com
CROWN_SITE_URL=https://www.crown.com
```

## 3. 部署

### 3.1 使用部署脚本（推荐）

```bash
chmod +x deploy.sh
./deploy.sh
```

脚本会自动：
- 安装依赖
- 编译代码
- 安装 PM2（如果未安装）
- 启动服务
- 设置开机自启动（可选）

### 3.2 手动部署

```bash
# 编译
npm run build

# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.js

# 保存配置
pm2 save

# 设置开机自启动
pm2 startup
```

## 4. 验证

### 4.1 查看服务状态

```bash
pm2 status
```

应该看到 `crown-scraper` 服务在运行。

### 4.2 查看日志

```bash
pm2 logs crown-scraper
```

应该看到类似的输出：

```
✅ 加载滚球账号: live_user
✅ 加载今日账号: today_user
✅ 加载早盘账号: early_user
✅ 服务启动成功
📡 WebSocket 服务器: ws://localhost:8080
```

### 4.3 测试 WebSocket 连接

创建一个测试文件 `test-client.js`：

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('✅ 连接成功');
  
  // 认证
  ws.send(JSON.stringify({
    type: 'auth',
    data: { token: 'my-secret-token-123456' }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('收到消息:', message.type);
  
  if (message.type === 'heartbeat' && message.data.message === '认证成功') {
    console.log('✅ 认证成功');
    
    // 订阅所有类型
    ws.send(JSON.stringify({
      type: 'subscribe',
      data: { showTypes: ['live', 'today', 'early'] }
    }));
  }
  
  if (message.type === 'full_data') {
    console.log(`✅ 收到全量数据: ${message.data.matches.length} 场赛事`);
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});
```

运行测试：

```bash
node test-client.js
```

## 5. 集成到下注网站

### 5.1 安装 WebSocket 客户端

在你的下注网站项目中：

```bash
npm install ws  # 如果是 Node.js 后端
# 或者在浏览器中使用原生 WebSocket API
```

### 5.2 创建客户端

参考 `client-example.ts` 创建客户端：

```typescript
import CrownDataClient from './CrownDataClient';

const client = new CrownDataClient(
  'ws://your-server-ip:8080',
  'my-secret-token-123456'
);

// 设置回调
client.onFullData((matches) => {
  // 更新前端显示
  updateMatchList(matches);
});

client.onMatchAdd((data) => {
  // 添加新赛事
  addMatch(data.match);
});

client.onOddsUpdate((data) => {
  // 更新赔率
  updateOdds(data.match);
});

// 连接
client.connect();
```

### 5.3 前端集成（React 示例）

```typescript
import { useEffect, useState } from 'react';

function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [client, setClient] = useState(null);

  useEffect(() => {
    const wsClient = new CrownDataClient(
      'ws://your-server-ip:8080',
      'my-secret-token-123456'
    );

    wsClient.onFullData((data) => {
      setMatches(data);
    });

    wsClient.onMatchAdd(({ match }) => {
      setMatches(prev => [...prev, match]);
    });

    wsClient.onMatchRemove(({ gid }) => {
      setMatches(prev => prev.filter(m => m.gid !== gid));
    });

    wsClient.onOddsUpdate(({ match }) => {
      setMatches(prev => prev.map(m => 
        m.gid === match.gid ? match : m
      ));
    });

    wsClient.connect();
    setClient(wsClient);

    return () => {
      wsClient.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>赛事列表 ({matches.length})</h1>
      {matches.map(match => (
        <div key={match.gid}>
          {match.home_zh} vs {match.away_zh}
        </div>
      ))}
    </div>
  );
}
```

## 6. 常见问题

### Q: 如何修改抓取频率？

A: 编辑 `.env` 文件中的 `LIVE_FETCH_INTERVAL`、`TODAY_FETCH_INTERVAL`、`EARLY_FETCH_INTERVAL`，然后重启服务：

```bash
pm2 restart crown-scraper
```

### Q: 如何查看错误日志？

A: 查看错误日志文件：

```bash
tail -f logs/error.log
```

或使用 PM2：

```bash
pm2 logs crown-scraper --err
```

### Q: 如何更换账号？

A: 编辑 `.env` 文件，修改对应的用户名和密码，然后重启服务：

```bash
pm2 restart crown-scraper
```

### Q: 服务器重启后服务会自动启动吗？

A: 如果在部署时设置了开机自启动，服务会自动启动。可以通过以下命令检查：

```bash
pm2 startup
pm2 save
```

### Q: 如何停止服务？

A: 使用 PM2 停止：

```bash
pm2 stop crown-scraper
```

### Q: 如何完全卸载？

A: 停止并删除服务：

```bash
pm2 stop crown-scraper
pm2 delete crown-scraper
pm2 save
```

## 7. 监控和维护

### 7.1 查看实时日志

```bash
pm2 logs crown-scraper --lines 100
```

### 7.2 查看服务状态

```bash
pm2 status
pm2 monit  # 实时监控
```

### 7.3 重启服务

```bash
pm2 restart crown-scraper
```

### 7.4 查看内存使用

```bash
pm2 info crown-scraper
```

## 8. 安全建议

1. **修改默认端口**：不要使用默认的 8080 端口
2. **使用强密码**：`WS_AUTH_TOKEN` 使用复杂的随机字符串
3. **防火墙设置**：只允许下注网站服务器访问 WebSocket 端口
4. **使用 WSS**：生产环境建议使用 WSS（WebSocket Secure）
5. **定期更换账号**：定期更换抓取账号，避免被封

## 9. 性能优化

1. **调整抓取频率**：根据实际需求调整，不要过于频繁
2. **使用 Redis**：如果有多个下注网站，可以使用 Redis 缓存数据
3. **负载均衡**：如果连接数很多，可以部署多个实例
4. **日志清理**：定期清理日志文件

## 10. 下一步

- 阅读完整文档：[README.md](README.md)
- 查看客户端示例：[client-example.ts](client-example.ts)
- 了解 WebSocket 协议：查看 README.md 中的"WebSocket 协议"部分

如有问题，请查看日志文件或联系技术支持。

