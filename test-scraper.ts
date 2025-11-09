/**
 * 测试脚本：验证皇冠抓取器功能
 * 
 * 使用方法：
 * 1. 配置 .env 文件
 * 2. 运行: npx ts-node test-scraper.ts
 */

import dotenv from 'dotenv';
import { CrownScraper } from './src/scrapers/CrownScraper';
import { AccountConfig } from './src/types';

// 加载环境变量
dotenv.config();

async function testScraper() {
  console.log('🧪 开始测试皇冠抓取器...\n');

  // 测试滚球账号
  const liveAccount: AccountConfig = {
    username: process.env.LIVE_CROWN_USERNAME || '',
    password: process.env.LIVE_CROWN_PASSWORD || '',
    showType: 'live',
  };

  if (!liveAccount.username || !liveAccount.password) {
    console.error('❌ 请在 .env 文件中配置 LIVE_CROWN_USERNAME 和 LIVE_CROWN_PASSWORD');
    process.exit(1);
  }

  const scraper = new CrownScraper(liveAccount);

  try {
    // 测试登录
    console.log('1️⃣ 测试登录...');
    const loginSuccess = await scraper.login();
    
    if (!loginSuccess) {
      console.error('❌ 登录失败');
      process.exit(1);
    }
    
    console.log('✅ 登录成功\n');

    // 测试获取赛事列表
    console.log('2️⃣ 测试获取赛事列表...');
    const matches = await scraper.fetchMatches();
    
    console.log(`✅ 获取到 ${matches.length} 场赛事\n`);

    // 显示前 5 场赛事
    if (matches.length > 0) {
      console.log('📋 前 5 场赛事：');
      matches.slice(0, 5).forEach((match, index) => {
        console.log(`\n${index + 1}. ${match.league_zh}`);
        console.log(`   ${match.home_zh} vs ${match.away_zh}`);
        console.log(`   GID: ${match.gid}`);
        console.log(`   时间: ${match.match_time}`);
        console.log(`   状态: ${match.state === 0 ? '未开始' : match.state === 1 ? '进行中' : '已结束'}`);
        
        if (match.state === 1 && match.home_score !== undefined && match.away_score !== undefined) {
          console.log(`   比分: ${match.home_score}-${match.away_score}`);
        }

        // 显示赔率
        if (match.markets) {
          if (match.markets.moneyline) {
            console.log(`   独赢: 主 ${match.markets.moneyline.home || '-'} | 和 ${match.markets.moneyline.draw || '-'} | 客 ${match.markets.moneyline.away || '-'}`);
          }
          
          if (match.markets.full?.handicapLines && match.markets.full.handicapLines.length > 0) {
            const hdp = match.markets.full.handicapLines[0];
            console.log(`   让球: ${hdp.hdp} (主 ${hdp.home} | 客 ${hdp.away})`);
          }
          
          if (match.markets.full?.overUnderLines && match.markets.full.overUnderLines.length > 0) {
            const ou = match.markets.full.overUnderLines[0];
            console.log(`   大小: ${ou.hdp} (大 ${ou.over} | 小 ${ou.under})`);
          }
        }
      });
    }

    // 测试获取单场赛事赔率
    if (matches.length > 0) {
      console.log('\n3️⃣ 测试获取单场赛事赔率...');
      const firstMatch = matches[0];
      const odds = await scraper.fetchMatchOdds(firstMatch.gid);
      
      if (odds) {
        console.log('✅ 获取赔率成功');
        console.log('   赔率数据:', JSON.stringify(odds, null, 2));
      } else {
        console.log('⚠️  该赛事暂无赔率');
      }
    }

    console.log('\n✅ 所有测试通过！');
    
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
testScraper().catch(error => {
  console.error('❌ 测试异常:', error);
  process.exit(1);
});

