/**
 * 第三方 API 管理器
 * 
 * 功能：
 * - 管理 iSportsAPI 和 Odds-API.io 两个抓取器
 * - 协调数据抓取和更新
 * - 提供统一的数据访问接口
 */

import { ISportsAPIScraper, ISportsMatch } from './ISportsAPIScraper';
import { OddsAPIScraper, OddsAPIMatch } from './OddsAPIScraper';
import logger from '../utils/logger';
import { getRedisClient } from '../utils/redisClient';
import { ThirdpartyMatchRepository } from '../repositories/ThirdpartyMatchRepository';
import { EventEmitter } from 'events';

export interface ThirdPartyData {
  isports: ISportsMatch[];
  oddsapi: OddsAPIMatch[];
  last_update: {
    isports: string;
    oddsapi: string;
  };
}

export class ThirdPartyManager extends EventEmitter {
  private isportsScraper: ISportsAPIScraper;
  private oddsapiScraper: OddsAPIScraper;
  private fetchInterval: number;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private redisClient = getRedisClient();
  private cacheLoadedFromRedis = false;
  private readonly redisKeys = {
    isports: 'thirdparty:isports',
    oddsapi: 'thirdparty:oddsapi',
    lastUpdate: 'thirdparty:last_update',
  } as const;
  private lastUpdate: Record<'isports' | 'oddsapi', string | null> = {
    isports: null,
    oddsapi: null,
  };
  private thirdpartyMatchRepository: ThirdpartyMatchRepository;
  private useDatabase: boolean = true;

  constructor(
    isportsApiKey: string,
    oddsapiApiKey: string,
    fetchIntervalSeconds: number = 60
  ) {
    super();
    this.isportsScraper = new ISportsAPIScraper(isportsApiKey);
    this.oddsapiScraper = new OddsAPIScraper(oddsapiApiKey);
    this.fetchInterval = fetchIntervalSeconds * 1000;
    this.thirdpartyMatchRepository = new ThirdpartyMatchRepository();

    logger.info('[ThirdPartyManager] 初始化完成');
  }

