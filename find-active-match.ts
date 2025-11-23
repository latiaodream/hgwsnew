import { CrownScraper } from './src/scrapers/CrownScraper';
import dotenv from 'dotenv';

dotenv.config();

async function findActiveMatch() {
  const scraper = new CrownScraper({
    username: process.env.LIVE_CROWN_USERNAME!,
    password: process.env.LIVE_CROWN_PASSWORD!,
    showType: 'live',
  });

  try {
    console.log('🔐 登录中...');
    await scraper.login();
    console.log('✅ 登录成功\n');

    console.log('📊 抓取 live 赛事...');
    const matches = await scraper.fetchMatchesByType('live');
    console.log(`✅ 抓取到 ${matches.length} 场赛事\n`);

    console.log('🔍 查找有盘口数据的比赛...\n');

    for (const match of matches) {
      const rawGame = (match as any)._rawGame || match.raw?.game;
      const gopen = rawGame?.GOPEN || rawGame?.gopen;
      const more = rawGame?.MORE || rawGame?.more || 0;
      const hasHandicap = match.markets?.full?.handicapLines && match.markets.full.handicapLines.length > 0;
      const hasOverUnder = match.markets?.full?.overUnderLines && match.markets.full.overUnderLines.length > 0;

      if (gopen === 'Y' && (hasHandicap || hasOverUnder)) {
        console.log(`✅ 找到活跃比赛:`);
        console.log(`   GID: ${match.gid}`);
        console.log(`   ${match.home} vs ${match.away}`);
        console.log(`   联赛: ${match.league}`);
        console.log(`   状态: ${match.live_status}`);
        console.log(`   比分: ${match.home_score || 0} - ${match.away_score || 0}`);
        console.log(`   GOPEN: ${gopen}`);
        console.log(`   MORE: ${more}`);
        console.log(`   让球盘数量: ${match.markets?.full?.handicapLines?.length || 0}`);
        console.log(`   大小球数量: ${match.markets?.full?.overUnderLines?.length || 0}`);
        console.log('');

        if (match.markets?.full?.handicapLines && match.markets.full.handicapLines.length > 0) {
          console.log('   让球盘:');
          match.markets.full.handicapLines.slice(0, 3).forEach((line, idx) => {
            console.log(`     ${idx + 1}. ${line.hdp}: ${line.home} / ${line.away}`);
          });
        }
        console.log('');
        console.log('---');
        console.log('');
      }
    }

    await scraper.logout();
    console.log('✅ 完成');
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  }
}

findActiveMatch();

