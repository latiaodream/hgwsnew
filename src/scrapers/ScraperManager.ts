import { CrownScraper } from './CrownScraper';
import { AccountConfig, Match, ShowType, ScraperStatus } from '../types';
import logger from '../utils/logger';
import { EventEmitter } from 'events';
import { CrownMatchRepository } from '../repositories/CrownMatchRepository';

/**
 * 抓取器管理器
 * 管理多个抓取器实例，每个 showType 使用独立的账号
 */
export class ScraperManager extends EventEmitter {
  private scrapers: Map<ShowType, CrownScraper> = new Map();
  private intervals: Map<ShowType, NodeJS.Timeout> = new Map();
  private matchesCache: Map<ShowType, Map<string, Match>> = new Map();
  private status: Map<ShowType, ScraperStatus> = new Map();
  private sharedScraper: CrownScraper | null = null; // 共享的抓取器
  private currentShowType: ShowType = 'live'; // 当前抓取的类型
  private showTypeQueue: ShowType[] = ['live', 'today', 'early']; // 轮询队列
  private accountPools: Map<ShowType, AccountConfig[]> = new Map();
  private activeAccountIndex: Map<ShowType, number> = new Map();
  private rotationTimers: Map<ShowType, NodeJS.Timeout> = new Map();
  private rotating: Set<ShowType> = new Set();
  private readonly rotationIntervalMinutes: Map<ShowType, number> = new Map([
    ['live', parseInt(process.env.LIVE_ROTATION_MINUTES || '30', 10)],
    ['today', parseInt(process.env.TODAY_ROTATION_MINUTES || '60', 10)],
    ['early', parseInt(process.env.EARLY_ROTATION_MINUTES || '60', 10)],
  ]);
  private crownMatchRepository: CrownMatchRepository;
  private useDatabase: boolean = true;

  constructor() {
    super();
    this.crownMatchRepository = new CrownMatchRepository();
    this.initializeCache();
  }

  /**
   * 设置是否使用数据库
   */
  setUseDatabase(useDatabase: boolean): void {
    this.useDatabase = useDatabase;
    logger.info(`[ScraperManager] useDatabase 设置为: ${useDatabase}`);
  }

  isUsingDatabase(): boolean {
    return this.useDatabase;
  }

  /**
   * 初始化缓存
   */
  private initializeCache(): void {
    const showTypes: ShowType[] = ['live', 'today', 'early'];
    showTypes.forEach(type => {
      this.matchesCache.set(type, new Map());
      this.status.set(type, {
        showType: type,
        isRunning: false,
        matchCount: 0,
        errorCount: 0,
      });
    });
  }

  /**
   * 添加抓取器
   */
  addScraper(account: AccountConfig): void {
    const pool = this.accountPools.get(account.showType) || [];
    pool.push(account);
    this.accountPools.set(account.showType, pool);

    if (!this.sharedScraper) {
      this.sharedScraper = new CrownScraper(account);
      logger.info(`创建共享抓取器 (账号: ${account.username})`);
    }

    if (!this.scrapers.has(account.showType)) {
      const scraper = new CrownScraper(account);
      this.scrapers.set(account.showType, scraper);
      this.activeAccountIndex.set(account.showType, 0);
      logger.info(`添加抓取器: ${account.showType} (账号: ${account.username})`);
    } else {
      logger.info(`加入账号池: ${account.showType} (账号: ${account.username})，当前池大小: ${pool.length}`);
    }
  }

  /**
   * 启动所有抓取器
   */
  async startAll(): Promise<void> {
    logger.info('启动所有抓取器...');

    // 先尝试登出所有账号（清除之前可能残留的会话）
    logger.info('🔄 清除之前的登录会话...');
    const logoutPromises: Promise<void>[] = [];

    for (const scraper of this.scrapers.values()) {
      logoutPromises.push(scraper.logout());
    }

    if (this.sharedScraper) {
      logoutPromises.push(this.sharedScraper.logout());
    }

    await Promise.all(logoutPromises);
    logger.info('✅ 之前的登录会话已清除');

    // 等待一下，确保登出完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 检查是否所有账号都相同
    const accounts = Array.from(this.scrapers.values()).map(s => (s as any).account);
    const allSameAccount = accounts.every(acc =>
      acc.username === accounts[0].username && acc.password === accounts[0].password
    );

    if (allSameAccount && accounts.length > 1) {
      logger.info('⚠️ 检测到使用相同账号，启用轮询模式避免同时登录');
      await this.startRotation();
    } else {
      // 不同账号，正常启动
      for (const [showType, scraper] of this.scrapers) {
        await this.start(showType);
      }
      this.setupAccountRotationSchedules();
    }
  }

