/**
 * iSportsAPI 数据抓取器
 * 
 * 功能：
 * - 抓取 iSportsAPI 的足球赛事数据
 * - 只抓取皇冠（Crown, Company ID = 3）的赔率
 * - 只抓取滚球、今日、明日的赛事
 * - 支持让球盘、独赢盘、大小球
 */

import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

export interface ISportsMatch {
  match_id: string;
  league_id: string;
  league_name_cn: string;
  league_name_en: string;
  league_name_tc?: string; // 繁体中文
  team_home_id?: string; // 主队 ID
  team_home_cn: string;
  team_home_en: string;
  team_home_tc?: string; // 繁体中文
  team_away_id?: string; // 客队 ID
  team_away_cn: string;
  team_away_en: string;
  team_away_tc?: string; // 繁体中文
  match_time: string;
  status: 'live' | 'today' | 'early';
  score_home?: number;
  score_away?: number;
  odds: {
    // 支持多盘口：handicapIndex=1 是主盘，其他是备选盘
    handicap?: Array<{
      home_odds: number;
      away_odds: number;
      handicap_line: number;
      handicap_index: number; // 1=主盘，2+=备选盘
    }>;
    moneyline?: {
      home_odds: number;
      draw_odds: number;
      away_odds: number;
    };
    // 支持多盘口：handicapIndex=1 是主盘，其他是备选盘
    totals?: Array<{
      over_odds: number;
      under_odds: number;
      total_line: number;
      handicap_index: number; // 1=主盘，2+=备选盘
    }>;
  };
  last_update: string;
}

