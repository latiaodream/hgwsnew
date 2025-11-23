/**
 * 抓取指定赛事的详细数据
 * GID: 8294765 - 德国甲组联赛
 */

import { CrownScraper } from './src/scrapers/CrownScraper';
import { AccountConfig } from './src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const TARGET_GID = '8294765';

async function fetchSpecificMatch() {
  console.log('='.repeat(100));
  console.log('🎯 抓取指定赛事详细数据');
  console.log('='.repeat(100));
  console.log(`目标 GID: ${TARGET_GID}`);
  console.log(`赛事: 德国甲组联赛`);
  console.log('');

  // 使用环境变量中的账号
  const accounts: AccountConfig[] = [
    {
      username: process.env.LIVE_CROWN_USERNAME || '',
      password: process.env.LIVE_CROWN_PASSWORD || '',
      showType: 'live',
    },
    {
      username: process.env.TODAY_CROWN_USERNAME || '',
      password: process.env.TODAY_CROWN_PASSWORD || '',
      showType: 'today',
    },
    {
      username: process.env.EARLY_CROWN_USERNAME || '',
      password: process.env.EARLY_CROWN_PASSWORD || '',
      showType: 'early',
    },
  ];

  let matchFound = false;

  for (const account of accounts) {
    if (!account.username || !account.password) {
      console.log(`⚠️  跳过 ${account.showType} 账号（未配置）\n`);
      continue;
    }

    console.log('='.repeat(100));
    console.log(`📡 尝试使用 ${account.showType.toUpperCase()} 账号抓取`);
    console.log('='.repeat(100));
    console.log(`账号: ${account.username}`);
    console.log('');

    const scraper = new CrownScraper(account);

    try {
      // 1. 登录
      console.log('🔐 正在登录...');
      const loginSuccess = await scraper.login();
      if (!loginSuccess) {
        console.error(`❌ ${account.showType} 账号登录失败\n`);
        continue;
      }
      console.log('✅ 登录成功\n');

      // 2. 获取赛事列表
      console.log('📊 正在获取赛事列表...');
      const matches = await scraper.fetchMatches();
      console.log(`✅ 获取到 ${matches.length} 场赛事\n`);

      // 3. 查找目标赛事
      const targetMatch = matches.find(m => m.gid === TARGET_GID);

      if (!targetMatch) {
        console.log(`⚠️  在 ${account.showType} 列表中未找到 GID=${TARGET_GID} 的赛事\n`);
        await scraper.logout();
        continue;
      }

      matchFound = true;
      console.log('🎉 找到目标赛事！');
      console.log('='.repeat(100));
      console.log('');

      // 4. 显示基本信息
      console.log('📋 基本信息:');
      console.log('-'.repeat(100));
      console.log(`GID: ${targetMatch.gid}`);
      console.log(`联赛: ${targetMatch.league_zh} (${targetMatch.league})`);
      console.log(`主队: ${targetMatch.home_zh} (${targetMatch.home})`);
      console.log(`客队: ${targetMatch.away_zh} (${targetMatch.away})`);
      console.log(`时间: ${targetMatch.match_time}`);
      console.log(`类型: ${targetMatch.showType}`);
      if (targetMatch.live_status) {
        console.log(`状态: ${targetMatch.live_status}`);
      }
      console.log('');

      // 5. 显示原始数据中的所有赔率字段
      const rawData = (targetMatch as any).raw || {};
      const game = rawData.game || rawData;

      console.log('📦 原始数据中的所有字段:');
      console.log('-'.repeat(100));
      
      // 收集所有赔率相关字段
      const oddsFields: { [key: string]: any } = {};
      const allFields = Object.keys(game);
      
      // 分类显示
      const categories = {
        '让球盘 (Handicap)': /^(RATIO_RE|RATIO_R|IOR_REH|IOR_REC|IOR_RH|IOR_RC|STRONG|ratio_re|ratio_r|ior_reh|ior_rec|ior_rh|ior_rc|strong)/i,
        '让球盘备选 (A/B/C/D/E/F)': /^(RATIO_[A-F]R|IOR_[A-F]REH|IOR_[A-F]REC|ratio_[a-f]r|ior_[A-F]RH|ior_[A-F]RC)/i,
        '大小球 (Over/Under)': /^(RATIO_ROUO|RATIO_ROUU|RATIO_O|RATIO_U|IOR_ROUH|IOR_ROUC|IOR_OUH|IOR_OUC|ratio_rouo|ratio_rouu|ratio_o|ratio_u|ior_rouh|ior_rouc|ior_ouh|ior_ouc)/i,
        '大小球备选 (A/B/C/D/E/F)': /^(RATIO_[A-F]ROUO|RATIO_[A-F]ROUU|IOR_[A-F]ROUH|IOR_[A-F]ROUC|ratio_[a-f]rouo|ratio_[a-f]rouu|ior_[A-F]OUH|ior_[A-F]OUC)/i,
        '独赢 (Moneyline)': /^(IOR_RMH|IOR_RMN|IOR_RMC|IOR_MH|IOR_MN|IOR_MC|RATIO_MH|RATIO_MN|RATIO_MC|ior_rmh|ior_rmn|ior_rmc|ior_mh|ior_mn|ior_mc|ratio_mh|ratio_mn|ratio_mc)/i,
        '半场让球 (Half Handicap)': /^(RATIO_HRE|RATIO_HR|IOR_HREH|IOR_HREC|IOR_HRH|IOR_HRC|HSTRONG|ratio_hre|ratio_hr|hratio|ior_hreh|ior_hrec|ior_hrh|ior_hrc|hstrong)/i,
        '半场大小球 (Half O/U)': /^(RATIO_HROUO|RATIO_HROUU|RATIO_HO|RATIO_HU|IOR_HROUH|IOR_HROUC|IOR_HOUH|IOR_HOUC|ratio_hrouo|ratio_hrouu|ratio_ho|ratio_hu|ior_hrouh|ior_hrouc|ior_houh|ior_houc)/i,
        '半场独赢 (Half Moneyline)': /^(IOR_HMH|IOR_HMN|IOR_HMC|ior_hmh|ior_hmn|ior_hmc|ratio_hmh|ratio_hmn|ratio_hmc)/i,
        '开关标志 (Switches)': /^(sw_|SW_|gopen|GOPEN|hgopen|HGOPEN|hnike|HNIKE|ismaster|ISMASTER)/i,
        '其他元数据': /^(MORE|more|model|MODEL|gidm|GIDM|eventid|EVENTID)/i,
      };

      Object.entries(categories).forEach(([category, pattern]) => {
        const categoryFields = allFields.filter(f => pattern.test(f) && game[f] !== undefined && game[f] !== null && game[f] !== '');
        if (categoryFields.length > 0) {
          console.log(`\n${category}:`);
          categoryFields.forEach(field => {
            console.log(`  ${field.padEnd(20)} = ${game[field]}`);
          });
        }
      });

      console.log('');

      // 6. 显示解析后的赔率
      console.log('📊 解析后的赔率数据:');
      console.log('-'.repeat(100));
      console.log(JSON.stringify(targetMatch.markets, null, 2));
      console.log('');

      // 7. 详细分析每个盘口
      console.log('🔍 详细分析:');
      console.log('-'.repeat(100));

      // 分析全场让球盘
      if (targetMatch.markets?.full?.handicapLines && targetMatch.markets.full.handicapLines.length > 0) {
        console.log('\n✅ 全场让球盘:');
        targetMatch.markets.full.handicapLines.forEach((line: any, idx: number) => {
          console.log(`  盘口 ${idx + 1}:`);
          console.log(`    让球数: ${line.hdp}`);
          console.log(`    主队赔率: ${line.home}`);
          console.log(`    客队赔率: ${line.away}`);
          if (line.__meta || line.meta) {
            const meta = line.__meta || line.meta;
            console.log(`    元数据: isMaster=${meta.isMaster}, gopen=${meta.gopen}, hnike=${meta.hnike}, model=${meta.model}`);
          }
        });

        // 对比原始数据
        const strong = game.STRONG || game.strong;
        const ratioRE = game.RATIO_RE || game.ratio_re || game.RATIO_R || game.ratio_r || game.ratio;
        const iorREH = game.IOR_REH || game.ior_reh || game.IOR_RH || game.ior_rh;
        const iorREC = game.IOR_REC || game.ior_rec || game.IOR_RC || game.ior_rc;

        console.log(`\n  原始数据对比:`);
        console.log(`    STRONG: ${strong}`);
        console.log(`    RATIO_RE: ${ratioRE}`);
        console.log(`    IOR_REH (主队): ${iorREH}`);
        console.log(`    IOR_REC (客队): ${iorREC}`);

        if (strong && ratioRE) {
          const expectedHdp = strong.toUpperCase() === 'H' ? -parseFloat(ratioRE) : parseFloat(ratioRE);
          const actualHdp = targetMatch.markets.full.handicapLines[0].hdp;
          if (Math.abs(expectedHdp - actualHdp) > 0.01) {
            console.log(`    ⚠️  盘口方向可能有误: 期望 ${expectedHdp}, 实际 ${actualHdp}`);
          } else {
            console.log(`    ✅ 盘口方向正确`);
          }
        }
      } else {
        console.log('\n❌ 全场让球盘: 无数据');
      }

      // 分析全场大小球
      if (targetMatch.markets?.full?.overUnderLines && targetMatch.markets.full.overUnderLines.length > 0) {
        console.log('\n✅ 全场大小球:');
        targetMatch.markets.full.overUnderLines.forEach((line: any, idx: number) => {
          console.log(`  盘口 ${idx + 1}:`);
          console.log(`    总分: ${line.hdp}`);
          console.log(`    大球赔率: ${line.over}`);
          console.log(`    小球赔率: ${line.under}`);
          if (line.__meta || line.meta) {
            const meta = line.__meta || line.meta;
            console.log(`    元数据: isMaster=${meta.isMaster}, gopen=${meta.gopen}, hnike=${meta.hnike}, model=${meta.model}`);
          }
        });

        // 对比原始数据
        const ratioO = game.RATIO_ROUO || game.ratio_rouo || game.RATIO_ROUU || game.ratio_rouu || game.RATIO_O || game.ratio_o;
        const iorOUH = game.IOR_ROUH || game.ior_rouh || game.IOR_OUH || game.ior_ouh;
        const iorOUC = game.IOR_ROUC || game.ior_rouc || game.IOR_OUC || game.ior_ouc;

        console.log(`\n  原始数据对比:`);
        console.log(`    RATIO_O: ${ratioO}`);
        console.log(`    IOR_ROUH (小球): ${iorOUH}`);
        console.log(`    IOR_ROUC (大球): ${iorOUC}`);
        console.log(`    当前映射: IOR_ROUC -> Over, IOR_ROUH -> Under`);

        const parsedOver = targetMatch.markets.full.overUnderLines[0].over;
        const parsedUnder = targetMatch.markets.full.overUnderLines[0].under;
        
        if (iorOUC && parsedOver && Math.abs(parseFloat(iorOUC) - parsedOver) > 0.01) {
          console.log(`    ⚠️  大球赔率映射可能有误: 原始 ${iorOUC}, 解析 ${parsedOver}`);
        }
        if (iorOUH && parsedUnder && Math.abs(parseFloat(iorOUH) - parsedUnder) > 0.01) {
          console.log(`    ⚠️  小球赔率映射可能有误: 原始 ${iorOUH}, 解析 ${parsedUnder}`);
        }
        if (iorOUC && iorOUH && parsedOver === parseFloat(iorOUC) && parsedUnder === parseFloat(iorOUH)) {
          console.log(`    ✅ 大小球映射正确`);
        }
      } else {
        console.log('\n❌ 全场大小球: 无数据');
      }

      // 分析独赢
      if (targetMatch.markets?.moneyline) {
        console.log('\n✅ 独赢:');
        console.log(`    主队: ${targetMatch.markets.moneyline.home}`);
        console.log(`    平局: ${targetMatch.markets.moneyline.draw}`);
        console.log(`    客队: ${targetMatch.markets.moneyline.away}`);
      } else {
        console.log('\n❌ 独赢: 无数据');
      }

      // 8. 检查是否有更多盘口数据
      console.log('\n');
      console.log('📦 更多盘口数据:');
      console.log('-'.repeat(100));
      
      if (rawData.moreMarkets) {
        console.log('✅ 有更多盘口数据 (get_game_more)');
        console.log('原始数据片段:');
        console.log(JSON.stringify(rawData.moreMarkets, null, 2).substring(0, 1000) + '...');
      } else {
        console.log('⚠️  无更多盘口数据 (可能未启用 ENABLE_MORE_MARKETS)');
      }

      if (rawData.obtRaw) {
        console.log('\n✅ 有 OBT 盘口数据');
        console.log('原始数据片段:');
        console.log(rawData.obtRaw.substring(0, 500) + '...');
      } else {
        console.log('\n⚠️  无 OBT 盘口数据');
      }

      // 9. 保存完整数据
      const outputDir = path.join(__dirname, 'match-analysis-output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFile = path.join(outputDir, `match-${TARGET_GID}-${timestamp}.json`);
      
      fs.writeFileSync(outputFile, JSON.stringify({
        gid: targetMatch.gid,
        matchInfo: {
          league_zh: targetMatch.league_zh,
          league: targetMatch.league,
          home_zh: targetMatch.home_zh,
          home: targetMatch.home,
          away_zh: targetMatch.away_zh,
          away: targetMatch.away,
          match_time: targetMatch.match_time,
          showType: targetMatch.showType,
          live_status: targetMatch.live_status,
        },
        rawData: rawData,
        parsedMarkets: targetMatch.markets,
      }, null, 2), 'utf-8');

      console.log('\n');
      console.log('='.repeat(100));
      console.log(`💾 完整数据已保存到: ${outputFile}`);
      console.log('='.repeat(100));

      await scraper.logout();
      break;

    } catch (error: any) {
      console.error(`❌ 抓取失败:`, error.message);
      console.error(error.stack);
      await scraper.logout();
    }
  }

  if (!matchFound) {
    console.log('\n');
    console.log('='.repeat(100));
    console.log(`❌ 在所有账号中都未找到 GID=${TARGET_GID} 的赛事`);
    console.log('可能原因:');
    console.log('  1. 赛事已结束或被移除');
    console.log('  2. GID 不正确');
    console.log('  3. 赛事在不同的 showType 中（live/today/early）');
    console.log('='.repeat(100));
  }
}

// 运行脚本
fetchSpecificMatch().catch(error => {
  console.error('❌ 脚本异常:', error);
  process.exit(1);
});

