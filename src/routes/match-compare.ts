/**
 * 赛事匹配 API
 * 对比皇冠和 iSports 赛事，智能匹配同一场比赛
 */

import { Router, Request, Response } from 'express';
import { Match, ShowType } from '../types';
import { ThirdPartyManager } from '../scrapers/ThirdPartyManager';
import { ISportsMatch } from '../scrapers/ISportsAPIScraper';
import { MappingManager } from '../utils/MappingManager';
import { LeagueMappingManager } from '../utils/LeagueMappingManager';
import logger from '../utils/logger';
import ExcelJS from 'exceljs';

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
  logger.info('[MatchCompare] 管理器已设置');
}

// 临时存储手动匹配关系（实际应该存储到数据库）
const manualMatches = new Map<string, string>(); // crownGid -> isportsMatchId

/**
 * 应用球队映射到 iSports 赛事
 * 优先级：crown_cn > isports_cn > isports_en
 */
async function applyTeamMappingToISports(match: ISportsMatch): Promise<ISportsMatch> {
  const homeMapping = await teamMappingManager.findMappingByISportsName(match.team_home_en, match.team_home_cn);
  const awayMapping = await teamMappingManager.findMappingByISportsName(match.team_away_en, match.team_away_cn);

  // 优先使用 crown_cn，如果为空则使用 isports_cn，最后才用原始的 team_home_cn
  const homeCn = (homeMapping?.crown_cn && homeMapping.crown_cn.trim() !== '')
    ? homeMapping.crown_cn
    : (homeMapping?.isports_cn || match.team_home_cn);

  const awayCn = (awayMapping?.crown_cn && awayMapping.crown_cn.trim() !== '')
    ? awayMapping.crown_cn
    : (awayMapping?.isports_cn || match.team_away_cn);

  return {
    ...match,
    team_home_cn: homeCn,
    team_away_cn: awayCn,
  };
}

/**
 * 应用联赛映射到 iSports 赛事
 * 优先级：crown_cn > isports_cn > isports_en
 */
async function applyLeagueMappingToISports(match: ISportsMatch): Promise<ISportsMatch> {
  const leagueMapping = await leagueMappingManager.findMappingByISportsName(match.league_name_en, match.league_name_cn);

  // 优先使用 crown_cn，如果为空则使用 isports_cn，最后才用原始的 league_name_cn
  const leagueCn = (leagueMapping?.crown_cn && leagueMapping.crown_cn.trim() !== '')
    ? leagueMapping.crown_cn
    : (leagueMapping?.isports_cn || match.league_name_cn);

  return {
    ...match,
    league_name_cn: leagueCn,
  };
}

/**
 * 应用所有映射到 iSports 赛事
 */
async function applyMappingsToISports(match: ISportsMatch): Promise<ISportsMatch> {
  let mapped = await applyTeamMappingToISports(match);
  mapped = await applyLeagueMappingToISports(mapped);
  return mapped;
}

/**
 * 计算两个字符串的相似度（Levenshtein 距离）
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * 计算时间差（分钟）
 */
