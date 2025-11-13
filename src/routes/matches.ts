import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { CrownMatchRepository, CrownMatch } from '../repositories/CrownMatchRepository';
import { ScraperManager } from '../scrapers/ScraperManager';

const router = Router();

let scraperManager: ScraperManager | null = null;
const crownMatchRepository = new CrownMatchRepository();

function normalizeCrownMatch(row: CrownMatch & { raw_data?: any }) {
  if (!row) return row;

  let rawData = row.raw_data;
  if (rawData && typeof rawData === 'string') {
    try {
      rawData = JSON.parse(rawData);
    } catch {
      rawData = null;
    }
  }

  const matchTime = row.match_time
    ? new Date(row.match_time).toISOString()
    : undefined;

  const showType =
    (row as any).showType ||
    row.show_type ||
    rawData?.showType ||
    rawData?.show_type;

  return {
    ...row,
    showType,
    league_zh: row.league || rawData?.league_zh || rawData?.league,
    league_en: rawData?.league_en,
    home_zh: row.team_home || rawData?.home_zh || rawData?.home,
    home_en: rawData?.home_en,
    away_zh: row.team_away || rawData?.away_zh || rawData?.away,
    away_en: rawData?.away_en,
    match_time: matchTime,
    matchTime,
    live_status: (row as any).live_status || rawData?.live_status,
    markets: rawData?.markets || (row as any).markets,
    raw: rawData || row.raw_data,
  };
}

export function setScraperManager(manager: ScraperManager) {
  scraperManager = manager;
  logger.info('[Routes] setScraperManager 被调用');
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { showType, search } = req.query;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string) || 50, 1), 200);

    if (!scraperManager) {
      return res.status(503).json({
        success: false,
        error: '抓取服务未初始化',
      });
    }

    let result;
    if (scraperManager.isUsingDatabase()) {
      result = await crownMatchRepository.paginate({
        showType: typeof showType === 'string' ? showType : undefined,
        search: typeof search === 'string' ? search : undefined,
        page,
        pageSize,
      });

      result = {
        data: result.data.map(match => normalizeCrownMatch(match)),
        total: result.total,
      };
    } else {
      let matches: any[] = [];
      if (showType && typeof showType === 'string') {
        matches = scraperManager.getMatches(showType as any);
      } else {
        matches = scraperManager.getAllMatches();
      }
      result = {
        data: matches.slice((page - 1) * pageSize, page * pageSize),
        total: matches.length,
      };
    }

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize) || 1,
      },
    });
  } catch (error: any) {
    logger.error('[API] 获取赛事失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取特定赛事详情
router.get('/:matchId', async (req: Request, res: Response) => {
  try {
    if (!scraperManager) {
      return res.status(503).json({
        success: false,
        error: '抓取服务未初始化',
      });
    }

    const { matchId } = req.params;

    // 使用 ScraperManager 的 getMatch 方法
    const match = scraperManager.getMatch(matchId);

    if (match) {
      return res.json({
        success: true,
        match,
      });
    }

    res.status(404).json({
      success: false,
      error: '赛事不存在',
    });
  } catch (error: any) {
    logger.error('[API] 获取赛事详情失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取统计信息
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    if (!scraperManager) {
      return res.status(503).json({
        success: false,
        error: '抓取服务未初始化',
      });
    }

    let stats: any;
    if (scraperManager.isUsingDatabase()) {
      stats = await crownMatchRepository.getStatistics();
    } else {
      stats = {
        total: 0,
        byType: {
          live: 0,
          today: 0,
          early: 0,
        },
      };
      stats.byType.live = scraperManager.getMatches('live').length;
      stats.byType.today = scraperManager.getMatches('today').length;
      stats.byType.early = scraperManager.getMatches('early').length;
      stats.total = stats.byType.live + stats.byType.today + stats.byType.early;
    }

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    logger.error('[API] 获取统计信息失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