  /**
   * 启动定时抓取
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[ThirdPartyManager] 已经在运行中');
      return;
    }

    this.isRunning = true;
    logger.info(`[ThirdPartyManager] 启动定时抓取，间隔 ${this.fetchInterval / 1000} 秒`);

    // 立即执行一次
    this.fetchAll().catch(error => {
      logger.error('[ThirdPartyManager] 初始抓取失败:', error);
    });

    // 设置定时任务
    this.intervalId = setInterval(() => {
      this.fetchAll().catch(error => {
        logger.error('[ThirdPartyManager] 定时抓取失败:', error);
      });
    }, this.fetchInterval);
  }

  /**
   * 停止定时抓取
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('[ThirdPartyManager] 未在运行中');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    logger.info('[ThirdPartyManager] 已停止定时抓取');
  }

  /**
   * 抓取所有数据
   */
  async fetchAll(): Promise<ThirdPartyData> {
    logger.info('[ThirdPartyManager] 开始抓取所有数据...');

    const startTime = Date.now();

    try {
      // 并行抓取两个 API 的数据
      const [isportsMatches, oddsapiMatches] = await Promise.allSettled([
        this.isportsScraper.fetchAllMatches(),
        this.oddsapiScraper.fetchAllMatches(),
      ]);

      const isportsData =
        isportsMatches.status === 'fulfilled'
          ? isportsMatches.value
          : this.isportsScraper.getAllMatches();
      const oddsapiData =
        oddsapiMatches.status === 'fulfilled'
          ? oddsapiMatches.value
          : this.oddsapiScraper.getMatchesCache();

      if (isportsMatches.status === 'rejected') {
        logger.warn(
          `[ThirdPartyManager] iSportsAPI 抓取失败，使用缓存数据 (${isportsData.length} 场)`
        );
      }

      if (oddsapiMatches.status === 'rejected') {
        logger.warn(
          `[ThirdPartyManager] OddsAPI 抓取失败，使用缓存数据 (${oddsapiData.length} 场)`
        );
      }

      const data: ThirdPartyData = {
        isports: isportsData,
        oddsapi: oddsapiData,
        last_update: {
          isports: this.lastUpdate.isports || new Date().toISOString(),
          oddsapi: this.lastUpdate.oddsapi || new Date().toISOString(),
        },
      };

      if (isportsMatches.status === 'fulfilled') {
        await this.persistMatchesToRedis('isports', isportsData);
        data.last_update.isports = this.lastUpdate.isports!;
      }

      if (oddsapiMatches.status === 'fulfilled') {
        await this.persistMatchesToRedis('oddsapi', oddsapiData);
        data.last_update.oddsapi = this.lastUpdate.oddsapi!;
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[ThirdPartyManager] 抓取完成 (${duration}ms): ` +
        `iSports ${data.isports.length} 场, ` +
        `OddsAPI ${data.oddsapi.length} 场`
      );

      return data;
    } catch (error: any) {
      logger.error('[ThirdPartyManager] 抓取失败:', error.message);
      throw error;
    }
  }

  /**
   * 只抓取 iSportsAPI 数据
   */
  async fetchISports(): Promise<ISportsMatch[]> {
    try {
      logger.info('[ThirdPartyManager] 抓取 iSportsAPI 数据...');
      const matches = await this.isportsScraper.fetchAllMatches();
      logger.info(`[ThirdPartyManager] iSportsAPI 抓取完成: ${matches.length} 场`);
      await this.persistMatchesToRedis('isports', matches);
      return matches;
    } catch (error: any) {
      logger.error('[ThirdPartyManager] iSportsAPI 抓取失败:', error.message);
      throw error;
    }
  }

  /**
   * 只抓取 Odds-API.io 数据
   */
  async fetchOddsAPI(): Promise<OddsAPIMatch[]> {
    try {
      logger.info('[ThirdPartyManager] 抓取 Odds-API.io 数据...');
      const matches = await this.oddsapiScraper.fetchAllMatches();
      logger.info(`[ThirdPartyManager] Odds-API.io 抓取完成: ${matches.length} 场`);
      await this.persistMatchesToRedis('oddsapi', matches);
      return matches;
    } catch (error: any) {
      logger.error('[ThirdPartyManager] Odds-API.io 抓取失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取缓存的所有数据
   */
  getCachedData(): ThirdPartyData {
    return {
      isports: this.isportsScraper.getAllMatches(),
      oddsapi: this.oddsapiScraper.getMatchesCache(),
      last_update: {
        isports: this.lastUpdate.isports || new Date().toISOString(),
        oddsapi: this.lastUpdate.oddsapi || new Date().toISOString(),
      },
    };
  }

  /**
   * 获取 iSportsAPI 缓存数据
   */
  getISportsCachedData(): ISportsMatch[] {
    logger.info(`[ThirdPartyManager] getISportsCachedData() 被调用`);
    const matches = this.isportsScraper.getAllMatches();
    logger.info(`[ThirdPartyManager] getAllMatches() 返回 ${matches.length} 场赛事`);
    return matches;
  }

  /**
   * 获取 Odds-API.io 缓存数据
   */
  getOddsAPICachedData(): OddsAPIMatch[] {
    return this.oddsapiScraper.getMatchesCache();
  }

  /**
   * 根据 ID 获取 iSportsAPI 赛事
   */
  getISportsMatchById(matchId: string): ISportsMatch | undefined {
    return this.isportsScraper.getMatchById(matchId);
  }

  /**
   * 根据 ID 获取 Odds-API.io 赛事
   */
  getOddsAPIMatchById(matchId: string): OddsAPIMatch | undefined {
    return this.oddsapiScraper.getMatchById(matchId);
  }

  /**
   * 获取所有数据
   */
  getAllData(): ThirdPartyData {
    return {
      isports: this.isportsScraper.getAllMatches(),
      oddsapi: this.oddsapiScraper.getMatchesCache(),
      last_update: {
        isports: this.lastUpdate.isports || new Date().toISOString(),
        oddsapi: this.lastUpdate.oddsapi || new Date().toISOString(),
      },
    };
  }

  /**
   * 获取运行状态
   */
  getStatus(): {
    isRunning: boolean;
    fetchInterval: number;
    isportsCount: number;
    oddsapiCount: number;
  } {
    return {
      isRunning: this.isRunning,
      fetchInterval: this.fetchInterval,
      isportsCount: this.isportsScraper.getAllMatches().length,
      oddsapiCount: this.oddsapiScraper.getMatchesCache().length,
    };
  }

  /**
   * 确保在读取数据前尽量从 Redis 恢复缓存
   */
  async ensureCacheLoaded(): Promise<void> {
    if (this.cacheLoadedFromRedis) {
      return;
    }

    await this.loadCacheFromRedis();
  }

  private async loadCacheFromRedis(): Promise<void> {
    if (!this.redisClient) {
      this.cacheLoadedFromRedis = true;
      return;
    }

    try {
      const [isportsRaw, oddsapiRaw, lastUpdateRaw] = await Promise.all([
        this.redisClient.get(this.redisKeys.isports),
        this.redisClient.get(this.redisKeys.oddsapi),
        this.redisClient.hgetall(this.redisKeys.lastUpdate),
      ]);

      if (isportsRaw) {
        const matches = JSON.parse(isportsRaw) as ISportsMatch[];
        this.isportsScraper.hydrateCache(matches);
        logger.info(`[ThirdPartyManager] 从 Redis 恢复 iSports ${matches.length} 场赛事`);
      }

      if (oddsapiRaw) {
        const matches = JSON.parse(oddsapiRaw) as OddsAPIMatch[];
        this.oddsapiScraper.hydrateCache(matches);
        logger.info(`[ThirdPartyManager] 从 Redis 恢复 OddsAPI ${matches.length} 场赛事`);
      }

      if (lastUpdateRaw?.isports) {
        this.lastUpdate.isports = lastUpdateRaw.isports;
      }

      if (lastUpdateRaw?.oddsapi) {
        this.lastUpdate.oddsapi = lastUpdateRaw.oddsapi;
      }

      this.cacheLoadedFromRedis = true;
    } catch (error: any) {
      logger.warn(`[ThirdPartyManager] 从 Redis 恢复缓存失败: ${error.message}`);
    }
  }

  private async persistMatchesToRedis(
    source: 'isports' | 'oddsapi',
    matches: ISportsMatch[] | OddsAPIMatch[]
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    this.lastUpdate[source] = timestamp;

    if (!this.redisClient) {
      return;
    }

    try {
      await this.redisClient
        .multi()
        .set(this.redisKeys[source], JSON.stringify(matches))
        .hset(this.redisKeys.lastUpdate, source, timestamp)
        .exec();

      logger.info(
        `[ThirdPartyManager] Redis 缓存已更新 (${source} ${matches.length} 场)`
      );
    } catch (error: any) {
      logger.warn(`[ThirdPartyManager] 写入 Redis 失败 (${source}): ${error.message}`);
    }

    // 存储到数据库
    if (this.useDatabase && matches.length > 0) {
      try {
        const dbMatches = this.convertToDbFormat(source, matches);
        const saved = await this.thirdpartyMatchRepository.upsertBatch(dbMatches);
        logger.debug(`[ThirdPartyManager] 保存 ${saved} 场 ${source} 赛事到数据库`);

        // 发送事件通知
        this.emit('matches:updated', { source, matches: dbMatches });
      } catch (dbError: any) {
        logger.error(`[ThirdPartyManager] 保存 ${source} 到数据库失败:`, dbError.message);
      }
    }
  }

  /**
   * 转换为数据库格式
   */
  private convertToDbFormat(
    source: 'isports' | 'oddsapi',
    matches: ISportsMatch[] | OddsAPIMatch[]
  ): any[] {
    return matches.map(match => {
      if (source === 'isports') {
        const m = match as ISportsMatch;
        return {
          id: `isports_${m.match_id}`,
          source: 'isports',
          status: m.status === 'live' ? 'live' : 'upcoming',
          league_en: m.league_name_en,
          league_cn: m.league_name_cn,
          team_home_en: m.team_home_en,
          team_home_cn: m.team_home_cn,
          team_away_en: m.team_away_en,
          team_away_cn: m.team_away_cn,
          match_time: m.match_time,
          handicap: m.odds.handicap || [],
          totals: m.odds.totals || [],
          moneyline: m.odds.moneyline || null,
          raw_data: m,
        };
      } else {
        const m = match as OddsAPIMatch;
        return {
          id: `oddsapi_${m.match_id}`,
          source: 'oddsapi',
          status: m.status === 'live' ? 'live' : 'upcoming',
          league_en: m.league_name_en,
          league_cn: m.league_name_cn,
          team_home_en: m.team_home_en,
          team_home_cn: m.team_home_cn,
          team_away_en: m.team_away_en,
          team_away_cn: m.team_away_cn,
          match_time: m.match_time,
          handicap: m.odds.handicap || null,
          totals: m.odds.totals || null,
          moneyline: m.odds.moneyline || null,
          raw_data: m,
        };
      }
    });
  }
}
