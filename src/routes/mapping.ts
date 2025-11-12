/**
 * 球队名称映射管理 API 路由
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { MappingManager } from '../utils/MappingManager';
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
const mappingManager = new MappingManager();

/**
 * GET /api/mapping/teams
 * 获取所有映射
 */
router.get('/teams', async (req: Request, res: Response) => {
  try {
    const { search, verified } = req.query;

    let mappings = await mappingManager.getAllMappings();

    // 搜索
    if (search && typeof search === 'string') {
      mappings = await mappingManager.searchMappings(search);
    }

    // 按验证状态筛选
    if (verified !== undefined) {
      const isVerified = verified === 'true' || verified === '1';
      mappings = mappings.filter((m: any) => m.verified === isVerified);
    }

    res.json({
      success: true,
      data: mappings,
      count: mappings.length,
    });
  } catch (error: any) {
    logger.error('[API] 获取映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/mapping/teams/:id
 * 获取单个映射
 */
router.get('/teams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mapping = await mappingManager.getMappingById(id);

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
    logger.error('[API] 获取映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/mapping/teams
 * 创建新映射
 */
router.post('/teams', async (req: Request, res: Response) => {
  try {
    const { isports_en, isports_cn, crown_cn, verified } = req.body;

    if (!isports_en || !isports_cn || !crown_cn) {
      return res.status(400).json({
        success: false,
        error: '缺少必要字段',
      });
    }

    const mapping = await mappingManager.createMapping({
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
    logger.error('[API] 创建映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/mapping/teams/:id
 * 更新映射
 */
router.put('/teams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const mapping = await mappingManager.updateMapping(id, updates);

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
    logger.error('[API] 更新映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/mapping/teams/:id
 * 删除映射
 */
router.delete('/teams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await mappingManager.deleteMapping(id);

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
    logger.error('[API] 删除映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/mapping/teams/batch
 * 批量导入映射
 */
router.post('/teams/batch', async (req: Request, res: Response) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      return res.status(400).json({
        success: false,
        error: 'mappings 必须是数组',
      });
    }

    const imported = await mappingManager.importMappings(mappings);

    res.json({
      success: true,
      data: imported,
      count: imported.length,
    });
  } catch (error: any) {
    logger.error('[API] 批量导入失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/mapping/verify/:id
 * 验证映射
 */
router.post('/verify/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mapping = await mappingManager.verifyMapping(id);

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
    logger.error('[API] 验证映射失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/mapping/statistics
 * 获取统计信息
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await mappingManager.getStatistics();

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
 * POST /api/mapping/teams/import-excel
 * 从 Excel 文件导入球队映射
 *
 * Excel 格式要求：
 * - 第一行为表头（会被忽略）
 * - 列顺序：isports_en, isports_cn, crown_cn
 * - 示例：
 *   | isports_en | isports_cn | crown_cn |
 *   | Manchester United | 曼联 | 曼联 |
 */
router.post('/teams/import-excel', upload.single('file'), async (req: Request, res: Response) => {
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

      // 至少需要 isports_en（crown_cn 可以为空，用于后续匹配）
      if (!isports_en) {
        errors.push({
          row: i + 1,
          error: '缺少 isports_en 字段',
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
    const imported = await mappingManager.importMappings(mappings);

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