  /**
   * 启动轮询模式（用于相同账号）
   * 每1小时切换一次账号，每个账号抓取1小时
   */
  private async startRotation(): Promise<void> {
    logger.info('🔄 启动轮询模式（每1小时切换账号）...');

    // 只保留队列中存在的类型
    this.showTypeQueue = this.showTypeQueue.filter(type => this.scrapers.has(type));

    if (this.showTypeQueue.length === 0) {
      logger.warn('没有可用的抓取器');
      return;
    }

    // 立即登录并开始抓取第一个账号
    await this.rotateAccount();

    // 设置定时任务（每1小时切换一次账号）
    const timer = setInterval(async () => {
      await this.rotateAccount();
    }, 60 * 60 * 1000); // 1小时 = 60分钟 * 60秒 * 1000毫秒

    this.intervals.set('rotation' as ShowType, timer);
  }

  /**
   * 切换账号并重新登录
   */
  private async rotateAccount(): Promise<void> {
    if (!this.sharedScraper) return;

    try {
      // 先登出当前账号
      logger.info('🚪 登出当前账号...');
      await this.sharedScraper.logout();

      // 等待1秒
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 重新登录
      logger.info('🔐 重新登录账号...');
      const loginSuccess = await this.sharedScraper.login();

      if (!loginSuccess) {
        logger.error('❌ 账号登录失败');
        return;
      }

      logger.info('✅ 账号登录成功，开始抓取数据');

      // 开始抓取所有类型的数据
      await this.startFetchingAllTypes();

    } catch (error: any) {
      logger.error('❌ 切换账号失败:', error.message);
    }
  }

  /**
   * 开始抓取所有类型的数据（优化：使用递归 setTimeout）
   */
  private async startFetchingAllTypes(): Promise<void> {
    // 清除之前的抓取定时器
    for (const showType of this.showTypeQueue) {
      const timer = this.intervals.get(showType);
      if (timer) {
        clearTimeout(timer); // 使用 clearTimeout
        this.intervals.delete(showType);
      }
    }

    // 为每个类型设置独立的抓取循环
    for (const showType of this.showTypeQueue) {
      const runLoop = async () => {
        // 如果定时器已被清除（说明被停止了），则不再继续
        if (!this.intervals.has(showType)) return;

        try {
          await this.fetchType(showType);
        } catch (error) {
          logger.error(`[${showType}] 轮询抓取异常:`, error);
        }

        // 再次检查是否被停止
        if (!this.intervals.has(showType)) return;

        // 安排下一次抓取
        const interval = this.getInterval(showType);
        const timer = setTimeout(runLoop, interval * 1000);
        this.intervals.set(showType, timer);
      };

      // 立即启动循环（先设置一个占位符，防止 runLoop 刚开始就被认为已停止）
      // 注意：这里我们用一个立即执行的 timeout 作为初始句柄
      const initialTimer = setTimeout(runLoop, 0);
      this.intervals.set(showType, initialTimer);
    }
  }

