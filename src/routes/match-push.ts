/**
 * 赛事推送路由
 * 以皇冠赛事为主，通过映射匹配补充 iSports 数据
 */

import { Router, Request, Response } from 'express';
import { ThirdPartyManager } from '../scrapers/ThirdPartyManager';
import { MappingManager } from '../utils/MappingManager';
import { LeagueMappingManager } from '../utils/LeagueMappingManager';
import { ISportsMatch } from '../scrapers/ISportsAPIScraper';
import { Match } from '../types';
import logger from '../utils/logger';

// 初始化映射管理器
const teamMappingManager = new MappingManager();
const leagueMappingManager = new LeagueMappingManager();

const router = Router();

// 全局管理器实例
let scraperManager: any = null;
let thirdPartyManager: ThirdPartyManager | null = null;

/**
 * 设置管理器实例
 */
export function setManagers(scraper: any, thirdParty: ThirdPartyManager) {
  scraperManager = scraper;
  thirdPartyManager = thirdParty;
  logger.info('[MatchPush] 管理器已设置');
}

/**
 * 合并后的赛事数据接口
 */
interface MergedMatch {
  // 皇冠数据
  crown: Match;
  // iSports 数据（如果匹配到）
  isports?: ISportsMatch;
  // 匹配状态
  matched: boolean;
  matchedBy?: 'team' | 'league' | 'both'; // 匹配方式
}

/**
 * 通过映射查找匹配的 iSports 赛事
 */
async function findMatchingISportsMatch(
  crownMatch: Match,
  isportsMatches: ISportsMatch[]
): Promise<{ match: ISportsMatch | null; matchedBy: 'team' | 'league' | 'both' | null }> {
  try {
    // 1. 查找球队映射
    const homeMapping = await teamMappingManager.findMappingByCrownName(crownMatch.home_zh);
    const awayMapping = await teamMappingManager.findMappingByCrownName(crownMatch.away_zh);
    
    // 2. 查找联赛映射
    const leagueMapping = await leagueMappingManager.findMappingByCrownName(crownMatch.league_zh);

    logger.debug(`[MatchPush] 查找映射: ${crownMatch.home_zh} vs ${crownMatch.away_zh}`);
    logger.debug(`[MatchPush] 主队映射: ${homeMapping?.isports_en || '未找到'}`);
    logger.debug(`[MatchPush] 客队映射: ${awayMapping?.isports_en || '未找到'}`);
    logger.debug(`[MatchPush] 联赛映射: ${leagueMapping?.isports_en || '未找到'}`);

    // 3. 在 iSports 数据中查找匹配
    for (const isportsMatch of isportsMatches) {
      let teamMatched = false;
      let leagueMatched = false;

      // 检查球队是否匹配
      if (homeMapping && awayMapping) {
        const homeMatch = 
          isportsMatch.team_home_en === homeMapping.isports_en ||
          isportsMatch.team_home_cn === homeMapping.isports_cn;
        
        const awayMatch = 
          isportsMatch.team_away_en === awayMapping.isports_en ||
          isportsMatch.team_away_cn === awayMapping.isports_cn;

        teamMatched = homeMatch && awayMatch;
      }

      // 检查联赛是否匹配
      if (leagueMapping) {
        leagueMatched = 
          isportsMatch.league_name_en === leagueMapping.isports_en ||
          isportsMatch.league_name_cn === leagueMapping.isports_cn;
      }

      // 如果球队和联赛都匹配，返回该赛事
      if (teamMatched && leagueMatched) {
        logger.info(`[MatchPush] 完全匹配: ${crownMatch.home_zh} vs ${crownMatch.away_zh}`);
        return { match: isportsMatch, matchedBy: 'both' };
      }

      // 如果只有球队匹配（更可靠）
      if (teamMatched) {
        logger.info(`[MatchPush] 球队匹配: ${crownMatch.home_zh} vs ${crownMatch.away_zh}`);
        return { match: isportsMatch, matchedBy: 'team' };
      }

      // 如果只有联赛匹配（不太可靠，但也记录）
      if (leagueMatched) {
        logger.debug(`[MatchPush] 仅联赛匹配: ${crownMatch.league_zh}`);
        // 继续查找，看是否有更好的匹配
      }
    }

    logger.debug(`[MatchPush] 未找到匹配: ${crownMatch.home_zh} vs ${crownMatch.away_zh}`);
    return { match: null, matchedBy: null };
  } catch (error: any) {
    logger.error(`[MatchPush] 查找匹配失败:`, error.message);
    return { match: null, matchedBy: null };
  }
}

/**
 * GET /api/match-push
 * 获取合并后的赛事数据
 * 
 * Query 参数:
 * - showType: live | today | early (默认 live)
 * - page: 页码（默认 1）
 * - pageSize: 每页数量（默认 50）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!scraperManager || !thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '服务未初始化',
      });
    }

    const { showType = 'live', page = '1', pageSize = '50' } = req.query;
    const currentPage = parseInt(page as string);
    const size = parseInt(pageSize as string);

    logger.info(`[MatchPush] 获取赛事推送数据: showType=${showType}, page=${currentPage}, pageSize=${size}`);

    // 1. 获取皇冠赛事
    const crownMatches: Match[] = scraperManager.getMatches(showType as any);
    logger.info(`[MatchPush] 获取到 ${crownMatches.length} 场皇冠赛事`);

    // 2. 获取 iSports 赛事
    const isportsMatches: ISportsMatch[] = thirdPartyManager.getISportsCachedData();
    logger.info(`[MatchPush] 获取到 ${isportsMatches.length} 场 iSports 赛事`);

    // 3. 合并数据
    const mergedMatches: MergedMatch[] = [];

    for (const crownMatch of crownMatches) {
      const { match: isportsMatch, matchedBy } = await findMatchingISportsMatch(crownMatch, isportsMatches);

      mergedMatches.push({
        crown: crownMatch,
        isports: isportsMatch || undefined,
        matched: !!isportsMatch,
        matchedBy: matchedBy || undefined,
      });
    }

    // 4. 统计
    const stats = {
      total: mergedMatches.length,
      matched: mergedMatches.filter(m => m.matched).length,
      unmatched: mergedMatches.filter(m => !m.matched).length,
      matchedByTeam: mergedMatches.filter(m => m.matchedBy === 'team').length,
      matchedByBoth: mergedMatches.filter(m => m.matchedBy === 'both').length,
    };

    logger.info(`[MatchPush] 匹配统计: 总数=${stats.total}, 已匹配=${stats.matched}, 未匹配=${stats.unmatched}`);

    // 5. 分页
    const total = mergedMatches.length;
    const totalPages = Math.ceil(total / size);
    const offset = (currentPage - 1) * size;
    const paginatedMatches = mergedMatches.slice(offset, offset + size);

    res.json({
      success: true,
      data: paginatedMatches,
      stats,
      pagination: {
        page: currentPage,
        pageSize: size,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    logger.error('[MatchPush] 获取赛事推送数据失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/match-push/stats
 * 获取匹配统计信息
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!scraperManager || !thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '服务未初始化',
      });
    }

    const stats = {
      crown: {
        live: scraperManager.getMatches('live').length,
        today: scraperManager.getMatches('today').length,
        early: scraperManager.getMatches('early').length,
      },
      isports: thirdPartyManager.getISportsCachedData().length,
      mappings: {
        teams: (await teamMappingManager.getAllMappings()).length,
        leagues: (await leagueMappingManager.getAllMappings()).length,
      },
    };

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    logger.error('[MatchPush] 获取统计信息失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

