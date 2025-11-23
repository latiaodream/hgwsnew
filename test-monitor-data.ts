import { CrownScraper } from './src/scrapers/CrownScraper';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

async function testMonitorData() {
  const scraper = new CrownScraper({
    username: process.env.LIVE_CROWN_USERNAME!,
    password: process.env.LIVE_CROWN_PASSWORD!,
    showType: 'today',
  });

  try {
    console.log('🔐 登录中...');
    await scraper.login();
    console.log('✅ 登录成功\n');

    console.log('📊 抓取 today 赛事...');
    const matches = await scraper.fetchMatchesByType('today');
    console.log(`✅ 抓取到 ${matches.length} 场赛事\n`);

    const targetGid = '8297079';
    const match = matches.find(m => m.gid === targetGid);

    if (!match) {
      console.log(`❌ 未找到 GID ${targetGid} 的赛事`);
      console.log('可用的 GID:', matches.map(m => m.gid).join(', '));
      return;
    }

    console.log('🎯 找到目标赛事:');
    console.log(`   ${match.home} vs ${match.away}`);
    console.log(`   联赛: ${match.league}`);
    console.log(`   状态: ${match.live_status}`);
    console.log('');

    console.log('📋 原始数据检查:');
    console.log(`   _rawGame: ${!!(match as any)._rawGame ? '✅' : '❌'}`);
    console.log(`   _rawMoreMarkets: ${!!(match as any)._rawMoreMarkets ? '✅' : '❌'}`);
    console.log(`   _rawObt: ${!!(match as any)._rawObt ? '✅' : '❌'}`);
    console.log(`   raw.game: ${!!match.raw?.game ? '✅' : '❌'}`);
    console.log(`   raw.moreMarkets: ${!!match.raw?.moreMarkets ? '✅' : '❌'}`);
    console.log(`   raw.obt: ${!!match.raw?.obt ? '✅' : '❌'}`);
    console.log('');

    console.log('🎲 盘口数据:');
    console.log(`   让球盘数量: ${match.markets?.full?.handicapLines?.length || 0}`);
    console.log(`   大小球盘数量: ${match.markets?.full?.overUnderLines?.length || 0}`);
    console.log('');

    if (match.markets?.full?.handicapLines) {
      console.log('📊 让球盘:');
      match.markets.full.handicapLines.forEach((line, idx) => {
        console.log(`   ${idx + 1}. 盘口: ${line.hdp}, 主队: ${line.home}, 客队: ${line.away}`);
      });
      console.log('');
    }

    if (match.markets?.full?.overUnderLines) {
      console.log('📊 大小球:');
      match.markets.full.overUnderLines.forEach((line, idx) => {
        console.log(`   ${idx + 1}. 盘口: ${line.hdp}, 大球: ${line.over}, 小球: ${line.under}`);
      });
      console.log('');
    }

    // 保存完整数据
    const outputData = {
      gid: match.gid,
      league: match.league,
      home: match.home,
      away: match.away,
      live_status: match.live_status,
      markets: match.markets,
      raw: {
        game: (match as any)._rawGame || match.raw?.game,
        moreMarkets: (match as any)._rawMoreMarkets || match.raw?.moreMarkets,
        obt: (match as any)._rawObt || match.raw?.obt,
      },
    };

    const outputFile = `monitor-test-${targetGid}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`💾 完整数据已保存到: ${outputFile}`);

    // 检查 raw.game 中的 MORE 字段
    const rawGame = (match as any)._rawGame || match.raw?.game;
    if (rawGame) {
      console.log('');
      console.log('🔍 raw.game 关键字段:');
      console.log(`   MORE: ${rawGame.MORE || rawGame.more || '无'}`);
      console.log(`   GOPEN: ${rawGame.GOPEN || rawGame.gopen || '无'}`);
      console.log(`   ISMASTER: ${rawGame.ISMASTER || rawGame.ismaster || '无'}`);
      console.log(`   STRONG: ${rawGame.STRONG || rawGame.strong || '无'}`);
    }

    await scraper.logout();
    console.log('\n✅ 测试完成');
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  }
}

testMonitorData();