export class ISportsAPIScraper {
  private apiKey: string;
  private baseUrl: string = 'http://api.isportsapi.com/sport';
  private client: AxiosInstance;
  private crownCompanyId: number = 3; // 皇冠的 Company ID
  private matchesCache: Map<string, ISportsMatch> = new Map();
  private tcLanguageCache: Map<string, any> = new Map(); // 繁体中文缓存

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('[ISportsAPI] 初始化完成');
  }

  /**
   * 获取繁体中文语言包
   */
  private async fetchTraditionalChinese(): Promise<void> {
    try {
      const response = await this.client.get('/languagetc', {
        params: {
          api_key: this.apiKey,
          sport: 'football',
        },
      });

      if (response.data?.code === 0 && response.data?.data) {
        const data = response.data.data[0];

        logger.info(`[ISportsAPI] 繁体语言包数据结构: ${JSON.stringify(Object.keys(data))}`);

        // 缓存联赛繁体名称
        if (data.leagues) {
          let leagueCount = 0;
          data.leagues.forEach((league: any) => {
            this.tcLanguageCache.set(`league_${league.leagueId}`, league.name_tc);
            leagueCount++;
          });
          logger.info(`[ISportsAPI] 缓存了 ${leagueCount} 个联赛繁体名称`);
        } else {
          logger.warn('[ISportsAPI] 繁体语言包中没有 leagues 字段');
        }

        // 缓存球队繁体名称
        if (data.teams) {
          let teamCount = 0;
          data.teams.forEach((team: any) => {
            this.tcLanguageCache.set(`team_${team.teamId}`, team.name_tc);
            teamCount++;
          });
          logger.info(`[ISportsAPI] 缓存了 ${teamCount} 个球队繁体名称`);
        } else {
          logger.warn('[ISportsAPI] 繁体语言包中没有 teams 字段');
        }

        logger.info(`[ISportsAPI] 繁体中文语言包加载完成，共 ${this.tcLanguageCache.size} 条`);
      }
    } catch (error: any) {
      logger.error('[ISportsAPI] 获取繁体中文语言包失败:', error.message);
    }
  }

  /**
   * 获取繁体中文名称
   */
  private getTCName(type: 'league' | 'team', id: string): string | undefined {
    return this.tcLanguageCache.get(`${type}_${id}`);
  }

  /**
   * 获取所有赛事（滚球、今日、明日）
   */
  async fetchAllMatches(): Promise<ISportsMatch[]> {
    try {
      // 首次加载时获取繁体中文语言包
      if (this.tcLanguageCache.size === 0) {
        await this.fetchTraditionalChinese();
      }

      // 获取所有赛事（已经在 fetchOddsMatches 中分类）
      const allMatches = await this.fetchOddsMatches();

      if (allMatches.length === 0) {
        const cached = this.getAllMatches();
        logger.warn(
          `[ISportsAPI] 本次抓取返回 0 场赛事，保留旧缓存 ${cached.length} 场`
        );
        return cached;
      }

      logger.info(`[ISportsAPI] fetchOddsMatches 返回 ${allMatches.length} 场赛事`);
      logger.info(`[ISportsAPI] 更新缓存前 matchesCache.size = ${this.matchesCache.size}`);

      // 清空旧缓存
      this.matchesCache.clear();

      // 更新缓存（添加繁体中文）
      let leagueTCCount = 0;
      let teamHomeTCCount = 0;
      let teamAwayTCCount = 0;

      allMatches.forEach(match => {
        // 添加繁体中文名称
        match.league_name_tc = this.getTCName('league', match.league_id);
        if (match.league_name_tc) leagueTCCount++;

        if (match.team_home_id) {
          match.team_home_tc = this.getTCName('team', match.team_home_id);
          if (match.team_home_tc) teamHomeTCCount++;
        }
        if (match.team_away_id) {
          match.team_away_tc = this.getTCName('team', match.team_away_id);
          if (match.team_away_tc) teamAwayTCCount++;
        }

        this.matchesCache.set(match.match_id, match);
      });

      logger.info(`[ISportsAPI] 繁体匹配统计: 联赛 ${leagueTCCount}/${allMatches.length}, 主队 ${teamHomeTCCount}/${allMatches.length}, 客队 ${teamAwayTCCount}/${allMatches.length}`);

      logger.info(`[ISportsAPI] 更新缓存后 matchesCache.size = ${this.matchesCache.size}`);

      // 统计各类型赛事数量
      const liveCount = allMatches.filter(m => m.status === 'live').length;
      const todayCount = allMatches.filter(m => m.status === 'today').length;
      const earlyCount = allMatches.filter(m => m.status === 'early').length;

      logger.info(`[ISportsAPI] 抓取完成: 滚球 ${liveCount}, 今日 ${todayCount}, 早盘 ${earlyCount}`);

      return allMatches;
    } catch (error: any) {
      logger.error('[ISportsAPI] 抓取失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取滚球赛事
   */
  async fetchLiveMatches(): Promise<ISportsMatch[]> {
    const allMatches = this.getAllMatches();
    return allMatches.filter(m => m.status === 'live');
  }

  /**
   * 获取今日赛事
   */
  async fetchTodayMatches(): Promise<ISportsMatch[]> {
    const allMatches = this.getAllMatches();
    return allMatches.filter(m => m.status === 'today');
  }

  /**
   * 获取早盘赛事
   */
  async fetchTomorrowMatches(): Promise<ISportsMatch[]> {
    const allMatches = this.getAllMatches();
    return allMatches.filter(m => m.status === 'early');
  }

  /**
   * 获取皇冠赔率数据并匹配赛事详情
   */
  private async fetchOddsMatches(): Promise<ISportsMatch[]> {
    try {
      // 1. 获取所有皇冠赔率数据
      const response = await this.client.get('/football/odds/main', {
        params: {
          api_key: this.apiKey,
          companyId: this.crownCompanyId, // 皇冠 Company ID = 3
        },
      });

      if (response.data.code !== 0) {
        logger.error(`[ISportsAPI] 赔率API返回错误: ${JSON.stringify(response.data)}`);
        return [];
      }

      const data = response.data.data || {};

      // 2. 解析赔率数据，获取所有 matchId
      const matchesMap = this.parseOddsDataToMap(data);
      const matchIds = Array.from(matchesMap.keys());

      if (matchIds.length === 0) {
        logger.info(`[ISportsAPI] 没有皇冠赔率数据`);
        return [];
      }

      logger.info(`[ISportsAPI] 皇冠赔率赛事: ${matchIds.length} 场`);

      // 3. 批量获取赛事详情（每次最多100个）
      const matches: ISportsMatch[] = [];
      const batchSize = 100;

      for (let i = 0; i < matchIds.length; i += batchSize) {
        const batchIds = matchIds.slice(i, i + batchSize);
        const matchDetails = await this.fetchMatchDetails(batchIds);

        // 4. 合并赔率数据和赛事详情
        for (const detail of matchDetails) {
          const match = matchesMap.get(detail.matchId);
          if (match) {
            match.league_id = detail.leagueId;
            match.league_name_cn = detail.leagueName;
            match.league_name_en = detail.leagueName;
            match.team_home_id = detail.homeId;
            match.team_home_cn = detail.homeName;
            match.team_home_en = detail.homeName;
            match.team_away_id = detail.awayId;
            match.team_away_cn = detail.awayName;
            match.team_away_en = detail.awayName;

            // iSportsAPI 返回的时间戳需要转换为与皇冠一致的格式
            // 前端 formatTime 逻辑：Date 对象 + 4小时，然后 getUTCHours()
            // 要让前端显示 15:00，Date 对象应该是 UTC 11:00
            // 所以存储格式应该让 new Date() 解析后得到 UTC 11:00
            const matchTimeMs = detail.matchTime * 1000;
            const matchDateUTC = new Date(matchTimeMs);

            // iSports API 返回的时间戳减去 8 小时（UTC 转为 GMT-4 的显示时间）
            // 例如：API 返回 UTC 15:00，减 8 小时得到 07:00
            // 存储为 07:00-04:00，解析为 Date 对象是 UTC 11:00
            // 前端加 4 小时后显示 15:00
            const adjustedDate = new Date(matchTimeMs - 8 * 60 * 60 * 1000);

            const year = adjustedDate.getUTCFullYear();
            const month = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(adjustedDate.getUTCDate()).padStart(2, '0');
            const hour = String(adjustedDate.getUTCHours()).padStart(2, '0');
            const minute = String(adjustedDate.getUTCMinutes()).padStart(2, '0');
            const second = String(adjustedDate.getUTCSeconds()).padStart(2, '0');

            match.match_time = `${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`;

            // 根据比赛时间和状态判断类型（使用 GMT-4 时间）
            const now = new Date();
            const nowGMT4 = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const matchTimeGMT4 = new Date(matchDateUTC.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const todayEndGMT4 = new Date(nowGMT4);
            todayEndGMT4.setHours(23, 59, 59, 999);

            // 计算比赛开始时间与当前时间的差值（分钟）
            const timeDiffMinutes = (matchTimeGMT4.getTime() - nowGMT4.getTime()) / (1000 * 60);

            if (detail.status > 0 && timeDiffMinutes <= 15) {
              // status > 0 且比赛时间已到（或提前15分钟内）才标记为滚球
              // 这样可以避免 API 数据错误导致未开始的比赛被标记为滚球
              match.status = 'live';
            } else if (matchTimeGMT4 <= todayEndGMT4) {
              match.status = 'today';
            } else {
              // 明日及以后的赛事都归为早盘
              match.status = 'early';
            }

            matches.push(match);
          }
        }

        // API 限制：10秒/调用，这里等待一下
        if (i + batchSize < matchIds.length) {
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      return matches;
    } catch (error: any) {
      logger.error(`[ISportsAPI] 获取赔率数据失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 批量获取赛事详情
   * API 文档: https://www.isportsapi.com/docs.html?id=72&lang=en
   */
  private async fetchMatchDetails(matchIds: string[]): Promise<any[]> {
    try {
      const response = await this.client.get('/football/schedule/basic', {
        params: {
          api_key: this.apiKey,
          matchId: matchIds.join(','),
        },
      });

      if (response.data.code !== 0) {
        logger.warn(`[ISportsAPI] 获取赛事详情失败: ${response.data.message}`);
        return [];
      }

      return response.data.data || [];
    } catch (error: any) {
      logger.error(`[ISportsAPI] 获取赛事详情异常: ${error.message}`);
      return [];
    }
  }

  /**
   * 解析赔率数据，返回 Map
   * 数据格式: handicap, europeOdds, overUnder, handicapHalf, overUnderHalf
   *
   * handicap 格式: matchId,companyId,instantHandicap,instantHome,instantAway,maintenance,inPlay,handicapIndex,changeTime,close
   * overUnder 格式: matchId,companyId,instantHandicap,instantOver,instantUnder,handicapIndex,changeTime,close
   */
  private parseOddsDataToMap(data: any): Map<string, ISportsMatch> {
    const matchesMap = new Map<string, ISportsMatch>();

    // 解析让球盘（亚洲盘）- 支持多盘口
    // 格式: matchId,companyId,instantHandicap,instantHome,instantAway,maintenance,inPlay,handicapIndex,changeTime,close
    if (data.handicap && Array.isArray(data.handicap)) {
      for (const oddsStr of data.handicap) {
        const parts = oddsStr.split(',');
        if (parts.length < 10) continue;

        const matchId = parts[0];
        const companyId = parseInt(parts[1]);

        // 只处理皇冠（Company ID = 3）的赔率
        if (companyId !== this.crownCompanyId) continue;

        const handicapLine = parseFloat(parts[2]);
        const homeOdds = parseFloat(parts[3]);
        const awayOdds = parseFloat(parts[4]);
        const handicapIndex = parseInt(parts[7]) || 1; // handicapIndex 在第8个位置（索引7）

        if (!matchesMap.has(matchId)) {
          matchesMap.set(matchId, this.createEmptyMatch(matchId));
        }

        const match = matchesMap.get(matchId)!;
        if (!match.odds.handicap) {
          match.odds.handicap = [];
        }

        // 添加到数组中，按 handicapIndex 排序（主盘在前）
        match.odds.handicap.push({
          handicap_line: handicapLine,
          home_odds: homeOdds,
          away_odds: awayOdds,
          handicap_index: handicapIndex,
        });

        // 排序：主盘(index=1)在前
        match.odds.handicap.sort((a, b) => a.handicap_index - b.handicap_index);
      }
    }

    // 解析大小球 - 支持多盘口
    // 格式: matchId,companyId,instantHandicap,instantOver,instantUnder,handicapIndex,changeTime,close
    if (data.overUnder && Array.isArray(data.overUnder)) {
      for (const oddsStr of data.overUnder) {
        const parts = oddsStr.split(',');
        if (parts.length < 8) continue;

        const matchId = parts[0];
        const companyId = parseInt(parts[1]);

        // 只处理皇冠（Company ID = 3）的赔率
        if (companyId !== this.crownCompanyId) continue;

        const totalLine = parseFloat(parts[2]);
        const overOdds = parseFloat(parts[3]);
        const underOdds = parseFloat(parts[4]);
        const handicapIndex = parseInt(parts[5]) || 1; // handicapIndex 在第6个位置（索引5）

        if (!matchesMap.has(matchId)) {
          matchesMap.set(matchId, this.createEmptyMatch(matchId));
        }

        const match = matchesMap.get(matchId)!;
        if (!match.odds.totals) {
          match.odds.totals = [];
        }

        // 添加到数组中，按 handicapIndex 排序（主盘在前）
        match.odds.totals.push({
          total_line: totalLine,
          over_odds: overOdds,
          under_odds: underOdds,
          handicap_index: handicapIndex,
        });

        // 排序：主盘(index=1)在前
        match.odds.totals.sort((a, b) => a.handicap_index - b.handicap_index);
      }
    }

    // 解析欧洲盘（1x2）
    if (data.europeOdds && Array.isArray(data.europeOdds)) {
      for (const oddsStr of data.europeOdds) {
        const parts = oddsStr.split(',');
        if (parts.length < 9) continue;

        const matchId = parts[0];
        const homeOdds = parseFloat(parts[2]);
        const drawOdds = parseFloat(parts[3]);
        const awayOdds = parseFloat(parts[4]);

        if (!matchesMap.has(matchId)) {
          matchesMap.set(matchId, this.createEmptyMatch(matchId));
        }

        const match = matchesMap.get(matchId)!;
        match.odds.moneyline = {
          home_odds: homeOdds,
          draw_odds: drawOdds,
          away_odds: awayOdds,
        };
      }
    }

    return matchesMap;
  }

  /**
   * 创建空的赛事对象
   */
  private createEmptyMatch(matchId: string): ISportsMatch {
    return {
      match_id: matchId,
      league_id: '',
      league_name_cn: '未知联赛',
      league_name_en: 'Unknown League',
      team_home_cn: '主队',
      team_home_en: 'Home Team',
      team_away_cn: '客队',
      team_away_en: 'Away Team',
      match_time: new Date().toISOString(),
      status: 'live',
      odds: {},
      last_update: new Date().toISOString(),
    };
  }

  /**
   * 根据 ID 获取赛事
   */
  getMatchById(matchId: string): ISportsMatch | undefined {
    return this.matchesCache.get(matchId);
  }

  /**
   * 将外部缓存的数据写入本地缓存
   */
  hydrateCache(matches: ISportsMatch[]): void {
    this.matchesCache.clear();
    matches.forEach(match => {
      if (match?.match_id) {
        this.matchesCache.set(match.match_id, match);
      }
    });

    logger.info(`[ISportsAPI] hydrateCache(): 恢复 ${matches.length} 场赛事`);
  }

  /**
   * 获取所有缓存的赛事
   */
  getAllMatches(): ISportsMatch[] {
    logger.info(`[ISportsAPI] getAllMatches() 被调用`);
    logger.info(`[ISportsAPI] matchesCache.size = ${this.matchesCache.size}`);
    const matches = Array.from(this.matchesCache.values());
    logger.info(`[ISportsAPI] getAllMatches() 返回 ${matches.length} 场赛事`);
    return matches;
  }
}
