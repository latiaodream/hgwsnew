/**
 * 测试多盘口抓取
 */

import dotenv from 'dotenv';
import { CrownScraper } from './src/scrapers/CrownScraper';
import { AccountConfig } from './src/types';

dotenv.config();

async function testMoreMarkets() {
    console.log('🧪 测试多盘口抓取...\n');

    const liveAccount: AccountConfig = {
        username: process.env.LIVE_CROWN_USERNAME || '',
        password: process.env.LIVE_CROWN_PASSWORD || '',
        showType: 'live',
    };

    if (!liveAccount.username || !liveAccount.password) {
        console.error('❌ 请配置 LIVE_CROWN_USERNAME 和 LIVE_CROWN_PASSWORD');
        process.exit(1);
    }

    const scraper = new CrownScraper(liveAccount);

    try {
        // 登录
        console.log('1️⃣ 登录...');
        const loginSuccess = await scraper.login();
        if (!loginSuccess) {
            console.error('❌ 登录失败');
            process.exit(1);
        }
        console.log('✅ 登录成功\n');

        // 抓取赛事
        console.log('2️⃣ 抓取赛事（包含多盘口）...');
        const matches = await scraper.fetchMatches();
        console.log(`✅ 获取到 ${matches.length} 场赛事\n`);

        // 显示每场比赛的盘口数量
        console.log('📊 盘口统计：\n');
        matches.slice(0, 10).forEach((match, index) => {
            const fullHdpCount = match.markets?.full?.handicapLines?.length || 0;
            const fullOuCount = match.markets?.full?.overUnderLines?.length || 0;
            const halfHdpCount = match.markets?.half?.handicapLines?.length || 0;
            const halfOuCount = match.markets?.half?.overUnderLines?.length || 0;

            console.log(`${index + 1}. ${match.home_zh} vs ${match.away_zh}`);
            console.log(`   GID: ${match.gid}`);
            console.log(`   全场让球: ${fullHdpCount} 个盘口`);
            console.log(`   全场大小: ${fullOuCount} 个盘口`);
            console.log(`   半场让球: ${halfHdpCount} 个盘口`);
            console.log(`   半场大小: ${halfOuCount} 个盘口`);

            // 显示全场让球详情
            if (fullHdpCount > 0) {
                console.log('   全场让球详情:');
                match.markets!.full!.handicapLines!.forEach((line, i) => {
                    console.log(`     [${i + 1}] ${line.hdp} | 主: ${line.home} | 客: ${line.away}`);
                });
            }

            // 显示全场大小详情
            if (fullOuCount > 0) {
                console.log('   全场大小详情:');
                match.markets!.full!.overUnderLines!.forEach((line, i) => {
                    console.log(`     [${i + 1}] ${line.hdp} | 大: ${line.over} | 小: ${line.under}`);
                });
            }

            console.log('');
        });

    } catch (error: any) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testMoreMarkets().catch(error => {
    console.error('❌ 异常:', error);
    process.exit(1);
});
