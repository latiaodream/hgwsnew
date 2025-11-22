import dotenv from 'dotenv';
import express from 'express';
import { ScraperManager } from './scrapers/ScraperManager';
import { WSServer } from './websocket/WSServer';
import { AccountConfig, ShowType } from './types';
import logger from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import matchesRouter, { setScraperManager } from './routes/matches';
import { testConnection, initDatabase, closeDatabase } from './config/database';
import { MatchHistoryService } from './services/MatchHistoryService';


// 全局关闭 TLS 证书校验（配合各类代理，避免 UNABLE_TO_VERIFY_LEAF_SIGNATURE）
// 仅用于该服务的抓取场景，线上环境默认已经依赖固定站点域名
(process as any).env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// 加载环境变量
dotenv.config();

/**
 * 主应用类
 */
class Application {
  private scraperManager: ScraperManager;
  private wsServer?: WSServer;
  private httpServer?: http.Server;
  private expressApp: express.Application;
  private historyService?: MatchHistoryService;
  private databaseReady: boolean = false;

  constructor() {
    this.scraperManager = new ScraperManager();
    this.expressApp = express();
    this.setupExpress();
  }

  /**
   * 设置 Express 中间件和路由
   */
  private setupExpress(): void {
    // 解析 JSON 请求体
    this.expressApp.use(express.json());
    this.expressApp.use(express.urlencoded({ extended: true }));

    // 静态文件服务
    this.expressApp.use(express.static(path.join(process.cwd(), 'public')));

    // API 路由（已简化：仅保留核心抓取与推送功能）
    this.expressApp.use('/api/matches', matchesRouter);

    // 页面路由
    // 现在仅保留 matches-v2 界面为主界面
    this.expressApp.get('/', (req, res) => {
      res.redirect('/matches-v2');
    });

    this.expressApp.get('/matches-v2', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public', 'matches-v2.html'));
    });

    // 404 处理
    this.expressApp.use((req, res) => {
      res.status(404).send('404 Not Found');
    });
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

    // 初始化数据库
    logger.info('📦 初始化数据库连接...');
    const dbConnected = await testConnection();
    if (dbConnected) {
      logger.info('✅ 数据库连接成功');
      await initDatabase();
      logger.info('✅ 数据库表初始化完成');
      this.databaseReady = true;
      this.scraperManager.setUseDatabase(true);
      // 
      this.historyService = undefined;
    } else {
      logger.warn('⚠️ 数据库连接失败，将使用 JSON 文件存储');
      this.databaseReady = false;
      this.scraperManager.setUseDatabase(false);
    }

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

    // 设置 ScraperManager 到路由
    setScraperManager(this.scraperManager);

    // 第三方 iSports 已彻底废弃，不再启动 ThirdPartyManager

    // 启动 HTTP 服务器（用于展示页面和 API）
    const httpPort = parseInt(process.env.HTTP_PORT || '10089');
    this.startHttpServer(httpPort);

    // 启动 WebSocket 服务器
    const enableWS = process.env.ENABLE_WEBSOCKET !== '0';
    if (enableWS) {
      const wsPort = parseInt(process.env.WS_PORT || '8080');
      try {
        this.wsServer = new WSServer(wsPort, this.scraperManager);
        logger.info(`📡 WebSocket 服务器: ws://localhost:${wsPort}`);
      } catch (error: any) {
        logger.warn(`⚠️ WebSocket 服务器启动失败 (端口 ${wsPort} 可能被占用): ${error.message}`);
        logger.warn(`⚠️ 服务将继续运行，但 WebSocket 功能不可用`);
      }
    } else {
      logger.info(`⚠️ WebSocket 服务器已禁用 (ENABLE_WEBSOCKET=0)`);
    }

