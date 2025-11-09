import dotenv from 'dotenv';
import { ScraperManager } from './scrapers/ScraperManager';
import { WSServer } from './websocket/WSServer';
import { AccountConfig } from './types';
import logger from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// 加载环境变量
dotenv.config();

/**
 * 主应用类
 */
class Application {
  private scraperManager: ScraperManager;
  private wsServer?: WSServer;

  constructor() {
    this.scraperManager = new ScraperManager();
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    logger.info('='.repeat(60));
    logger.info('🚀 皇冠数据抓取服务');
    logger.info('='.repeat(60));

    // 创建日志目录
    this.ensureLogDirectory();

    // 加载账号配置
    const accounts = this.loadAccounts();
    if (accounts.length === 0) {
      logger.error('❌ 没有配置任何账号，请检查环境变量');
      process.exit(1);
    }

    // 添加抓取器
    accounts.forEach(account => {
      this.scraperManager.addScraper(account);
    });

    // 启动抓取器
    await this.scraperManager.startAll();

    // 启动 WebSocket 服务器
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    this.wsServer = new WSServer(wsPort, this.scraperManager);

    logger.info('='.repeat(60));
    logger.info('✅ 服务启动成功');
    logger.info(`📡 WebSocket 服务器: ws://localhost:${wsPort}`);
    logger.info(`🔑 认证令牌: ${process.env.WS_AUTH_TOKEN || 'default-token'}`);
    logger.info('='.repeat(60));
  }

  /**
   * 加载账号配置
   */
  private loadAccounts(): AccountConfig[] {
    const accounts: AccountConfig[] = [];

    // 滚球账号
    if (process.env.LIVE_CROWN_USERNAME && process.env.LIVE_CROWN_PASSWORD) {
      accounts.push({
        username: process.env.LIVE_CROWN_USERNAME,
        password: process.env.LIVE_CROWN_PASSWORD,
        showType: 'live',
      });
      logger.info(`✅ 加载滚球账号: ${process.env.LIVE_CROWN_USERNAME}`);
    }

    // 今日账号
    if (process.env.TODAY_CROWN_USERNAME && process.env.TODAY_CROWN_PASSWORD) {
      accounts.push({
        username: process.env.TODAY_CROWN_USERNAME,
        password: process.env.TODAY_CROWN_PASSWORD,
        showType: 'today',
      });
      logger.info(`✅ 加载今日账号: ${process.env.TODAY_CROWN_USERNAME}`);
    }

    // 早盘账号
    if (process.env.EARLY_CROWN_USERNAME && process.env.EARLY_CROWN_PASSWORD) {
      accounts.push({
        username: process.env.EARLY_CROWN_USERNAME,
        password: process.env.EARLY_CROWN_PASSWORD,
        showType: 'early',
      });
      logger.info(`✅ 加载早盘账号: ${process.env.EARLY_CROWN_USERNAME}`);
    }

    return accounts;
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('正在关闭服务...');

    // 停止抓取器
    this.scraperManager.stopAll();

    // 关闭 WebSocket 服务器
    if (this.wsServer) {
      this.wsServer.close();
    }

    logger.info('服务已关闭');
    process.exit(0);
  }
}

// 创建应用实例
const app = new Application();

// 启动应用
app.initialize().catch(error => {
  logger.error('启动失败:', error);
  process.exit(1);
});

// 处理退出信号
process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号');
  app.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号');
  app.shutdown();
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  app.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝:', reason);
  app.shutdown();
});

