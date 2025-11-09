import WebSocket, { WebSocketServer } from 'ws';
import { ScraperManager } from '../scrapers/ScraperManager';
import { MessageType, WSMessage, SubscribeOptions, ShowType } from '../types';
import logger from '../utils/logger';

interface Client {
  ws: WebSocket;
  id: string;
  isAuthenticated: boolean;
  subscriptions: Set<ShowType>;
  lastPing: number;
}

/**
 * WebSocket 服务器
 * 负责向客户端推送实时数据
 */
export class WSServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private scraperManager: ScraperManager;
  private heartbeatInterval?: NodeJS.Timeout;
  private authToken: string;

  constructor(port: number, scraperManager: ScraperManager) {
    this.scraperManager = scraperManager;
    this.authToken = process.env.WS_AUTH_TOKEN || 'default-token';

    this.wss = new WebSocketServer({ port });
    this.setupWebSocketServer();
    this.setupScraperEvents();
    this.startHeartbeat();

    logger.info(`WebSocket 服务器启动在端口 ${port}`);
  }

  /**
   * 设置 WebSocket 服务器
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: Client = {
        ws,
        id: clientId,
        isAuthenticated: false,
        subscriptions: new Set(),
        lastPing: Date.now(),
      };

      this.clients.set(clientId, client);
      logger.info(`客户端连接: ${clientId}, 当前连接数: ${this.clients.size}`);

      // 设置消息处理
      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, data);
      });

      // 设置断开处理
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`客户端断开: ${clientId}, 当前连接数: ${this.clients.size}`);
      });

      // 设置错误处理
      ws.on('error', (error) => {
        logger.error(`客户端错误 (${clientId}):`, error.message);
      });

      // 发送欢迎消息
      this.sendMessage(client, {
        type: MessageType.HEARTBEAT,
        data: { message: '连接成功，请先认证' },
        timestamp: Date.now(),
      });
    });
  }

  /**
   * 设置抓取器事件监听
   */
  private setupScraperEvents(): void {
    // 新增赛事
    this.scraperManager.on('match:add', ({ showType, match }) => {
      this.broadcast({
        type: MessageType.MATCH_ADD,
        data: { showType, match },
        timestamp: Date.now(),
      }, [showType]);
    });

    // 删除赛事
    this.scraperManager.on('match:remove', ({ showType, gid }) => {
      this.broadcast({
        type: MessageType.MATCH_REMOVE,
        data: { showType, gid },
        timestamp: Date.now(),
      }, [showType]);
    });

    // 赛事更新
    this.scraperManager.on('match:update', ({ showType, gid, match }) => {
      this.broadcast({
        type: MessageType.MATCH_UPDATE,
        data: { showType, gid, match },
        timestamp: Date.now(),
      }, [showType]);
    });

    // 比分更新
    this.scraperManager.on('score:update', ({ showType, gid, match }) => {
      this.broadcast({
        type: MessageType.SCORE_UPDATE,
        data: { showType, gid, match },
        timestamp: Date.now(),
      }, [showType]);
    });

    // 赔率更新
    this.scraperManager.on('odds:update', ({ showType, gid, match }) => {
      this.broadcast({
        type: MessageType.ODDS_UPDATE,
        data: { showType, gid, match },
        timestamp: Date.now(),
      }, [showType]);
    });
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(clientId: string, data: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case MessageType.AUTH:
          this.handleAuth(client, message.data);
          break;

        case MessageType.SUBSCRIBE:
          this.handleSubscribe(client, message.data);
          break;

        case MessageType.UNSUBSCRIBE:
          this.handleUnsubscribe(client, message.data);
          break;

        case MessageType.PING:
          this.handlePing(client);
          break;

        default:
          logger.warn(`未知消息类型: ${message.type}`);
      }
    } catch (error: any) {
      logger.error(`解析消息失败 (${clientId}):`, error.message);
      this.sendError(client, '消息格式错误');
    }
  }

  /**
   * 处理认证
   */
  private handleAuth(client: Client, data: any): void {
    const { token } = data || {};

    if (token === this.authToken) {
      client.isAuthenticated = true;
      this.sendMessage(client, {
        type: MessageType.HEARTBEAT,
        data: { message: '认证成功' },
        timestamp: Date.now(),
      });
      logger.info(`客户端认证成功: ${client.id}`);
    } else {
      this.sendError(client, '认证失败');
      logger.warn(`客户端认证失败: ${client.id}`);
    }
  }

  /**
   * 处理订阅
   */
  private handleSubscribe(client: Client, data: any): void {
    if (!client.isAuthenticated) {
      this.sendError(client, '请先认证');
      return;
    }

    const options: SubscribeOptions = data || {};
    const showTypes = options.showTypes || ['live', 'today', 'early'];

    // 添加订阅
    showTypes.forEach(type => client.subscriptions.add(type));

    // 为每个 showType 分别发送全量数据
    showTypes.forEach(showType => {
      const matches = this.scraperManager.getMatches(showType);

      this.sendMessage(client, {
        type: MessageType.FULL_DATA,
        data: { showType, matches },
        timestamp: Date.now(),
      });
    });

    logger.info(`客户端订阅: ${client.id}, 类型: ${showTypes.join(', ')}`);
  }

  /**
   * 处理取消订阅
   */
  private handleUnsubscribe(client: Client, data: any): void {
    const options: SubscribeOptions = data || {};
    const showTypes = options.showTypes || [];

    showTypes.forEach(type => client.subscriptions.delete(type));

    this.sendMessage(client, {
      type: MessageType.HEARTBEAT,
      data: { message: '取消订阅成功' },
      timestamp: Date.now(),
    });

    logger.info(`客户端取消订阅: ${client.id}, 类型: ${showTypes.join(', ')}`);
  }

  /**
   * 处理 Ping
   */
  private handlePing(client: Client): void {
    client.lastPing = Date.now();
    this.sendMessage(client, {
      type: MessageType.HEARTBEAT,
      data: { message: 'pong' },
      timestamp: Date.now(),
    });
  }

  /**
   * 发送消息给客户端
   */
  private sendMessage(client: Client, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(client: Client, error: string): void {
    this.sendMessage(client, {
      type: MessageType.ERROR,
      data: { error },
      timestamp: Date.now(),
    });
  }

  /**
   * 广播消息
   */
  private broadcast(message: WSMessage, showTypes?: ShowType[]): void {
    for (const client of this.clients.values()) {
      // 只发送给已认证的客户端
      if (!client.isAuthenticated) continue;

      // 如果指定了 showTypes，只发送给订阅了这些类型的客户端
      if (showTypes && showTypes.length > 0) {
        const hasSubscription = showTypes.some(type => 
          client.subscriptions.has(type)
        );
        if (!hasSubscription) continue;
      }

      this.sendMessage(client, message);
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60秒超时

      for (const [clientId, client] of this.clients) {
        // 检查是否超时
        if (now - client.lastPing > timeout) {
          logger.warn(`客户端超时，断开连接: ${clientId}`);
          client.ws.close();
          this.clients.delete(clientId);
          continue;
        }

        // 发送心跳
        this.sendMessage(client, {
          type: MessageType.HEARTBEAT,
          data: { 
            timestamp: now,
            status: this.scraperManager.getStatus(),
          },
          timestamp: now,
        });
      }
    }, 30000); // 每30秒发送一次心跳
  }

  /**
   * 生成客户端 ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 关闭服务器
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss.close(() => {
      logger.info('WebSocket 服务器已关闭');
    });
  }

  /**
   * 获取连接数
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

