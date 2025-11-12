/**
 * 联赛映射 API 路由
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { LeagueMappingManager } from '../utils/LeagueMappingManager';
import logger from '../utils/logger';

// 配置 multer 用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 和 .xls 格式的文件'));
    }
  },
});

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

/**
 * POST /api/league-mapping/import-excel
 * 从 Excel 文件导入联赛映射
 *
 * Excel 格式要求：
 * - 第一行为表头（会被忽略）
 * - 列顺序：isports_en, isports_cn, crown_cn
 * - 示例：
 *   | isports_en | isports_cn | crown_cn |
 *   | Premier League | 英超 | 英格兰超级联赛 |
 */
router.post('/import-excel', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传文件',
      });
    }

    // 解析 Excel 文件
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 转换为 JSON，使用第一行作为表头
    const data: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    logger.info(`[API] Excel 文件总行数: ${data.length}`);
    if (data.length > 0) {
      logger.info(`[API] 第一行（表头）: ${JSON.stringify(data[0])}`);
      if (data.length > 1) {
        logger.info(`[API] 第二行（数据示例）: ${JSON.stringify(data[1])}`);
      }
    }

    if (data.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Excel 文件为空或格式不正确',
      });
    }

    // 解析数据（跳过第一行表头）
    const mappings = [];
    const errors = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // 跳过空行
      if (!row || row.length === 0 || !row[0]) {
        logger.debug(`[API] 跳过空行: 第 ${i + 1} 行`);
        continue;
      }

      const isports_en = row[0]?.toString().trim();
      const isports_cn = row[1]?.toString().trim() || '';
      const crown_cn = row[2]?.toString().trim() || '';

      logger.debug(`[API] 解析第 ${i + 1} 行: isports_en="${isports_en}", isports_cn="${isports_cn}", crown_cn="${crown_cn}"`);

      // 至少需要 isports_en 和 crown_cn
      if (!isports_en) {
        errors.push({
          row: i + 1,
          error: '缺少 isports_en 字段',
          data: row,
        });
        continue;
      }

      if (!crown_cn) {
        errors.push({
          row: i + 1,
          error: '缺少 crown_cn 字段（请填写翻译）',
          data: row,
        });
        continue;
      }

      mappings.push({
        isports_en,
        isports_cn,
        crown_cn,
        verified: false,
      });
    }

    if (mappings.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有有效的数据可导入',
        errors,
      });
    }

    // 批量导入
    const imported = await leagueMappingManager.importMappings(mappings);

    res.json({
      success: true,
      data: {
        imported: imported.length,
        total: data.length - 1,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    logger.error('[API] Excel 导入失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
export { leagueMappingManager };

