import { Router, Request, Response } from 'express';

const router = Router();

/**
 * 所有第三方 / iSports 相关接口已下线
 * 统一返回 410，提示客户端不要再调用
 */
router.all('*', (req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: '第三方 / iSports 接口已停用，此模块不再可用',
  });
});

export default router;
