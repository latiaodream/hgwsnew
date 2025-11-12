import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

// 存储 ScraperManager 实例
let scraperManager: any = null;

export function setScraperManager(manager: any) {
  scraperManager = manager;
  logger.info('[Routes] setScraperManager 被调用');
}

// 获取所有赛事
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!scraperManager) {
      return res.status(503).json({
        success: false,
        error: '抓取服务未初始化',
      });
    }

    const { showType } = req.query;

    let matches: any[] = [];

    if (showType && typeof showType === 'string') {
      // 获取特定类型的赛事
      matches = scraperManager.getMatches(showType as any);
    } else {
      // 获取所有赛事
      matches = scraperManager.getAllMatches();
    }

    res.json({
      success: true,
      data: matches,
      count: matches.length,
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

    const stats: any = {
      total: 0,
      byType: {
        live: 0,
        today: 0,
        early: 0,
      },
    };

    // 获取各类型赛事数量
    stats.byType.live = scraperManager.getMatches('live').length;
    stats.byType.today = scraperManager.getMatches('today').length;
    stats.byType.early = scraperManager.getMatches('early').length;
    stats.total = stats.byType.live + stats.byType.today + stats.byType.early;

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

