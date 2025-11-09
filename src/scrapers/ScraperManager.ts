import { CrownScraper } from './CrownScraper';
import { AccountConfig, Match, ShowType, ScraperStatus } from '../types';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * 抓取器管理器
 * 管理多个抓取器实例，每个 showType 使用独立的账号
 */
export class ScraperManager extends EventEmitter {
  private scrapers: Map<ShowType, CrownScraper> = new Map();
  private intervals: Map<ShowType, NodeJS.Timeout> = new Map();
  private matchesCache: Map<ShowType, Map<string, Match>> = new Map();
  private status: Map<ShowType, ScraperStatus> = new Map();

  constructor() {
    super();
    this.initializeCache();
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
    const scraper = new CrownScraper(account);
    this.scrapers.set(account.showType, scraper);
    logger.info(`添加抓取器: ${account.showType} (账号: ${account.username})`);
  }

  /**
   * 启动所有抓取器
   */
  async startAll(): Promise<void> {
    logger.info('启动所有抓取器...');
    
    for (const [showType, scraper] of this.scrapers) {
      await this.start(showType);
    }
  }

  /**
   * 启动指定类型的抓取器
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

    // 立即执行一次
    await this.fetchAndUpdate(showType);

    // 设置定时任务
    const interval = this.getInterval(showType);
    const timer = setInterval(async () => {
      await this.fetchAndUpdate(showType);
    }, interval * 1000);

    this.intervals.set(showType, timer);
  }

  /**
   * 停止指定类型的抓取器
   */
  stop(showType: ShowType): void {
    const timer = this.intervals.get(showType);
    if (timer) {
      clearInterval(timer);
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
  stopAll(): void {
    logger.info('停止所有抓取器...');
    for (const showType of this.scrapers.keys()) {
      this.stop(showType);
    }
  }

  /**
   * 抓取并更新数据
   */
  private async fetchAndUpdate(showType: ShowType): Promise<void> {
    const scraper = this.scrapers.get(showType);
    const status = this.status.get(showType)!;

    if (!scraper) return;

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

      // 检测变化并发送事件
      this.detectChanges(showType, oldMatches, cache);

      // 更新状态
      status.lastFetchTime = Date.now();
      status.matchCount = matches.length;
      status.lastError = undefined;

      logger.debug(`[${showType}] 抓取完成，共 ${matches.length} 场赛事`);
    } catch (error: any) {
      logger.error(`[${showType}] 抓取失败:`, error.message);
      status.errorCount++;
      status.lastError = error.message;
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
        return parseInt(process.env.LIVE_FETCH_INTERVAL || '2');
      case 'today':
        return parseInt(process.env.TODAY_FETCH_INTERVAL || '10');
      case 'early':
        return parseInt(process.env.EARLY_FETCH_INTERVAL || '30');
      default:
        return 10;
    }
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
}

