/**
 * 测试多盘口抓取（等待延迟后）
 */

import dotenv from 'dotenv';
import { CrownScraper } from './src/scrapers/CrownScraper';
import { AccountConfig } from './src/types';

dotenv.config();

async function testMoreMarketsWithDelay() {
    console.log('🧪 测试多盘口抓取（带延迟）...\n');

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

        // 计算需要等待的时间
        const delaySeconds = parseInt(process.env.MORE_MARKETS_START_DELAY_SECONDS || '45', 10);
        console.log(`⏳ 等待 ${delaySeconds} 秒（MORE_MARKETS_START_DELAY_SECONDS）后开始抓取多盘口...`);

        // 等待延迟时间
        await new Promise(resolve => setTimeout(resolve, (delaySeconds + 2) * 1000));
        console.log('✅ 延迟时间已过\n');

        // 抓取赛事
        console.log('2️⃣ 抓取赛事（包含多盘口）...');
        const matches = await scraper.fetchMatches();
        console.log(`✅ 获取到 ${matches.length} 场赛事\n`);

        // 显示盘口数量统计
        let totalHdp = 0;
        let totalOu = 0;
        let matchesWithMultipleHdp = 0;
        let matchesWithMultipleOu = 0;

        matches.forEach(match => {
            const fullHdpCount = match.markets?.full?.handicapLines?.length || 0;
            const fullOuCount = match.markets?.full?.overUnderLines?.length || 0;

            totalHdp += fullHdpCount;
            totalOu += fullOuCount;

            if (fullHdpCount > 1) matchesWithMultipleHdp++;
            if (fullOuCount > 1) matchesWithMultipleOu++;
        });

        console.log('📊 整体统计：');
        console.log(`   总让球盘口数: ${totalHdp}`);
        console.log(`   总大小盘口数: ${totalOu}`);
        console.log(`   有多个让球盘的比赛: ${matchesWithMultipleHdp} / ${matches.length}`);
        console.log(`   有多个大小盘的比赛: ${matchesWithMultipleOu} / ${matches.length}\n`);

        // 显示前几场有多盘口的比赛
        console.log('📋 有多盘口的比赛详情：\n');
        let count = 0;
        for (const match of matches) {
            const fullHdpCount = match.markets?.full?.handicapLines?.length || 0;
            const fullOuCount = match.markets?.full?.overUnderLines?.length || 0;

            if (fullHdpCount > 1 || fullOuCount > 1) {
                count++;
                console.log(`${count}. ${match.home_zh} vs ${match.away_zh}`);
                console.log(`   GID: ${match.gid}`);

                if (fullHdpCount > 1) {
                    console.log(`   让球盘口 (${fullHdpCount}个):`);
                    match.markets!.full!.handicapLines!.forEach((line, i) => {
                        console.log(`     [${i + 1}] ${line.hdp} | 主: ${line.home} | 客: ${line.away}`);
                    });
                }

                if (fullOuCount > 1) {
                    console.log(`   大小盘口 (${fullOuCount}个):`);
                    match.markets!.full!.overUnderLines!.forEach((line, i) => {
                        console.log(`     [${i + 1}] ${line.hdp} | 大: ${line.over} | 小: ${line.under}`);
                    });
                }

                console.log('');

                if (count >= 5) break;
            }
        }

        if (count === 0) {
            console.log('   ⚠️ 没有找到有多个盘口的比赛');
            console.log('\n可能的原因：');
            console.log('1. 当前没有比赛有多盘口（皇冠官网也只有一个盘）');
            console.log('2. get_game_more API 调用失败');
            console.log('3. MORE_MARKETS_LIMIT 设置太小');
        }

    } catch (error: any) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testMoreMarketsWithDelay().catch(error => {
    console.error('❌ 异常:', error);
    process.exit(1);
});
