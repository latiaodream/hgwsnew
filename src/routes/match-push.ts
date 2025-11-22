import { Router, Request, Response } from 'express';

const router = Router();

/**
 * 赛事推送 / iSports 合并功能已下线
 * 统一返回 410，提示客户端不要再调用
 */
router.all('*', (req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: '赛事推送 (match-push) / iSports 合并功能已停用，此接口不再可用',
  });
});

export default router;

