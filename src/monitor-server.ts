import express from 'express';
import path from 'path';
import { CrownScraper } from './scrapers/CrownScraper';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.MONITOR_PORT || 3001;

// 静态文件服务
app.use(express.static('public'));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 创建 scraper 实例
let scraper: CrownScraper | null = null;
let lastLoginTime = 0;
const LOGIN_TIMEOUT = 5 * 60 * 1000; // 5分钟后重新登录

async function getScraper(): Promise<CrownScraper> {
  const now = Date.now();

  // 如果超过5分钟或没有实例，重新创建
  if (!scraper || (now - lastLoginTime) > LOGIN_TIMEOUT) {
    if (scraper) {
      try {
        await scraper.logout();
      } catch (e) {
        // 忽略登出错误
      }
    }

    console.log('[Monitor] 创建新的 scraper 实例...');
    scraper = new CrownScraper({
      username: process.env.LIVE_CROWN_USERNAME!,
      password: process.env.LIVE_CROWN_PASSWORD!,
      showType: 'live',
    });
    await scraper.login();
    lastLoginTime = now;
    console.log('[Monitor] 登录成功');
  }

  return scraper;
}

// API: 获取指定赛事的实时数据
app.get('/api/matches/:gid', async (req, res) => {
  try {
    const { gid } = req.params;

    console.log(`[Monitor] 获取赛事数据: GID=${gid}`);

    let scraperInstance = await getScraper();

    // 只抓取 live 数据，避免并发过多
    let matches: any[] = [];

    try {
      matches = await scraperInstance.fetchMatchesByType('live');
    } catch (error: any) {
      console.log('[Monitor] 抓取失败，尝试重新登录...');
      // 强制重新登录
      scraper = null;
      lastLoginTime = 0;
      scraperInstance = await getScraper();

      matches = await scraperInstance.fetchMatchesByType('live');
    }

    // 查找目标赛事
    const match = matches.find(m => m.gid === gid);

    if (!match) {
      return res.status(404).json({
        error: 'Match not found',
        gid,
        searched: matches.length,
        availableGids: matches.slice(0, 10).map((m: any) => ({ gid: m.gid, home: m.home, away: m.away })),
      });
    }

    // 检查原始数据
    console.log(`[Monitor] 原始数据检查:`, {
      hasRawGame: !!(match as any)._rawGame,
      hasRawMoreMarkets: !!(match as any)._rawMoreMarkets,
      hasRawObt: !!(match as any)._rawObt,
      hasRaw: !!match.raw,
      rawKeys: match.raw ? Object.keys(match.raw) : [],
    });

    // 返回完整数据
    res.json({
      gid: match.gid,
      league_zh: match.league,
      home_zh: match.home,
      away_zh: match.away,
      live_status: match.live_status,
      match_time: match.match_time,
      markets: match.markets,
      raw: {
        game: (match as any)._rawGame || match.raw?.game,
        moreMarkets: (match as any)._rawMoreMarkets || match.raw?.moreMarkets,
        obt: (match as any)._rawObt || match.raw?.obt,
      },
      timestamp: new Date().toISOString(),
    });

    console.log(`[Monitor] 成功返回数据: ${match.home} vs ${match.away}`);
  } catch (error: any) {
    console.error('[Monitor] 错误:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    scraper: scraper ? 'initialized' : 'not initialized',
    timestamp: new Date().toISOString(),
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🎯 赛事实时监控服务已启动                                  ║
║                                                            ║
║   📊 监控页面: http://localhost:${PORT}/match-monitor.html      ║
║   🔌 API 端点: http://localhost:${PORT}/api/matches/:gid       ║
║   ❤️  健康检查: http://localhost:${PORT}/api/health            ║
║                                                            ║
║   目标赛事: GID 8294765 (美因茨05 vs 霍芬海姆)              ║
║   刷新频率: 3秒/次                                          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n[Monitor] 正在关闭服务器...');
  if (scraper) {
    await scraper.logout();
  }
  process.exit(0);
});

