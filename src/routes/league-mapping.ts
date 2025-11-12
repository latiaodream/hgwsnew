/**
 * 联赛映射 API 路由
 */

import { Router, Request, Response } from 'express';
import { LeagueMappingManager } from '../utils/LeagueMappingManager';
import logger from '../utils/logger';

const router = Router();
const leagueMappingManager = new LeagueMappingManager();

/**
 * GET /api/league-mapping
 * 获取所有联赛映射
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, verified } = req.query;

    let mappings = await leagueMappingManager.getAllMappings();

    // 搜索过滤
    if (search && typeof search === 'string') {
      mappings = await leagueMappingManager.searchMappings(search);
    }

    // 验证状态过滤
    if (verified !== undefined) {
      const isVerified = verified === 'true';
      mappings = await leagueMappingManager.filterByVerified(isVerified);
    }

    res.json({
      success: true,
      data: mappings,
      total: mappings.length,
    });
  } catch (error: any) {
    logger.error('[API] 获取联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/league-mapping/statistics
 * 获取统计信息
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await leagueMappingManager.getStatistics();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('[API] 获取统计信息失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/league-mapping/:id
 * 根据 ID 获取联赛映射
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mapping = await leagueMappingManager.getMappingById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: '映射不存在',
      });
    }

    res.json({
      success: true,
      data: mapping,
    });
  } catch (error: any) {
    logger.error('[API] 获取联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/league-mapping
 * 创建新联赛映射
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { isports_en, isports_cn, crown_cn, verified } = req.body;

    if (!isports_en || !isports_cn || !crown_cn) {
      return res.status(400).json({
        success: false,
        error: '缺少必要字段: isports_en, isports_cn, crown_cn',
      });
    }

    const mapping = await leagueMappingManager.createMapping({
      isports_en,
      isports_cn,
      crown_cn,
      verified: verified || false,
    });

    res.json({
      success: true,
      data: mapping,
    });
  } catch (error: any) {
    logger.error('[API] 创建联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/league-mapping/:id
 * 更新联赛映射
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isports_en, isports_cn, crown_cn, verified } = req.body;

    const mapping = await leagueMappingManager.updateMapping(id, {
      isports_en,
      isports_cn,
      crown_cn,
      verified,
    });

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: '映射不存在',
      });
    }

    res.json({
      success: true,
      data: mapping,
    });
  } catch (error: any) {
    logger.error('[API] 更新联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/league-mapping/:id
 * 删除联赛映射
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await leagueMappingManager.deleteMapping(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '映射不存在',
      });
    }

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error: any) {
    logger.error('[API] 删除联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/league-mapping/:id/verify
 * 验证联赛映射
 */
router.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mapping = await leagueMappingManager.verifyMapping(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: '映射不存在',
      });
    }

    res.json({
      success: true,
      data: mapping,
    });
  } catch (error: any) {
    logger.error('[API] 验证联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/league-mapping/import
 * 批量导入联赛映射
 */
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      return res.status(400).json({
        success: false,
        error: 'mappings 必须是数组',
      });
    }

    const imported = await leagueMappingManager.importMappings(mappings);

    res.json({
      success: true,
      data: imported,
      total: imported.length,
    });
  } catch (error: any) {
    logger.error('[API] 批量导入联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/league-mapping/reload
 * 重新加载联赛映射
 */
router.post('/reload', async (req: Request, res: Response) => {
  try {
    leagueMappingManager.reload();
    res.json({
      success: true,
      message: '重新加载成功',
    });
  } catch (error: any) {
    logger.error('[API] 重新加载联赛映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
export { leagueMappingManager };

