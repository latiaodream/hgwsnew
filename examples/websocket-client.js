/**
 * WebSocket 客户端示例
 * 
 * 功能：
 * - 连接到皇冠数据抓取服务的 WebSocket 服务器
 * - 认证并订阅实时数据
 * - 接收并处理各种类型的消息
 * - 自动重连机制
 * 
 * 使用方法：
 * node examples/websocket-client.js
 */

const WebSocket = require('ws');

class CrownWSClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.pingInterval = null;
    
    // 统计信息
    this.stats = {
      live: { count: 0, lastUpdate: null },
      today: { count: 0, lastUpdate: null },
      early: { count: 0, lastUpdate: null },
      isports: { count: 0, lastUpdate: null },
      oddsapi: { count: 0, lastUpdate: null },
    };
  }

  connect() {
    console.log(`🔌 正在连接到 ${this.url}...`);
    
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('✅ WebSocket 连接成功');
      this.reconnectAttempts = 0;
      this.authenticate();
      this.startPing();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ 解析消息失败:', error.message);
      }
    });

    this.ws.on('close', () => {
      console.log('❌ WebSocket 连接关闭');
      this.isAuthenticated = false;
      this.stopPing();
      this.reconnect();
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket 错误:', error.message);
    });
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ 达到最大重连次数 (${this.maxReconnectAttempts})，停止重连`);
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 ${this.reconnectDelay / 1000} 秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  authenticate() {
    console.log('🔐 发送认证请求...');
    this.send({ type: 'auth', data: { token: this.token } });
  }

  subscribe(options) {
    console.log('📡 订阅数据:', JSON.stringify(options, null, 2));
    this.send({ type: 'subscribe', data: options });
  }

  unsubscribe(options) {
    console.log('🚫 取消订阅:', JSON.stringify(options, null, 2));
    this.send({ type: 'unsubscribe', data: options });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket 未连接，无法发送消息');
    }
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);  // 每 30 秒发送一次 ping
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  handleMessage(message) {
    const { type, data, timestamp } = message;

    switch (type) {
      case 'heartbeat':
        if (data.message === '认证成功') {
          console.log('✅ 认证成功');
          this.isAuthenticated = true;
          
          // 订阅所有数据
          this.subscribe({
            showTypes: ['live', 'today', 'early'],
            includeThirdparty: true,
            thirdpartySources: ['isports', 'oddsapi']
          });
        } else if (data.message === 'pong') {
          // Pong 响应，不需要打印
        } else if (data.status) {
          // 心跳状态更新
          this.printStatus(data.status);
        }
        break;

      case 'full_data':
        const { showType, matches } = data;
        this.stats[showType].count = matches.length;
        this.stats[showType].lastUpdate = new Date().toISOString();
        console.log(`📊 [${showType}] 全量数据: ${matches.length} 场赛事`);
        
        // 打印前 3 场赛事作为示例
        if (matches.length > 0) {
          console.log('   示例赛事:');
          matches.slice(0, 3).forEach((match, index) => {
            console.log(`   ${index + 1}. ${match.home_zh || match.home} vs ${match.away_zh || match.away}`);
            console.log(`      联赛: ${match.league_zh || match.league}`);
            console.log(`      时间: ${match.match_time}`);
          });
        }
        break;

      case 'thirdparty_full_data':
        const { source, count, last_update } = data;
        this.stats[source].count = count;
        this.stats[source].lastUpdate = last_update;
        console.log(`📊 [${source}] 第三方全量数据: ${count} 场赛事`);
        
        // 打印前 3 场赛事作为示例
        if (data.matches && data.matches.length > 0) {
          console.log('   示例赛事:');
          data.matches.slice(0, 3).forEach((match, index) => {
            console.log(`   ${index + 1}. ${match.team_home_cn} vs ${match.team_away_cn}`);
            console.log(`      联赛: ${match.league_name_cn}`);
            console.log(`      时间: ${match.match_time}`);
          });
        }
        break;

      case 'match_add':
        console.log(`➕ [${data.showType}] 新增赛事: ${data.match.gid}`);
        console.log(`   ${data.match.home_zh || data.match.home} vs ${data.match.away_zh || data.match.away}`);
        this.stats[data.showType].count++;
        break;

      case 'match_remove':
        console.log(`➖ [${data.showType}] 删除赛事: ${data.gid}`);
        this.stats[data.showType].count--;
        break;

      case 'match_update':
        console.log(`🔄 [${data.showType}] 赛事更新: ${data.gid}`);
        break;

      case 'odds_update':
        console.log(`💰 [${data.showType}] 赔率更新: ${data.gid}`);
        break;

      case 'score_update':
        console.log(`⚽ [${data.showType}] 比分更新: ${data.gid}`);
        if (data.match.home_score !== undefined && data.match.away_score !== undefined) {
          console.log(`   比分: ${data.match.home_score} - ${data.match.away_score}`);
        }
        break;

      case 'thirdparty_update':
        console.log(`🔄 [${data.source}] 第三方数据更新: ${data.count} 场赛事`);
        this.stats[data.source].count = data.count;
        this.stats[data.source].lastUpdate = new Date().toISOString();
        break;

      case 'error':
        console.error(`❌ 错误: ${data.error}`);
        break;

      default:
        console.log(`❓ 未知消息类型: ${type}`);
    }
  }

  printStatus(status) {
    console.log('\n📈 服务器状态:');
    status.forEach(s => {
      const running = s.isRunning ? '✅' : '❌';
      console.log(`   ${running} ${s.showType}: ${s.matchCount} 场赛事`);
    });
    console.log('');
  }

  printStats() {
    console.log('\n📊 客户端统计:');
    console.log('   皇冠数据:');
    console.log(`     - 滚球: ${this.stats.live.count} 场`);
    console.log(`     - 今日: ${this.stats.today.count} 场`);
    console.log(`     - 早盘: ${this.stats.early.count} 场`);
    console.log('   第三方数据:');
    console.log(`     - iSports: ${this.stats.isports.count} 场`);
    console.log(`     - OddsAPI: ${this.stats.oddsapi.count} 场`);
    console.log('');
  }

  close() {
    console.log('👋 关闭连接...');
    this.stopPing();
    if (this.ws) {
      this.ws.close();
    }
  }
}

// 主程序
function main() {
  const WS_URL = process.env.WS_URL || 'ws://localhost:8080';
  const WS_TOKEN = process.env.WS_TOKEN || 'test_token_local';

  console.log('🚀 皇冠数据抓取服务 - WebSocket 客户端');
  console.log('============================================');
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log(`认证令牌: ${WS_TOKEN}`);
  console.log('============================================\n');

  const client = new CrownWSClient(WS_URL, WS_TOKEN);
  client.connect();

  // 每 60 秒打印一次统计信息
  setInterval(() => {
    client.printStats();
  }, 60000);

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n\n收到退出信号...');
    client.printStats();
    client.close();
    process.exit(0);
  });
}

// 运行
if (require.main === module) {
  main();
}

module.exports = CrownWSClient;