  /**
   * 抓取指定类型的数据
   */
  private async fetchType(showType: ShowType): Promise<void> {
    if (!this.sharedScraper) return;
    if (this.sharedScraper.isSuspended()) {
      const info = this.sharedScraper.getSuspensionInfo();
      logger.warn(
        `[${showType}] 共享账号冷却中 (${info?.reason || '未知原因'})，暂停抓取`
      );
      return;
    }

    try {
      // 使用共享抓取器抓取数据
      const matches = await this.sharedScraper.fetchMatchesByType(showType);
      logger.info(`[${showType}] 📥 抓取完成，获得 ${matches.length} 场赛事`);

      const cache = this.matchesCache.get(showType)!;
      const oldMatches = new Map(cache);
      logger.info(`[${showType}] 📦 缓存状态: 旧=${oldMatches.size}, 新=${matches.length}`);

      // 更新缓存
      cache.clear();
      matches.forEach(match => {
        cache.set(match.gid, match);
      });
      logger.info(`[${showType}] 💾 缓存已更新`);

      // 存储到数据库
      logger.info(`[${showType}] 🔍 数据库保存检查: useDatabase=${this.useDatabase}, matches.length=${matches.length}`);

      if (this.useDatabase) {
        try {
          logger.info(`[${showType}] 📝 开始转换数据格式...`);
          const crownMatches = this.convertToCrownMatches(matches, showType);
          logger.info(
            `[${showType}] 📝 转换完成，将重置数据库为 ${crownMatches.length} 场赛事...`
          );

          const saved = await this.crownMatchRepository.replaceByShowType(showType, crownMatches);
          logger.info(`[${showType}] ✅ 数据库已重置，当前保存 ${saved} 场赛事`);
        } catch (dbError: any) {
          logger.error(`[${showType}] ❌ 保存到数据库失败:`, dbError.message);
          logger.error(`[${showType}] 错误堆栈:`, dbError.stack);
        }
      } else if (!this.useDatabase) {
        logger.warn(`[${showType}] ⚠️ useDatabase=false，跳过数据库保存`);
      }

      // 检测变化并发送事件
      this.detectChanges(showType, oldMatches, cache);

      // 更新状态
      const status = this.status.get(showType)!;
      status.lastFetchTime = Date.now();
      status.matchCount = matches.length;
      status.lastError = undefined;
      status.isRunning = true;

      logger.info(`[${showType}] 抓取到 ${matches.length} 场赛事`);
    } catch (error: any) {
      // 格式化错误信息
      const errorMsg = error?.message || String(error);
      const errorCode = error?.code;
      const errorStatus = error?.response?.status;

      let errorDetail = errorMsg;
      if (errorCode) errorDetail += ` (code: ${errorCode})`;
      if (errorStatus) errorDetail += ` (status: ${errorStatus})`;

      logger.error(`[${showType}] 抓取失败: ${errorDetail}`);

      const status = this.status.get(showType)!;
      status.errorCount++;
      status.lastError = errorDetail;
    }
  }

  /**
   * 启动指定类型的抓取器（优化：使用递归 setTimeout）
   */
  async start(showType: ShowType): Promise<void> {
    const scraper = this.scrapers.get(showType);
    if (!scraper) {
      logger.warn(`抓取器不存在: ${showType}`);
      return;
    }

    // 如果已经在运行，先停止
    if (this.intervals.has(showType)) {
      this.stop(showType);
    }

    logger.info(`启动抓取器: ${showType}`);

    // 更新状态
    const status = this.status.get(showType)!;
    status.isRunning = true;

    // 早盘特殊处理：抓取一次后立即退出，等待下次轮换
    if (showType === 'early') {
      await this.fetchAndUpdate(showType);
      logger.info(`[${showType}] 早盘抓取完成，退出账号等待下次轮换`);
      await scraper.logout();
      return;
    }

    // 定义递归循环函数
    const runLoop = async () => {
      // 检查是否被停止（通过检查 status.isRunning）
      if (!this.status.get(showType)?.isRunning) return;

      try {
        await this.fetchAndUpdate(showType);
      } catch (error) {
        logger.error(`[${showType}] 抓取循环异常:`, error);
      }

      // 再次检查是否被停止
      if (!this.status.get(showType)?.isRunning) return;

      // 安排下一次抓取
      const interval = this.getInterval(showType);
      const timer = setTimeout(runLoop, interval * 1000);
      this.intervals.set(showType, timer);
    };

    // 立即启动循环
    // 使用 setTimeout(..., 0) 确保 timer ID 被正确存入 intervals
    const initialTimer = setTimeout(runLoop, 0);
    this.intervals.set(showType, initialTimer);
  }

