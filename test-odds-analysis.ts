/**
 * 赔率分析脚本
 * 用于抓取赔率并详细分析原始数据，找出赔率不一致的原因
 */

import { CrownScraper } from './src/scrapers/CrownScraper';
import { AccountConfig } from './src/types';
import * as fs from 'fs';
import * as path from 'path';

interface OddsAnalysis {
  gid: string;
  matchInfo: string;
  rawData: any;
  parsedOdds: any;
  issues: string[];
}

async function analyzeOdds() {
  console.log('='.repeat(80));
  console.log('🔍 赔率分析脚本');
  console.log('='.repeat(80));
  console.log('');

  // 使用滚球账号（数据更新快）
  const account: AccountConfig = {
    username: 'hg409606',
    password: 'U0YpS9Uv',
    showType: 'live',
    proxyUrl: 'socks5://233blog:233blog.com@47.243.157.106:51070',
  };

  const scraper = new CrownScraper(account);
  const analyses: OddsAnalysis[] = [];

  try {
    // 1. 登录
    console.log('📡 正在登录...');
    const loginSuccess = await scraper.login();
    if (!loginSuccess) {
      console.error('❌ 登录失败');
      return;
    }
    console.log('✅ 登录成功\n');

    // 2. 获取赛事列表
    console.log('📊 正在获取赛事列表...');
    const matches = await scraper.fetchMatches();
    console.log(`✅ 获取到 ${matches.length} 场赛事\n`);

    if (matches.length === 0) {
      console.log('⚠️  当前没有赛事');
      return;
    }

    // 3. 分析前 5 场赛事的赔率
    const samplesToAnalyze = Math.min(5, matches.length);
    console.log(`🔬 开始分析前 ${samplesToAnalyze} 场赛事的赔率...\n`);

    for (let i = 0; i < samplesToAnalyze; i++) {
      const match = matches[i];
      console.log('='.repeat(80));
      console.log(`📌 赛事 ${i + 1}/${samplesToAnalyze}`);
      console.log('='.repeat(80));
      console.log(`GID: ${match.gid}`);
      console.log(`赛事: ${match.home_zh} vs ${match.away_zh}`);
      console.log(`联赛: ${match.league_zh}`);
      console.log(`时间: ${match.match_time}`);
      console.log('');

      const analysis: OddsAnalysis = {
        gid: match.gid,
        matchInfo: `${match.home_zh} vs ${match.away_zh}`,
        rawData: (match as any).raw || {},
        parsedOdds: match.markets || {},
        issues: [],
      };

      // 分析原始数据
      const game = analysis.rawData.game || analysis.rawData;
      
      console.log('📋 原始赔率字段:');
      console.log('-'.repeat(80));

      // 检查让球盘
      const handicapFields = [
        'RATIO_RE', 'RATIO_R', 'ratio_re', 'ratio_r', 'ratio',
        'IOR_REH', 'IOR_RH', 'ior_reh', 'ior_rh',
        'IOR_REC', 'IOR_RC', 'ior_rec', 'ior_rc',
        'STRONG', 'strong',
      ];

      console.log('\n🎯 让球盘字段:');
      const foundHandicapFields: any = {};
      handicapFields.forEach(field => {
        if (game[field] !== undefined && game[field] !== null && game[field] !== '') {
          foundHandicapFields[field] = game[field];
          console.log(`  ${field}: ${game[field]}`);
        }
      });

      // 检查大小球
      const ouFields = [
        'RATIO_ROUO', 'RATIO_ROUU', 'ratio_rouo', 'ratio_rouu',
        'RATIO_O', 'RATIO_U', 'ratio_o', 'ratio_u',
        'IOR_ROUH', 'IOR_OUH', 'ior_rouh', 'ior_ouh',
        'IOR_ROUC', 'IOR_OUC', 'ior_rouc', 'ior_ouc',
      ];

      console.log('\n⚽ 大小球字段:');
      const foundOUFields: any = {};
      ouFields.forEach(field => {
        if (game[field] !== undefined && game[field] !== null && game[field] !== '') {
          foundOUFields[field] = game[field];
          console.log(`  ${field}: ${game[field]}`);
        }
      });

      // 检查独赢
      const moneylineFields = [
        'IOR_RMH', 'IOR_MH', 'ior_rmh', 'ior_mh', 'RATIO_MH', 'ratio_mh',
        'IOR_RMN', 'IOR_MN', 'ior_rmn', 'ior_mn', 'RATIO_MN', 'ratio_mn',
        'IOR_RMC', 'IOR_MC', 'ior_rmc', 'ior_mc', 'RATIO_MC', 'ratio_mc',
      ];

      console.log('\n💰 独赢字段:');
      const foundMoneylineFields: any = {};
      moneylineFields.forEach(field => {
        if (game[field] !== undefined && game[field] !== null && game[field] !== '') {
          foundMoneylineFields[field] = game[field];
          console.log(`  ${field}: ${game[field]}`);
        }
      });

      // 检查半场让球
      const halfHandicapFields = [
        'RATIO_HRE', 'RATIO_HR', 'ratio_hre', 'ratio_hr', 'hratio',
        'IOR_HREH', 'IOR_HRH', 'ior_hreh', 'ior_hrh',
        'IOR_HREC', 'IOR_HRC', 'ior_hrec', 'ior_hrc',
        'HSTRONG', 'hstrong',
      ];

      console.log('\n🎯 半场让球字段:');
      const foundHalfHandicapFields: any = {};
      halfHandicapFields.forEach(field => {
        if (game[field] !== undefined && game[field] !== null && game[field] !== '') {
          foundHalfHandicapFields[field] = game[field];
          console.log(`  ${field}: ${game[field]}`);
        }
      });

      // 检查半场大小球
      const halfOUFields = [
        'RATIO_HROUO', 'RATIO_HROUU', 'ratio_hrouo', 'ratio_hrouu',
        'RATIO_HO', 'RATIO_HU', 'ratio_ho', 'ratio_hu',
        'IOR_HROUH', 'IOR_HOUH', 'ior_hrouh', 'ior_houh',
        'IOR_HROUC', 'IOR_HOUC', 'ior_hrouc', 'ior_houc',
      ];

      console.log('\n⚽ 半场大小球字段:');
      const foundHalfOUFields: any = {};
      halfOUFields.forEach(field => {
        if (game[field] !== undefined && game[field] !== null && game[field] !== '') {
          foundHalfOUFields[field] = game[field];
          console.log(`  ${field}: ${game[field]}`);
        }
      });

      console.log('\n');
      console.log('📊 解析后的赔率:');
      console.log('-'.repeat(80));
      console.log(JSON.stringify(analysis.parsedOdds, null, 2));
      console.log('');

      // 分析潜在问题
      console.log('⚠️  潜在问题分析:');
      console.log('-'.repeat(80));

      // 问题1: 检查 STRONG 字段与盘口方向
      if (foundHandicapFields.STRONG || foundHandicapFields.strong) {
        const strong = foundHandicapFields.STRONG || foundHandicapFields.strong;
        const ratio = foundHandicapFields.RATIO_RE || foundHandicapFields.RATIO_R || 
                     foundHandicapFields.ratio_re || foundHandicapFields.ratio_r || 
                     foundHandicapFields.ratio;
        
        if (ratio) {
          const hasSign = /[+-]/.test(String(ratio));
          const issue = `STRONG=${strong}, RATIO=${ratio}, 原始值${hasSign ? '已包含' : '不包含'}正负号`;
          console.log(`  🔸 ${issue}`);
          analysis.issues.push(issue);

          // 检查解析后的盘口方向
          if (analysis.parsedOdds.full?.handicapLines?.length > 0) {
            const parsedHdp = analysis.parsedOdds.full.handicapLines[0].hdp;
            const expectedSign = strong.toUpperCase() === 'H' ? '负' : '正';
            const actualSign = parsedHdp < 0 ? '负' : '正';
            if (expectedSign !== actualSign && !hasSign) {
              const directionIssue = `盘口方向可能错误: STRONG=${strong} 期望${expectedSign}数，实际${actualSign}数 (${parsedHdp})`;
              console.log(`  ❌ ${directionIssue}`);
              analysis.issues.push(directionIssue);
            }
          }
        }
      }

      // 问题2: 检查大小球的 Over/Under 映射
      if (foundOUFields.IOR_ROUC || foundOUFields.IOR_OUC || foundOUFields.ior_rouc || foundOUFields.ior_ouc) {
        const rouc = foundOUFields.IOR_ROUC || foundOUFields.IOR_OUC || foundOUFields.ior_rouc || foundOUFields.ior_ouc;
        const rouh = foundOUFields.IOR_ROUH || foundOUFields.IOR_OUH || foundOUFields.ior_rouh || foundOUFields.ior_ouh;
        
        if (rouc && rouh) {
          const issue = `大小球映射: IOR_ROUC=${rouc} (当前映射为Over), IOR_ROUH=${rouh} (当前映射为Under)`;
          console.log(`  🔸 ${issue}`);
          analysis.issues.push(issue);

          // 通常大球赔率应该小于或接近小球赔率（如果盘口合理）
          const roucNum = parseFloat(rouc);
          const rouhNum = parseFloat(rouh);
          if (!isNaN(roucNum) && !isNaN(rouhNum)) {
            if (Math.abs(roucNum - rouhNum) > 0.3) {
              const mappingIssue = `大小球赔率差异较大: ${roucNum} vs ${rouhNum}，请人工确认映射是否正确`;
              console.log(`  ⚠️  ${mappingIssue}`);
              analysis.issues.push(mappingIssue);
            }
          }
        }
      }

      // 问题3: 检查是否有多盘口数据
      if ((match as any).raw?.moreMarkets) {
        console.log('  🔸 该赛事有更多盘口数据');
        analysis.issues.push('有更多盘口数据');
      }

      if ((match as any).raw?.obtRaw) {
        console.log('  🔸 该赛事有 OBT 盘口数据');
        analysis.issues.push('有 OBT 盘口数据');
      }

      // 问题4: 检查盘口数量
      const fullHandicapCount = analysis.parsedOdds.full?.handicapLines?.length || 0;
      const fullOUCount = analysis.parsedOdds.full?.overUnderLines?.length || 0;
      console.log(`  🔸 全场让球盘数量: ${fullHandicapCount}`);
      console.log(`  🔸 全场大小球盘数量: ${fullOUCount}`);

      if (fullHandicapCount === 0 && (foundHandicapFields.RATIO_RE || foundHandicapFields.ratio_re)) {
        const parseIssue = '有让球原始数据但解析后为空';
        console.log(`  ❌ ${parseIssue}`);
        analysis.issues.push(parseIssue);
      }

      if (fullOUCount === 0 && (foundOUFields.RATIO_ROUO || foundOUFields.ratio_rouo)) {
        const parseIssue = '有大小球原始数据但解析后为空';
        console.log(`  ❌ ${parseIssue}`);
        analysis.issues.push(parseIssue);
      }

      if (analysis.issues.length === 0) {
        console.log('  ✅ 未发现明显问题');
      }

      console.log('');
      analyses.push(analysis);

      // 等待一下避免请求过快
      if (i < samplesToAnalyze - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 4. 保存详细分析结果
    const outputDir = path.join(__dirname, 'odds-analysis-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `odds-analysis-${timestamp}.json`);
    
    fs.writeFileSync(outputFile, JSON.stringify(analyses, null, 2), 'utf-8');
    console.log('='.repeat(80));
    console.log(`💾 详细分析结果已保存到: ${outputFile}`);
    console.log('='.repeat(80));
    console.log('');

    // 5. 总结
    console.log('📈 分析总结:');
    console.log('-'.repeat(80));
    const totalIssues = analyses.reduce((sum, a) => sum + a.issues.length, 0);
    console.log(`总共分析: ${analyses.length} 场赛事`);
    console.log(`发现问题: ${totalIssues} 个`);
    console.log('');

    const issueTypes: { [key: string]: number } = {};
    analyses.forEach(a => {
      a.issues.forEach(issue => {
        const type = issue.split(':')[0];
        issueTypes[type] = (issueTypes[type] || 0) + 1;
      });
    });

    if (Object.keys(issueTypes).length > 0) {
      console.log('问题分类:');
      Object.entries(issueTypes).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count} 次`);
      });
    }

    console.log('');
    console.log('✅ 分析完成！');

  } catch (error: any) {
    console.error('❌ 分析失败:', error.message);
    console.error(error.stack);
  } finally {
    await scraper.logout();
  }
}

// 运行分析
analyzeOdds().catch(error => {
  console.error('❌ 脚本异常:', error);
  process.exit(1);
});