function getTimeDiff(time1: string, time2: string): number {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

/**
 * AI 匹配算法
 */
function aiMatch(crown: Match, isports: ISportsMatch): { matched: boolean; confidence: number; timeDiff: number } {
  // 1. 时间差必须在 30 分钟内
  const timeDiff = getTimeDiff(crown.match_time, isports.match_time);
  if (timeDiff > 30) {
    return { matched: false, confidence: 0, timeDiff };
  }

  // 2. 联赛名称相似度
  const leagueSimilarity = Math.max(
    calculateSimilarity(crown.league_zh, isports.league_name_cn || ''),
    calculateSimilarity(crown.league_zh, isports.league_name_en || '')
  );

  // 3. 主队名称相似度
  const homeSimilarity = Math.max(
    calculateSimilarity(crown.home_zh, isports.team_home_cn || ''),
    calculateSimilarity(crown.home_zh, isports.team_home_en || '')
  );

  // 4. 客队名称相似度
  const awaySimilarity = Math.max(
    calculateSimilarity(crown.away_zh, isports.team_away_cn || ''),
    calculateSimilarity(crown.away_zh, isports.team_away_en || '')
  );

  // 5. 综合评分
  const confidence = (
    leagueSimilarity * 0.3 +
    homeSimilarity * 0.35 +
    awaySimilarity * 0.35
  );

  // 6. 置信度阈值
  const matched = confidence >= 0.7;

  return { matched, confidence, timeDiff };
}

/**
 * GET /api/match-compare
 * 获取赛事匹配数据
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { showType = 'live', timeRange = 'all' } = req.query;

    if (!scraperManager || !thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '服务未初始化',
      });
    }

    // 获取皇冠赛事
    const crownMatches: Match[] = scraperManager.getMatches(showType as ShowType);
    logger.info(`[MatchCompare] 获取到 ${crownMatches.length} 场皇冠赛事`);

    // 获取 iSports 赛事并应用映射
    const rawIsportsMatches: ISportsMatch[] = thirdPartyManager.getISportsCachedData();
    logger.info(`[MatchCompare] 获取到 ${rawIsportsMatches.length} 场 iSports 赛事`);

    // 应用映射到所有 iSports 赛事
    const isportsMatches = await Promise.all(
      rawIsportsMatches.map(match => applyMappingsToISports(match))
    );
    logger.info(`[MatchCompare] 已应用映射到 ${isportsMatches.length} 场 iSports 赛事`);

    // 过滤时间范围
    let filteredCrown = crownMatches;
    let filteredIsports = isportsMatches;

    if (timeRange !== 'all') {
      const now = Date.now();
      const rangeMs = {
        '1h': 60 * 60 * 1000,
        '3h': 3 * 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      }[timeRange as string] || 0;

      if (rangeMs > 0) {
        filteredCrown = crownMatches.filter(m => {
          const matchTime = new Date(m.match_time).getTime();
          return Math.abs(matchTime - now) <= rangeMs;
        });

        filteredIsports = isportsMatches.filter(m => {
          const matchTime = new Date(m.match_time).getTime();
          return Math.abs(matchTime - now) <= rangeMs;
        });
      }
    }

    // 匹配结果
    const matchedCrown = new Set<string>();
    const matchedIsports = new Set<string>();
    const results: any[] = [];

    // 1. 处理手动匹配
    for (const crown of filteredCrown) {
      const manualMatchId = manualMatches.get(crown.gid);
      if (manualMatchId) {
        const isports = filteredIsports.find(i => i.match_id === manualMatchId);
        if (isports) {
          matchedCrown.add(crown.gid);
          matchedIsports.add(isports.match_id);
          results.push({
            crown,
            isports,
            matchType: 'manual',
            confidence: 1,
            timeDiff: getTimeDiff(crown.match_time, isports.match_time),
          });
        }
      }
    }

    // 2. AI 自动匹配
    for (const crown of filteredCrown) {
      if (matchedCrown.has(crown.gid)) continue;

      let bestMatch: ISportsMatch | null = null;
      let bestConfidence = 0;
      let bestTimeDiff = 0;

      for (const isports of filteredIsports) {
        if (matchedIsports.has(isports.match_id)) continue;

        const { matched, confidence, timeDiff } = aiMatch(crown, isports);
        if (matched && confidence > bestConfidence) {
          bestMatch = isports;
          bestConfidence = confidence;
          bestTimeDiff = timeDiff;
        }
      }

      if (bestMatch) {
        matchedCrown.add(crown.gid);
        matchedIsports.add(bestMatch.match_id);
        results.push({
          crown,
          isports: bestMatch,
          matchType: 'ai',
          confidence: bestConfidence,
          timeDiff: bestTimeDiff,
        });
      } else {
        results.push({
          crown,
          isports: null,
          matchType: 'none',
          confidence: 0,
          timeDiff: undefined,
        });
      }
    }

    // 3. 未匹配的 iSports 赛事
    for (const isports of filteredIsports) {
      if (!matchedIsports.has(isports.match_id)) {
        results.push({
          crown: null,
          isports,
          matchType: 'none',
          confidence: 0,
          timeDiff: undefined,
        });
      }
    }

    // 统计信息
    const stats = {
      crownCount: filteredCrown.length,
      isportsCount: filteredIsports.length,
      aiMatched: results.filter(r => r.matchType === 'ai').length,
      manualMatched: results.filter(r => r.matchType === 'manual').length,
      unmatched: results.filter(r => r.matchType === 'none').length,
    };

    res.json({
      success: true,
      data: results,
      stats,
    });
  } catch (error: any) {
    logger.error('获取赛事匹配数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/match-compare/manual-match
 * 手动匹配
 */
router.post('/manual-match', async (req: Request, res: Response) => {
  try {
    const { crownGid, isportsMatchId } = req.body;

    if (!crownGid || !isportsMatchId) {
      return res.status(400).json({
        success: false,
        error: '缺少参数',
      });
    }

    manualMatches.set(crownGid, isportsMatchId);

    res.json({
      success: true,
      message: '匹配成功',
    });
  } catch (error: any) {
    logger.error('手动匹配失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/match-compare/unmatch
 * 取消匹配
 */
router.post('/unmatch', async (req: Request, res: Response) => {
  try {
    const { crownGid } = req.body;

    if (!crownGid) {
      return res.status(400).json({
        success: false,
        error: '缺少参数',
      });
    }

    manualMatches.delete(crownGid);

    res.json({
      success: true,
      message: '已取消匹配',
    });
  } catch (error: any) {
    logger.error('取消匹配失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/match-compare/export
 * 导出 Excel
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { showType = 'live', timeRange = 'all' } = req.query;

    if (!scraperManager || !thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '服务未初始化',
      });
    }

    // 获取皇冠赛事
    const crownMatches: Match[] = scraperManager.getMatches(showType as ShowType);

    // 获取 iSports 赛事并应用映射
    const rawIsportsMatches: ISportsMatch[] = thirdPartyManager.getISportsCachedData();
    const isportsMatches = await Promise.all(
      rawIsportsMatches.map(match => applyMappingsToISports(match))
    );

    // 过滤时间范围
    let filteredCrown = crownMatches;
    let filteredIsports = isportsMatches;

    if (timeRange !== 'all') {
      const now = Date.now();
      const rangeMs = {
        '1h': 60 * 60 * 1000,
        '3h': 3 * 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      }[timeRange as string] || 0;

      if (rangeMs > 0) {
        filteredCrown = crownMatches.filter(m => {
          const matchTime = new Date(m.match_time).getTime();
          return Math.abs(matchTime - now) <= rangeMs;
        });

        filteredIsports = isportsMatches.filter(m => {
          const matchTime = new Date(m.match_time).getTime();
          return Math.abs(matchTime - now) <= rangeMs;
        });
      }
    }

    // 执行匹配逻辑（复用上面的代码）
    const matchedCrown = new Set<string>();
    const matchedIsports = new Set<string>();
    const results: any[] = [];

    // 1. 处理手动匹配
    for (const crown of filteredCrown) {
      const manualMatchId = manualMatches.get(crown.gid);
      if (manualMatchId) {
        const isports = filteredIsports.find(i => i.match_id === manualMatchId);
        if (isports) {
          matchedCrown.add(crown.gid);
          matchedIsports.add(isports.match_id);
          results.push({
            crown,
            isports,
            matchType: 'manual',
            confidence: 1,
            timeDiff: getTimeDiff(crown.match_time, isports.match_time),
          });
        }
      }
    }

    // 2. AI 自动匹配
    for (const crown of filteredCrown) {
      if (matchedCrown.has(crown.gid)) continue;

      let bestMatch: ISportsMatch | null = null;
      let bestConfidence = 0;
      let bestTimeDiff = 0;

      for (const isports of filteredIsports) {
        if (matchedIsports.has(isports.match_id)) continue;

        const { matched, confidence, timeDiff } = aiMatch(crown, isports);
        if (matched && confidence > bestConfidence) {
          bestMatch = isports;
          bestConfidence = confidence;
          bestTimeDiff = timeDiff;
        }
      }

      if (bestMatch) {
        matchedCrown.add(crown.gid);
        matchedIsports.add(bestMatch.match_id);
        results.push({
          crown,
          isports: bestMatch,
          matchType: 'ai',
          confidence: bestConfidence,
          timeDiff: bestTimeDiff,
        });
      } else {
        results.push({
          crown,
          isports: null,
          matchType: 'none',
          confidence: 0,
          timeDiff: undefined,
        });
      }
    }

    // 3. 未匹配的 iSports 赛事
    for (const isports of filteredIsports) {
      if (!matchedIsports.has(isports.match_id)) {
        results.push({
          crown: null,
          isports,
          matchType: 'none',
          confidence: 0,
          timeDiff: undefined,
        });
      }
    }

    // 创建 Excel 工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('赛事匹配');

    // 设置列
    worksheet.columns = [
      { header: '匹配状态', key: 'matchType', width: 12 },
      { header: '置信度', key: 'confidence', width: 10 },
      { header: '时间差(分钟)', key: 'timeDiff', width: 15 },
      { header: '皇冠-联赛', key: 'crownLeague', width: 25 },
      { header: '皇冠-主队', key: 'crownHome', width: 20 },
      { header: '皇冠-客队', key: 'crownAway', width: 20 },
      { header: '皇冠-时间', key: 'crownTime', width: 20 },
      { header: '皇冠-GID', key: 'crownGid', width: 25 },
      { header: 'iSports-联赛', key: 'isportsLeague', width: 25 },
      { header: 'iSports-主队', key: 'isportsHome', width: 20 },
      { header: 'iSports-客队', key: 'isportsAway', width: 20 },
      { header: 'iSports-时间', key: 'isportsTime', width: 20 },
      { header: 'iSports-ID', key: 'isportsId', width: 15 },
    ];

    // 添加数据
    results.forEach(item => {
      const matchTypeText = item.matchType === 'ai' ? 'AI匹配' : item.matchType === 'manual' ? '手动匹配' : '未匹配';
      const confidenceText = item.confidence ? `${Math.round(item.confidence * 100)}%` : '-';
      const timeDiffText = item.timeDiff !== undefined ? `${Math.round(item.timeDiff)}` : '-';

      worksheet.addRow({
        matchType: matchTypeText,
        confidence: confidenceText,
        timeDiff: timeDiffText,
        crownLeague: item.crown?.league_zh || '-',
        crownHome: item.crown?.home_zh || '-',
        crownAway: item.crown?.away_zh || '-',
        crownTime: item.crown?.match_time || '-',
        crownGid: item.crown?.gid || '-',
        isportsLeague: item.isports?.league_name_cn || item.isports?.league_name_en || '-',
        isportsHome: item.isports?.home_team_cn || item.isports?.home_team_en || '-',
        isportsAway: item.isports?.away_team_cn || item.isports?.away_team_en || '-',
        isportsTime: item.isports?.match_time || '-',
        isportsId: item.isports?.match_id || '-',
      });
    });

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=match-compare-${Date.now()}.xlsx`);

    // 写入响应
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('导出 Excel 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

