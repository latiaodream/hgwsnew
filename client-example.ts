/**
 * WebSocket 客户端示例
 * 用于在下注网站中接收实时数据
 */

import WebSocket from 'ws';

interface WSMessage {
  type: string;
  data?: any;
  timestamp?: number;
}

class CrownDataClient {
  private ws?: WebSocket;
  private url: string;
  private token: string;
  private reconnectInterval: number = 5000;
  private reconnectTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private isConnected: boolean = false;
  private isAuthenticated: boolean = false;

  // 事件回调
  private onConnectedCallback?: () => void;
  private onDisconnectedCallback?: () => void;
  private onFullDataCallback?: (matches: any[]) => void;
  private onMatchAddCallback?: (data: any) => void;
  private onMatchRemoveCallback?: (data: any) => void;
  private onMatchUpdateCallback?: (data: any) => void;
  private onScoreUpdateCallback?: (data: any) => void;
  private onOddsUpdateCallback?: (data: any) => void;
  private onErrorCallback?: (error: string) => void;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  /**
   * 连接到服务器
   */
  connect(): void {
    console.log('正在连接到 WebSocket 服务器...');

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('WebSocket 连接已建立');
      this.isConnected = true;
      this.authenticate();
      this.startPing();
    });

    this.ws.on('message', (data: Buffer) => {
      this.handleMessage(data);
    });

    this.ws.on('close', () => {
      console.log('WebSocket 连接已关闭');
      this.isConnected = false;
      this.isAuthenticated = false;
      this.stopPing();
      
      if (this.onDisconnectedCallback) {
        this.onDisconnectedCallback();
      }

      // 自动重连
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket 错误:', error.message);
    });
  }

  /**
   * 认证
   */
  private authenticate(): void {
    this.send({
      type: 'auth',
      data: { token: this.token },
    });
  }

  /**
   * 订阅数据
   */
  subscribe(showTypes?: string[]): void {
    if (!this.isAuthenticated) {
      console.warn('请先认证');
      return;
    }

    this.send({
      type: 'subscribe',
      data: { showTypes },
    });
  }

  /**
   * 取消订阅
   */
  unsubscribe(showTypes?: string[]): void {
    this.send({
      type: 'unsubscribe',
      data: { showTypes },
    });
  }

  /**
   * 发送消息
   */
  private send(message: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(data: Buffer): void {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'heartbeat':
          this.handleHeartbeat(message.data);
          break;

        case 'full_data':
          if (this.onFullDataCallback) {
            this.onFullDataCallback(message.data.matches);
          }
          break;

        case 'match_add':
          if (this.onMatchAddCallback) {
            this.onMatchAddCallback(message.data);
          }
          break;

        case 'match_remove':
          if (this.onMatchRemoveCallback) {
            this.onMatchRemoveCallback(message.data);
          }
          break;

        case 'match_update':
          if (this.onMatchUpdateCallback) {
            this.onMatchUpdateCallback(message.data);
          }
          break;

        case 'score_update':
          if (this.onScoreUpdateCallback) {
            this.onScoreUpdateCallback(message.data);
          }
          break;

        case 'odds_update':
          if (this.onOddsUpdateCallback) {
            this.onOddsUpdateCallback(message.data);
          }
          break;

        case 'error':
          console.error('服务器错误:', message.data.error);
          if (this.onErrorCallback) {
            this.onErrorCallback(message.data.error);
          }
          break;
      }
    } catch (error: any) {
      console.error('解析消息失败:', error.message);
    }
  }

  /**
   * 处理心跳
   */
  private handleHeartbeat(data: any): void {
    if (data.message === '认证成功') {
      console.log('认证成功');
      this.isAuthenticated = true;
      
      if (this.onConnectedCallback) {
        this.onConnectedCallback();
      }

      // 自动订阅所有类型
      this.subscribe(['live', 'today', 'early']);
    }

    if (data.status) {
      console.log('抓取器状态:', data.status);
    }
  }

  /**
   * 启动 Ping
   */
  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  /**
   * 停止 Ping
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * 计划重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      console.log('尝试重新连接...');
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  /**
   * 设置事件回调
   */
  onConnected(callback: () => void): void {
    this.onConnectedCallback = callback;
  }

  onDisconnected(callback: () => void): void {
    this.onDisconnectedCallback = callback;
  }

  onFullData(callback: (matches: any[]) => void): void {
    this.onFullDataCallback = callback;
  }

  onMatchAdd(callback: (data: any) => void): void {
    this.onMatchAddCallback = callback;
  }

  onMatchRemove(callback: (data: any) => void): void {
    this.onMatchRemoveCallback = callback;
  }

  onMatchUpdate(callback: (data: any) => void): void {
    this.onMatchUpdateCallback = callback;
  }

  onScoreUpdate(callback: (data: any) => void): void {
    this.onScoreUpdateCallback = callback;
  }

  onOddsUpdate(callback: (data: any) => void): void {
    this.onOddsUpdateCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }
}

// 使用示例
const client = new CrownDataClient('ws://localhost:8080', 'your-secret-token');

// 设置事件回调
client.onConnected(() => {
  console.log('✅ 已连接并认证成功');
});

client.onFullData((matches) => {
  console.log(`📊 收到全量数据: ${matches.length} 场赛事`);
  // 更新前端显示
});

client.onMatchAdd((data) => {
  console.log('➕ 新增赛事:', data.match);
  // 添加到前端列表
});

client.onMatchRemove((data) => {
  console.log('➖ 删除赛事:', data.gid);
  // 从前端列表移除
});

client.onScoreUpdate((data) => {
  console.log('⚽ 比分更新:', data.match);
  // 更新前端比分显示
});

client.onOddsUpdate((data) => {
  console.log('💰 赔率更新:', data.match);
  // 更新前端赔率显示
});

// 连接
client.connect();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('正在关闭...');
  client.disconnect();
  process.exit(0);
});

export default CrownDataClient;