  /**
   * 停止指定类型的抓取器
   */
  stop(showType: ShowType): void {
    const timer = this.intervals.get(showType);
    if (timer) {
      clearTimeout(timer); // Changed from clearInterval
      this.intervals.delete(showType);
      logger.info(`停止抓取器: ${showType}`);
    }

    const status = this.status.get(showType);
    if (status) {
      status.isRunning = false;
    }
  }

  /**
   * 停止所有抓取器
   */
  async stopAll(): Promise<void> {
    logger.info('停止所有抓取器...');

    // 停止所有定时任务
    for (const showType of this.scrapers.keys()) {
      this.stop(showType);
    }

    // 停止轮询任务
    const rotationTimer = this.intervals.get('rotation' as ShowType);
    if (rotationTimer) {
      clearInterval(rotationTimer);
      this.intervals.delete('rotation' as ShowType);
    }

    // 停止账号轮换定时器
    for (const timer of this.rotationTimers.values()) {
      clearInterval(timer);
    }
    this.rotationTimers.clear();
    this.rotating.clear();

    // 登出所有账号
    logger.info('登出所有账号...');
    const logoutPromises: Promise<void>[] = [];

    for (const scraper of this.scrapers.values()) {
      logoutPromises.push(scraper.logout());
    }

    if (this.sharedScraper) {
      logoutPromises.push(this.sharedScraper.logout());
    }

    await Promise.all(logoutPromises);
    logger.info('✅ 所有账号已登出');
  }

  /**
   * 抓取并更新数据
   */
  private async fetchAndUpdate(showType: ShowType): Promise<void> {
    const scraper = this.scrapers.get(showType);
    const status = this.status.get(showType)!;

    if (!scraper) return;

    // 不再检查账号暂停状态，按时间轮换即可
    // 即使遇到风险提示也继续抓取，直到时间到了才换账号

    try {
      logger.debug(`[${showType}] 开始抓取...`);

      const matches = await scraper.fetchMatches();
      const cache = this.matchesCache.get(showType)!;
      const oldMatches = new Map(cache);

      // 更新缓存
      cache.clear();
      matches.forEach(match => {
        cache.set(match.gid, match);
      });

      // 存储到数据库
      logger.info(`[${showType}] 🔍 数据库保存检查: useDatabase=${this.useDatabase}, matches.length=${matches.length}`);

      if (this.useDatabase) {
        try {
          logger.info(`[${showType}] 📝 开始转换数据格式...`);
          const crownMatches = this.convertToCrownMatches(matches, showType);
          logger.info(
            `[${showType}] 📝 转换完成，将重置数据库为 ${crownMatches.length} 场赛事...`
          );

          const saved = await this.crownMatchRepository.replaceByShowType(showType, crownMatches);
          logger.info(`[${showType}] ✅ 数据库已重置，当前保存 ${saved} 场赛事`);
        } catch (dbError: any) {
          logger.error(`[${showType}] ❌ 保存到数据库失败:`, dbError.message);
          logger.error(`[${showType}] 错误堆栈:`, dbError.stack);
        }
      } else if (!this.useDatabase) {
        logger.warn(`[${showType}] ⚠️ useDatabase=false，跳过数据库保存`);
      }

      // 检测变化并发送事件
      this.detectChanges(showType, oldMatches, cache);

      // 更新状态
      status.lastFetchTime = Date.now();
      status.matchCount = matches.length;
      status.lastError = undefined;

      logger.debug(`[${showType}] 抓取完成，共 ${matches.length} 场赛事`);
    } catch (error: any) {
      // 格式化错误信息
      const errorMsg = error?.message || String(error);
      const errorCode = error?.code;
      const errorStatus = error?.response?.status;

      let errorDetail = errorMsg;
      if (errorCode) errorDetail += ` (code: ${errorCode})`;
      if (errorStatus) errorDetail += ` (status: ${errorStatus})`;

      logger.error(`[${showType}] 抓取失败: ${errorDetail}`);

      status.errorCount++;
      status.lastError = errorDetail;
      // 即使失败也继续，等待定时轮换
    }
  }

