/**
 * 第三方 API 数据路由
 */

import { Router, Request, Response } from 'express';
import { ThirdPartyManager } from '../scrapers/ThirdPartyManager';
import { MappingManager } from '../utils/MappingManager';
import { LeagueMappingManager } from '../utils/LeagueMappingManager';
import { ISportsMatch } from '../scrapers/ISportsAPIScraper';
import { OddsAPIMatch } from '../scrapers/OddsAPIScraper';
import logger from '../utils/logger';
import * as XLSX from 'xlsx';

// 初始化映射管理器
const teamMappingManager = new MappingManager();
const leagueMappingManager = new LeagueMappingManager();

const router = Router();

// 全局 ThirdPartyManager 实例（将在 index.ts 中初始化）
let thirdPartyManager: ThirdPartyManager | null = null;

/**
 * 设置 ThirdPartyManager 实例
 */
export function setThirdPartyManager(manager: ThirdPartyManager) {
  logger.info(`[Routes] setThirdPartyManager 被调用，manager 是否存在: ${!!manager}`);
  thirdPartyManager = manager;
  logger.info(`[Routes] thirdPartyManager 已设置，是否存在: ${!!thirdPartyManager}`);
}

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
 * 应用球队映射到 OddsAPI 赛事
 * 优先级：crown_cn > isports_cn > isports_en
 */