    logger.info('='.repeat(60));
    logger.info('✅ 服务启动成功');
    logger.info(`🌐 HTTP 服务器: http://localhost:${httpPort}`);
    logger.info(`📄 页面:`);
    logger.info(`   - 皇冠赛事中心: http://localhost:${httpPort}/matches-v2`);
    logger.info(`🔑 认证令牌: ${process.env.WS_AUTH_TOKEN || 'default-token'}`);
    logger.info('='.repeat(60));
  }

  /**
   * 加载账号配置
   */
  private loadAccounts(): AccountConfig[] {
    const accounts: AccountConfig[] = [];

    // 1) 从配置文件加载（可选）
    this.appendAccountsFromFile(accounts);

    // 2) 从环境变量加载单账号
    this.appendSingleAccount(
      accounts,
      'live',
      process.env.LIVE_CROWN_USERNAME,
      process.env.LIVE_CROWN_PASSWORD,
      '滚球账号'
    );
    this.appendSingleAccount(
      accounts,
      'today',
      process.env.TODAY_CROWN_USERNAME,
      process.env.TODAY_CROWN_PASSWORD,
      '今日账号'
    );
    this.appendSingleAccount(
      accounts,
      'early',
      process.env.EARLY_CROWN_USERNAME,
      process.env.EARLY_CROWN_PASSWORD,
      '早盘账号'
    );

    // 3) 从账号池加载
    this.appendAccountPool(accounts, 'live', process.env.LIVE_ACCOUNT_POOL, '滚球账号池');
    this.appendAccountPool(accounts, 'today', process.env.TODAY_ACCOUNT_POOL, '今日账号池');
    this.appendAccountPool(accounts, 'early', process.env.EARLY_ACCOUNT_POOL, '早盘账号池');

    return accounts;
  }

  /**
   * 从 accounts.json 或指定配置文件加载账号
   */
  private appendAccountsFromFile(accounts: AccountConfig[]): void {
    const filePath = process.env.ACCOUNTS_FILE || path.join(process.cwd(), 'accounts.json');
    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed?.accounts;
      if (!Array.isArray(list)) {
        logger.warn(`[Accounts] ${filePath} 格式无效，期望为数组或 { accounts: [] }`);
        return;
      }

      const validShowTypes: ShowType[] = ['live', 'today', 'early'];

      list.forEach((item: any, idx: number) => {
        if (!item) return;
        const username = String(item.username || '').trim();
        const password = String(item.password || '').trim();
        const showType = item.showType as ShowType;
        if (!username || !password || !showType || !validShowTypes.includes(showType)) {
          logger.warn(`[Accounts] 配置文件中的账号无效(#${idx + 1})`);
          return;
        }
        const proxyUrl = item.proxyUrl ? String(item.proxyUrl).trim() : undefined;
        accounts.push({ username, password, showType, proxyUrl });
        logger.info(
          `✅ 从配置文件加载账号(${showType}): ${username}${proxyUrl ? ' (带代理)' : ''}`
        );
      });
    } catch (error: any) {
      logger.error(`[Accounts] 读取配置文件失败: ${error?.message || error}`);
    }
  }

  private appendSingleAccount(
    accounts: AccountConfig[],
    showType: ShowType,
    username?: string,
    password?: string,
    label?: string
  ): void {
    if (!username || !password) return;
    const proxyEnvKey = `${showType.toUpperCase()}_CROWN_PROXY_URL`;
    const proxyUrl = (process.env as any)[proxyEnvKey] as string | undefined;

    accounts.push({ username, password, showType, proxyUrl });
    logger.info(`✅ 加载${label || showType}：${username}${proxyUrl ? ' (带代理)' : ''}`);
  }

  private appendAccountPool(
    accounts: AccountConfig[],
    showType: ShowType,
    raw?: string,
    label?: string
  ): void {
    if (!raw) return;
    const entries = raw
      .split(/[\r\n,]+/)
      .map(item => item.trim())
      .filter(Boolean);

    entries.forEach((entry, idx) => {
      const [credsPart, proxyPart] = entry.split('|');
      const [username, password] = credsPart.includes('/') ? credsPart.split('/') : credsPart.split(':');
      if (!username || !password) {
        logger.warn(`⚠️ ${label || showType} 中的账号格式无效: ${entry}`);
        return;
      }
      const proxyUrl = proxyPart ? proxyPart.trim() : undefined;
      accounts.push({
        username: username.trim(),
        password: password.trim(),
        showType,
        proxyUrl,
      });
      logger.info(`✅ 加载${label || showType} #${idx + 1}: ${username.trim()}${proxyUrl ? ' (带代理)' : ''}`);
    });
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
    this.httpServer = this.expressApp.listen(port, () => {
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

      // 2. 第三方 API 抓取器已废弃，无需处理
      logger.info('2️⃣ 第三方 API 抓取器已废弃，跳过');

      // 3. 关闭 WebSocket 服务器
      logger.info('3️⃣ 关闭 WebSocket 服务器...');
      if (this.wsServer) {
        this.wsServer.close();
      }

      // 4. 关闭 HTTP 服务器
      logger.info('4️⃣ 关闭 HTTP 服务器...');
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          if (this.httpServer) {
            this.httpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      }

      // 5. 停止历史记录服务
      logger.info('5️⃣ 停止历史记录服务...');
      this.historyService?.stop();

      // 6. 关闭数据库连接
      logger.info('6️⃣ 关闭数据库连接...');
      await closeDatabase();

      // 7. 删除 PID 文件
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