  /**
   * 检测数据变化
   */
  private detectChanges(
    showType: ShowType,
    oldMatches: Map<string, Match>,
    newMatches: Map<string, Match>
  ): void {
    // 检测新增的赛事
    for (const [gid, match] of newMatches) {
      if (!oldMatches.has(gid)) {
        this.emit('match:add', { showType, match });
      }
    }

    // 检测删除的赛事
    for (const [gid, match] of oldMatches) {
      if (!newMatches.has(gid)) {
        this.emit('match:remove', { showType, gid, match });
      }
    }

    // 检测更新的赛事
    for (const [gid, newMatch] of newMatches) {
      const oldMatch = oldMatches.get(gid);
      if (oldMatch) {
        // 检测比分变化
        if (
          oldMatch.home_score !== newMatch.home_score ||
          oldMatch.away_score !== newMatch.away_score
        ) {
          this.emit('score:update', { showType, gid, match: newMatch });
        }

        // 检测赔率变化
        if (this.hasOddsChanged(oldMatch, newMatch)) {
          this.emit('odds:update', { showType, gid, match: newMatch });
        }

        // 检测其他变化
        if (this.hasMatchChanged(oldMatch, newMatch)) {
          this.emit('match:update', { showType, gid, match: newMatch });
        }
      }
    }
  }

  /**
   * 检测赔率是否变化
   */
  private hasOddsChanged(oldMatch: Match, newMatch: Match): boolean {
    return JSON.stringify(oldMatch.markets) !== JSON.stringify(newMatch.markets);
  }

  /**
   * 检测赛事是否变化
   */
  private hasMatchChanged(oldMatch: Match, newMatch: Match): boolean {
    return (
      oldMatch.state !== newMatch.state ||
      oldMatch.match_time !== newMatch.match_time
    );
  }

  /**
   * 获取抓取间隔（秒）
   */
  private getInterval(showType: ShowType): number {
    switch (showType) {
      case 'live':
        return parseInt(process.env.LIVE_FETCH_INTERVAL || '10');
      case 'today':
        return parseInt(process.env.TODAY_FETCH_INTERVAL || '60');
      case 'early':
        return parseInt(process.env.EARLY_FETCH_INTERVAL || '3600');
      default:
        return 10;
    }
  }

  private setupAccountRotationSchedules(): void {
    for (const [showType, pool] of this.accountPools.entries()) {
      if (pool.length <= 1) continue;
      if (this.rotationTimers.has(showType)) continue;

      const rotationMinutes = this.rotationIntervalMinutes.get(showType) || 60;
      if (!Number.isFinite(rotationMinutes) || rotationMinutes <= 0) {
        continue;
      }

      const intervalMs = rotationMinutes * 60 * 1000;
      const timer = setInterval(() => {
        this.rotateAccountForShowType(showType).catch(error =>
          logger.error(`[${showType}] 定时轮换失败: ${error?.message || error}`)
        );
      }, intervalMs);

      this.rotationTimers.set(showType, timer);
      logger.info(
        `[${showType}] 启动账号轮换：池大小 ${pool.length}，每 ${rotationMinutes} 分钟切换一次`
      );
    }
  }