async function applyTeamMappingToOddsAPI(match: OddsAPIMatch): Promise<OddsAPIMatch> {
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
 * 应用联赛映射到 OddsAPI 赛事
 * 优先级：crown_cn > isports_cn > isports_en
 */
async function applyLeagueMappingToOddsAPI(match: OddsAPIMatch): Promise<OddsAPIMatch> {
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
 * 应用所有映射到 OddsAPI 赛事
 */
async function applyMappingsToOddsAPI(match: OddsAPIMatch): Promise<OddsAPIMatch> {
  let mapped = await applyTeamMappingToOddsAPI(match);
  mapped = await applyLeagueMappingToOddsAPI(mapped);
  return mapped;
}

/**
 * GET /api/thirdparty/isports
 * 获取 iSportsAPI 数据
 */
router.get('/isports', async (req: Request, res: Response) => {
  try {
    logger.info(`[API] 收到 /api/thirdparty/isports 请求`);
    logger.info(`[API] thirdPartyManager 是否存在: ${!!thirdPartyManager}`);

    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const { status, refresh } = req.query;

    // 如果需要刷新数据
    if (refresh === 'true' || refresh === '1') {
      await thirdPartyManager.fetchISports();
    }

    let matches = thirdPartyManager.getISportsCachedData();
    logger.info(`[API] getISportsCachedData() 返回 ${matches.length} 场赛事`);

    // 按状态筛选
    if (status && typeof status === 'string') {
      matches = matches.filter(m => m.status === status);
      logger.info(`[API] 筛选 status=${status} 后剩余 ${matches.length} 场赛事`);
    }

    // 应用映射
    const mappedMatches = await Promise.all(matches.map(m => applyMappingsToISports(m)));

    res.json({
      success: true,
      data: mappedMatches,
      count: mappedMatches.length,
      source: 'iSportsAPI',
    });
  } catch (error: any) {
    logger.error('[API] 获取 iSportsAPI 数据失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/thirdparty/odds-api
 * 获取 Odds-API.io 数据
 */
router.get('/odds-api', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const { status, refresh } = req.query;

    // 如果需要刷新数据
    if (refresh === 'true' || refresh === '1') {
      await thirdPartyManager.fetchOddsAPI();
    }

    let matches = thirdPartyManager.getOddsAPICachedData();

    // 按状态筛选
    if (status && typeof status === 'string') {
      matches = matches.filter(m => m.status === status);
    }

    // 应用映射
    const mappedMatches = await Promise.all(matches.map(m => applyMappingsToOddsAPI(m)));

    res.json({
      success: true,
      data: mappedMatches,
      count: mappedMatches.length,
      source: 'Odds-API.io',
    });
  } catch (error: any) {
    logger.error('[API] 获取 Odds-API.io 数据失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/thirdparty/all
 * 获取所有第三方数据
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const { refresh } = req.query;

    // 如果需要刷新数据
    if (refresh === 'true' || refresh === '1') {
      await thirdPartyManager.fetchAll();
    }

    const data = thirdPartyManager.getCachedData();

    // 应用映射
    const mappedISports = await Promise.all(data.isports.map(m => applyMappingsToISports(m)));
    const mappedOddsAPI = await Promise.all(data.oddsapi.map(m => applyMappingsToOddsAPI(m)));

    res.json({
      success: true,
      data: {
        isports: mappedISports,
        oddsapi: mappedOddsAPI,
        last_update: data.last_update,
      },
      count: {
        isports: mappedISports.length,
        oddsapi: mappedOddsAPI.length,
        total: mappedISports.length + mappedOddsAPI.length,
      },
    });
  } catch (error: any) {
    logger.error('[API] 获取所有第三方数据失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/thirdparty/status
 * 获取第三方服务状态
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const status = thirdPartyManager.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    logger.error('[API] 获取服务状态失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/thirdparty/refresh
 * 手动刷新所有数据
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const data = await thirdPartyManager.fetchAll();

    res.json({
      success: true,
      data,
      count: {
        isports: data.isports.length,
        oddsapi: data.oddsapi.length,
        total: data.isports.length + data.oddsapi.length,
      },
      message: '数据刷新成功',
    });
  } catch (error: any) {
    logger.error('[API] 刷新数据失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/thirdparty/export-teams
 * 导出第三方赛事的球队信息（用于翻译）
 */
router.get('/export-teams', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const data = thirdPartyManager.getCachedData();

    // 收集所有球队名称（去重）
    const teamsSet = new Set<string>();

    // 从 iSports 收集
    data.isports.forEach(match => {
      if (match.team_home_en) teamsSet.add(`${match.team_home_en}|${match.team_home_cn || ''}`);
      if (match.team_away_en) teamsSet.add(`${match.team_away_en}|${match.team_away_cn || ''}`);
    });

    // 从 Odds-API 收集
    data.oddsapi.forEach(match => {
      if (match.team_home_en) teamsSet.add(`${match.team_home_en}|${match.team_home_cn || ''}`);
      if (match.team_away_en) teamsSet.add(`${match.team_away_en}|${match.team_away_cn || ''}`);
    });

    // 转换为数组并排序
    const teams = Array.from(teamsSet)
      .map(item => {
        const [en, cn] = item.split('|');
        return { isports_en: en, isports_cn: cn, crown_cn: '' };
      })
      .sort((a, b) => a.isports_en.localeCompare(b.isports_en));

    res.json({
      success: true,
      data: teams,
      count: teams.length,
    });
  } catch (error: any) {
    logger.error('[API] 导出球队信息失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/thirdparty/export-leagues
 * 导出第三方赛事的联赛信息（用于翻译）
 */
router.get('/export-leagues', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const data = thirdPartyManager.getCachedData();

    // 收集所有联赛名称（去重）
    const leaguesSet = new Set<string>();

    // 从 iSports 收集
    data.isports.forEach(match => {
      if (match.league_name_en) leaguesSet.add(`${match.league_name_en}|${match.league_name_cn || ''}`);
    });

    // 从 Odds-API 收集
    data.oddsapi.forEach(match => {
      if (match.league_name_en) leaguesSet.add(`${match.league_name_en}|${match.league_name_cn || ''}`);
    });

    // 转换为数组并排序
    const leagues = Array.from(leaguesSet)
      .map(item => {
        const [en, cn] = item.split('|');
        return { isports_en: en, isports_cn: cn, crown_cn: '' };
      })
      .sort((a, b) => a.isports_en.localeCompare(b.isports_en));

    res.json({
      success: true,
      data: leagues,
      count: leagues.length,
    });
  } catch (error: any) {
    logger.error('[API] 导出联赛信息失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/thirdparty/export-teams-excel
 * 导出球队信息为 Excel 文件
 */
router.get('/export-teams-excel', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const data = thirdPartyManager.getCachedData();

    // 收集所有球队名称（去重）
    const teamsSet = new Set<string>();

    // 从 iSports 收集
    data.isports.forEach(match => {
      if (match.team_home_en) teamsSet.add(`${match.team_home_en}|${match.team_home_cn || ''}`);
      if (match.team_away_en) teamsSet.add(`${match.team_away_en}|${match.team_away_cn || ''}`);
    });

    // 从 Odds-API 收集
    data.oddsapi.forEach(match => {
      if (match.team_home_en) teamsSet.add(`${match.team_home_en}|${match.team_home_cn || ''}`);
      if (match.team_away_en) teamsSet.add(`${match.team_away_en}|${match.team_away_cn || ''}`);
    });

    // 转换为数组并排序
    const teams = Array.from(teamsSet)
      .map(item => {
        const [en, cn] = item.split('|');
        return { isports_en: en, isports_cn: cn, crown_cn: '' };
      })
      .sort((a, b) => a.isports_en.localeCompare(b.isports_en));

    // 创建 Excel 工作簿，明确指定表头
    const worksheet = XLSX.utils.json_to_sheet(teams, {
      header: ['isports_en', 'isports_cn', 'crown_cn'],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Teams');

    // 生成 Excel 文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=teams-export-${new Date().toISOString().split('T')[0]}.xlsx`);

    res.send(excelBuffer);
  } catch (error: any) {
    logger.error('[API] 导出球队 Excel 失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/thirdparty/export-leagues-excel
 * 导出联赛信息为 Excel 文件
 */
router.get('/export-leagues-excel', async (req: Request, res: Response) => {
  try {
    if (!thirdPartyManager) {
      return res.status(503).json({
        success: false,
        error: '第三方服务未初始化',
      });
    }

    await thirdPartyManager.ensureCacheLoaded();

    const data = thirdPartyManager.getCachedData();

    // 收集所有联赛名称（去重）
    const leaguesSet = new Set<string>();

    // 从 iSports 收集
    data.isports.forEach(match => {
      if (match.league_name_en) leaguesSet.add(`${match.league_name_en}|${match.league_name_cn || ''}`);
    });

    // 从 Odds-API 收集
    data.oddsapi.forEach(match => {
      if (match.league_name_en) leaguesSet.add(`${match.league_name_en}|${match.league_name_cn || ''}`);
    });

    // 转换为数组并排序
    const leagues = Array.from(leaguesSet)
      .map(item => {
        const [en, cn] = item.split('|');
        return { isports_en: en, isports_cn: cn, crown_cn: '' };
      })
      .sort((a, b) => a.isports_en.localeCompare(b.isports_en));

    // 创建 Excel 工作簿，明确指定表头
    const worksheet = XLSX.utils.json_to_sheet(leagues, {
      header: ['isports_en', 'isports_cn', 'crown_cn'],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leagues');

    // 生成 Excel 文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=leagues-export-${new Date().toISOString().split('T')[0]}.xlsx`);

    res.send(excelBuffer);
  } catch (error: any) {
    logger.error('[API] 导出联赛 Excel 失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
