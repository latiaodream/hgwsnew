/**
 * Odds-API.io 数据抓取器
 * 
 * 功能：
 * - 抓取 Odds-API.io 的足球赛事数据
 * - 只抓取皇冠（Crown）的赔率
 * - 只抓取滚球、今日、明日的赛事
 * - 支持让球盘、独赢盘、大小球
 */

import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

export interface OddsAPIMatch {
  match_id: string;
  league_id: string;
  league_name_cn: string;
  league_name_en: string;
  team_home_cn: string;
  team_home_en: string;
  team_away_cn: string;
  team_away_en: string;
  match_time: string;
  status: 'live' | 'today' | 'tomorrow';
  score_home?: number;
  score_away?: number;
  odds: {
    handicap?: {
      home_odds: number;
      away_odds: number;
      handicap_line: number;
    };
    moneyline?: {
      home_odds: number;
      draw_odds: number;
      away_odds: number;
    };
    totals?: {
      over_odds: number;
      under_odds: number;
      total_line: number;
    };
  };
  last_update: string;
}

export class OddsAPIScraper {
  private apiKey: string;
  private baseUrl: string = 'https://api.odds-api.io/v3';
  private client: AxiosInstance;
  private crownBookmaker: string = 'crown'; // 皇冠的 bookmaker key
  private matchesCache: Map<string, OddsAPIMatch> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('[OddsAPI] 初始化完成');
  }

  /**
   * 获取所有赛事（滚球、今日、明日）
   */
  async fetchAllMatches(): Promise<OddsAPIMatch[]> {
    try {
      const [liveMatches, todayMatches, tomorrowMatches] = await Promise.all([
        this.fetchLiveMatches(),
        this.fetchTodayMatches(),
        this.fetchTomorrowMatches(),
      ]);

      const allMatches = [...liveMatches, ...todayMatches, ...tomorrowMatches];
      
      // 更新缓存
      allMatches.forEach(match => {
        this.matchesCache.set(match.match_id, match);
      });

      logger.info(`[OddsAPI] 抓取完成: 滚球 ${liveMatches.length}, 今日 ${todayMatches.length}, 明日 ${tomorrowMatches.length}`);
      
      return allMatches;
    } catch (error: any) {
      logger.error('[OddsAPI] 抓取失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取滚球赛事
   */
  async fetchLiveMatches(): Promise<OddsAPIMatch[]> {
    try {
      // 获取滚球赛事
      const response = await this.client.get('/events/live', {
        params: {
          apiKey: this.apiKey,
          sport: 'football',
        },
      });

      logger.info(`[OddsAPI] 滚球API响应: ${JSON.stringify(response.data).substring(0, 200)}`);

      if (!response.data || !Array.isArray(response.data)) {
        logger.error(`[OddsAPI] 滚球API返回格式错误: ${JSON.stringify(response.data)}`);
        return [];
      }

      const matches = await this.fetchOddsForEvents(response.data, 'live');
      logger.info(`[OddsAPI] 滚球赛事: ${matches.length} 场`);

      return matches;
    } catch (error: any) {
      logger.error(`[OddsAPI] 获取滚球赛事失败: ${error.message}`);
      if (error.response) {
        logger.error(`[OddsAPI] 响应状态: ${error.response.status}, 数据: ${JSON.stringify(error.response.data)}`);
      }
      return [];
    }
  }

  /**
   * 获取今日赛事
   */
  async fetchTodayMatches(): Promise<OddsAPIMatch[]> {
    try {
      const today = this.getDateString(0);
      const response = await this.client.get('/events', {
        params: {
          apiKey: this.apiKey,
          sport: 'football',
          date: today,
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        logger.error(`[OddsAPI] 今日API返回格式错误: ${JSON.stringify(response.data)}`);
        return [];
      }

      const matches = await this.fetchOddsForEvents(response.data, 'today');
      logger.info(`[OddsAPI] 今日赛事: ${matches.length} 场`);

      return matches;
    } catch (error: any) {
      logger.error(`[OddsAPI] 获取今日赛事失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取明日赛事
   */
  async fetchTomorrowMatches(): Promise<OddsAPIMatch[]> {
    try {
      const tomorrow = this.getDateString(1);
      const response = await this.client.get('/events', {
        params: {
          apiKey: this.apiKey,
          sport: 'football',
          date: tomorrow,
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        logger.error(`[OddsAPI] 明日API返回格式错误: ${JSON.stringify(response.data)}`);
        return [];
      }

      const matches = await this.fetchOddsForEvents(response.data, 'tomorrow');
      logger.info(`[OddsAPI] 明日赛事: ${matches.length} 场`);

      return matches;
    } catch (error: any) {
      logger.error(`[OddsAPI] 获取明日赛事失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 为赛事获取赔率（只返回有 Crown 赔率的赛事）
   */
  private async fetchOddsForEvents(events: any[], status: 'live' | 'today' | 'tomorrow'): Promise<OddsAPIMatch[]> {
    const matches: OddsAPIMatch[] = [];
    let totalEvents = events.length;
    let eventsWithCrownOdds = 0;

    // 逐个获取赔率（因为需要检查每个赛事是否有 Crown 赔率）
    for (const event of events) {
      try {
        const response = await this.client.get('/odds', {
          params: {
            apiKey: this.apiKey,
            eventId: event.id,
            bookmakers: this.crownBookmaker,
          },
        });

        // 检查是否有 Crown 赔率数据
        if (response.data && response.data.bookmakers && Object.keys(response.data.bookmakers).length > 0) {
          const crownData = response.data.bookmakers[this.crownBookmaker];
          if (crownData && crownData.markets && crownData.markets.length > 0) {
            const match = this.parseMatch(event, crownData, status);
            if (match) {
              matches.push(match);
              eventsWithCrownOdds++;
            }
          }
        }

        // 避免请求过快（API 限制）
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        // 忽略单个赛事的错误，继续处理下一个
        logger.debug(`[OddsAPI] 赛事 ${event.id} 无 Crown 赔率或请求失败`);
      }
    }

    logger.info(`[OddsAPI] ${status} 赛事: 总共 ${totalEvents} 场，有 Crown 赔率 ${eventsWithCrownOdds} 场`);
    return matches;
  }

  /**
   * 解析赛事数据
   */
  private parseMatch(event: any, bookmakerData: any, status: 'live' | 'today' | 'tomorrow'): OddsAPIMatch | null {
    try {
      const match: OddsAPIMatch = {
        match_id: String(event.id),
        league_id: String(event.league_id || ''),
        league_name_cn: event.league_name || event.league || '',
        league_name_en: event.league_name || event.league || '',
        team_home_cn: event.home_team || '',
        team_home_en: event.home_team || '',
        team_away_cn: event.away_team || '',
        team_away_en: event.away_team || '',
        match_time: event.commence_time || event.start_time || '',
        status,
        score_home: event.scores?.home,
        score_away: event.scores?.away,
        odds: this.parseOdds(bookmakerData.markets || []),
        last_update: new Date().toISOString(),
      };

      return match;
    } catch (error: any) {
      logger.warn(`[OddsAPI] 解析赛事失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 解析赔率数据
   */
  private parseOdds(markets: any[]): OddsAPIMatch['odds'] {
    const odds: OddsAPIMatch['odds'] = {};

    for (const market of markets) {
      const marketType = market.key || market.type;

      // 让球盘 (Spreads / Handicap)
      if (marketType === 'spreads' || marketType === 'handicap') {
        const outcomes = market.outcomes || [];
        const home = outcomes.find((o: any) => o.name === 'home');
        const away = outcomes.find((o: any) => o.name === 'away');

        if (home && away) {
          odds.handicap = {
            home_odds: parseFloat(home.price || home.odds || 0),
            away_odds: parseFloat(away.price || away.odds || 0),
            handicap_line: parseFloat(home.point || home.handicap || 0),
          };
        }
      }

      // 独赢盘 (Moneyline / H2H)
      if (marketType === 'h2h' || marketType === 'moneyline') {
        const outcomes = market.outcomes || [];
        const home = outcomes.find((o: any) => o.name === 'home');
        const draw = outcomes.find((o: any) => o.name === 'draw');
        const away = outcomes.find((o: any) => o.name === 'away');
        
        if (home && away) {
          odds.moneyline = {
            home_odds: parseFloat(home.price || home.odds || 0),
            draw_odds: draw ? parseFloat(draw.price || draw.odds || 0) : 0,
            away_odds: parseFloat(away.price || away.odds || 0),
          };
        }
      }

      // 大小球 (Totals / Over/Under)
      if (marketType === 'totals' || marketType === 'over_under') {
        const outcomes = market.outcomes || [];
        const over = outcomes.find((o: any) => o.name === 'over' || o.name === 'Over');
        const under = outcomes.find((o: any) => o.name === 'under' || o.name === 'Under');
        
        if (over && under) {
          odds.totals = {
            over_odds: parseFloat(over.price || over.odds || 0),
            under_odds: parseFloat(under.price || under.odds || 0),
            total_line: parseFloat(over.point || over.line || 0),
          };
        }
      }
    }

    return odds;
  }

  /**
   * 获取日期字符串 (YYYY-MM-DD)
   */
  private getDateString(daysOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  /**
   * 获取缓存的赛事
   */
  getMatchesCache(): OddsAPIMatch[] {
    return Array.from(this.matchesCache.values());
  }

  /**
   * 根据 ID 获取赛事
   */
  getMatchById(matchId: string): OddsAPIMatch | undefined {
    return this.matchesCache.get(matchId);
  }

  /**
   * 将外部缓存的数据写入本地缓存
   */
  hydrateCache(matches: OddsAPIMatch[]): void {
    this.matchesCache.clear();
    matches.forEach(match => {
      if (match?.match_id) {
        this.matchesCache.set(match.match_id, match);
      }
    });

    logger.info(`[OddsAPI] hydrateCache(): 恢复 ${matches.length} 场赛事`);
  }
}