  private async rotateAccountForShowType(
    showType: ShowType,
    options?: { skipRest?: boolean }
  ): Promise<boolean> {
    if (this.rotating.has(showType)) {
      logger.info(`[${showType}] 账号轮换正在进行中，跳过本次轮换`);
      return false;
    }

    const pool = this.accountPools.get(showType);
    if (!pool || pool.length <= 1) {
      return false;
    }

    this.rotating.add(showType);

    try {
      const nextIndex = this.getNextAccountIndex(showType);
      if (nextIndex === null) return false;

      const rotationMinutes = this.rotationIntervalMinutes.get(showType) || 60;
      logger.info(`[${showType}] ⏰ 时间到（${rotationMinutes}分钟），开始轮换账号`);
      logger.info(`[${showType}] 目标账号: ${pool[nextIndex].username}`);

      // 1. 停止当前抓取任务
      const oldScraper = this.scrapers.get(showType);
      this.stop(showType);
      logger.info(`[${showType}] ✅ 已停止抓取任务`);

      // 2. 强制退出当前账号（不管任何错误）
      if (oldScraper) {
        try {
          logger.info(`[${showType}] 正在退出当前账号...`);
          await oldScraper.logout();
          logger.info(`[${showType}] ✅ 当前账号已退出`);
        } catch (error: any) {
          logger.warn(`[${showType}] ⚠️ 账号登出失败（忽略）: ${error?.message || error}`);
        }
      }

      // 3. 等待一小段时间（避免立即登录）
      logger.info(`[${showType}] 等待 3 秒后登录新账号...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4. 创建新的抓取器并登录
      const nextAccount = pool[nextIndex];
      logger.info(`[${showType}] 正在登录新账号: ${nextAccount.username}`);
      const newScraper = new CrownScraper(nextAccount);
      this.scrapers.set(showType, newScraper);
      this.activeAccountIndex.set(showType, nextIndex);

      // 5. 启动新的抓取任务
      await this.start(showType);
      logger.info(`[${showType}] ✅ 账号切换完成 -> ${nextAccount.username}`);
      logger.info(`[${showType}] 下次轮换时间: ${rotationMinutes} 分钟后`);
      return true;
    } catch (error: any) {
      logger.error(`[${showType}] ❌ 账号轮换失败: ${error?.message || error}`);
      // 即使失败也继续，不影响下次轮换
      return false;
    } finally {
      this.rotating.delete(showType);
    }
  }

  private getNextAccountIndex(showType: ShowType): number | null {
    const pool = this.accountPools.get(showType);
    if (!pool || pool.length === 0) return null;

    const currentIndex = this.activeAccountIndex.get(showType) ?? 0;
    const nextIndex = (currentIndex + 1) % pool.length;
    return nextIndex;
  }

  /**
   * 获取所有赛事
   */
  getAllMatches(): Match[] {
    const allMatches: Match[] = [];
    for (const cache of this.matchesCache.values()) {
      allMatches.push(...cache.values());
    }
    return allMatches;
  }

  /**
   * 获取指定类型的赛事
   */
  getMatches(showType: ShowType): Match[] {
    const cache = this.matchesCache.get(showType);
    return cache ? Array.from(cache.values()) : [];
  }

  /**
   * 获取单场赛事
   */
  getMatch(gid: string): Match | undefined {
    for (const cache of this.matchesCache.values()) {
      const match = cache.get(gid);
      if (match) return match;
    }
    return undefined;
  }

  /**
   * 获取所有抓取器状态
   */
  getStatus(): ScraperStatus[] {
    return Array.from(this.status.values());
  }

  /**
   * 获取指定类型的抓取器状态
   */
  getStatusByType(showType: ShowType): ScraperStatus | undefined {
    return this.status.get(showType);
  }

  /**
   * 转换 Match 为 CrownMatch 格式
   */
  private convertToCrownMatches(matches: Match[], showType: ShowType): any[] {
    return matches.map(match => ({
      gid: match.gid,
      show_type: showType,
      league: match.league_zh || match.league,
      team_home: match.home_zh || match.home,
      team_away: match.away_zh || match.away,
      match_time: match.match_time,
      handicap: match.markets?.full?.handicapLines?.[0]?.hdp,
      handicap_home: match.markets?.full?.handicapLines?.[0]?.home,
      handicap_away: match.markets?.full?.handicapLines?.[0]?.away,
      over_under: match.markets?.full?.overUnderLines?.[0]?.hdp,
      over: match.markets?.full?.overUnderLines?.[0]?.over,
      under: match.markets?.full?.overUnderLines?.[0]?.under,
      home_win: match.markets?.moneyline?.home,
      draw: match.markets?.moneyline?.draw,
      away_win: match.markets?.moneyline?.away,
      strong: undefined, // 需要从原始数据中提取
      more: undefined, // 需要从原始数据中提取
      raw_data: match.raw || match,
    }));
  }
}
