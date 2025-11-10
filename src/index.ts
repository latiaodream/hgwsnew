import dotenv from 'dotenv';
import { ScraperManager } from './scrapers/ScraperManager';
import { WSServer } from './websocket/WSServer';
import { AccountConfig } from './types';
import logger from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// 加载环境变量
dotenv.config();

/**
 * 主应用类
 */
class Application {
  private scraperManager: ScraperManager;
  private wsServer?: WSServer;
  private httpServer?: http.Server;

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

    // 创建 PID 文件
    this.createPidFile();

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

    // 启动 HTTP 服务器（用于展示页面）
    const httpPort = parseInt(process.env.HTTP_PORT || '10089');
    this.startHttpServer(httpPort);

    logger.info('='.repeat(60));
    logger.info('✅ 服务启动成功');
    logger.info(`📡 WebSocket 服务器: ws://localhost:${wsPort}`);
    logger.info(`🌐 HTTP 服务器: http://localhost:${httpPort}/matches`);
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
   * 创建 PID 文件
   */
  private createPidFile(): void {
    const pidFile = path.join(process.cwd(), 'crown-scraper.pid');

    // 检查是否有旧的 PID 文件
    if (fs.existsSync(pidFile)) {
      const oldPid = fs.readFileSync(pidFile, 'utf-8').trim();
      logger.warn(`⚠️ 检测到旧的 PID 文件: ${oldPid}`);
      logger.warn(`⚠️ 如果旧进程还在运行，请先停止它以避免账号被封`);

      // 删除旧的 PID 文件
      fs.unlinkSync(pidFile);
    }

    // 写入当前进程 PID
    fs.writeFileSync(pidFile, process.pid.toString());
    logger.info(`📝 PID 文件已创建: ${process.pid}`);
  }

  /**
   * 删除 PID 文件
   */
  private removePidFile(): void {
    const pidFile = path.join(process.cwd(), 'crown-scraper.pid');
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      logger.info('🗑️ PID 文件已删除');
    }
  }

  /**
   * 启动 HTTP 服务器
   */
  private startHttpServer(port: number): void {
    this.httpServer = http.createServer((req, res) => {
      // 处理 /matches 路径
      if (req.url === '/matches' || req.url === '/matches.html') {
        const filePath = path.join(process.cwd(), 'public', 'matches.html');

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
        });
      } else if (req.url === '/matches-v2' || req.url === '/matches-v2.html') {
        // 处理 /matches-v2 路径
        const filePath = path.join(process.cwd(), 'public', 'matches-v2.html');

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    });

    this.httpServer.listen(port, () => {
      logger.info(`HTTP 服务器启动在端口 ${port}`);
    });
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 正在关闭服务...');

    try {
      // 1. 停止抓取器并登出所有账号
      logger.info('1️⃣ 停止抓取器并登出账号...');
      await this.scraperManager.stopAll();

      // 2. 关闭 WebSocket 服务器
      logger.info('2️⃣ 关闭 WebSocket 服务器...');
      if (this.wsServer) {
        this.wsServer.close();
      }

      // 3. 关闭 HTTP 服务器
      logger.info('3️⃣ 关闭 HTTP 服务器...');
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          if (this.httpServer) {
            this.httpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      }

      // 4. 删除 PID 文件
      this.removePidFile();

      logger.info('✅ 服务已安全关闭');
      process.exit(0);
    } catch (error: any) {
      logger.error('❌ 关闭服务时出错:', error.message);
      this.removePidFile();
      process.exit(1);
    }
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

