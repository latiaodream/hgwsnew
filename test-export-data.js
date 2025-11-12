/**
 * 测试导出数据
 * 检查第三方 API 是否有数据
 */

const axios = require('axios');

async function testExportData() {
  try {
    console.log('🧪 测试导出数据\n');
    console.log('='.repeat(60));

    // 测试 iSports 数据
    console.log('\n1️⃣ 测试 iSports 数据:');
    const isportsRes = await axios.get('http://localhost:10089/api/thirdparty/isports');
    const isportsData = isportsRes.data;
    
    if (isportsData.success) {
      console.log(`   ✅ iSports 数据: ${isportsData.data.length} 场赛事`);
      
      if (isportsData.data.length > 0) {
        const match = isportsData.data[0];
        console.log(`   示例赛事:`);
        console.log(`     主队: ${match.team_home_en} (${match.team_home_cn})`);
        console.log(`     客队: ${match.team_away_en} (${match.team_away_cn})`);
        console.log(`     联赛: ${match.league_name_en} (${match.league_name_cn})`);
      }
    } else {
      console.log(`   ❌ iSports 数据获取失败: ${isportsData.error}`);
    }

    // 测试 Odds-API 数据
    console.log('\n2️⃣ 测试 Odds-API 数据:');
    const oddsapiRes = await axios.get('http://localhost:10089/api/thirdparty/odds-api');
    const oddsapiData = oddsapiRes.data;
    
    if (oddsapiData.success) {
      console.log(`   ✅ Odds-API 数据: ${oddsapiData.data.length} 场赛事`);
      
      if (oddsapiData.data.length > 0) {
        const match = oddsapiData.data[0];
        console.log(`   示例赛事:`);
        console.log(`     主队: ${match.team_home_en} (${match.team_home_cn})`);
        console.log(`     客队: ${match.team_away_en} (${match.team_away_cn})`);
        console.log(`     联赛: ${match.league_name_en} (${match.league_name_cn})`);
      }
    } else {
      console.log(`   ❌ Odds-API 数据获取失败: ${oddsapiData.error}`);
    }

    // 测试导出球队
    console.log('\n3️⃣ 测试导出球队数据:');
    const teamsRes = await axios.get('http://localhost:10089/api/thirdparty/export-teams');
    const teamsData = teamsRes.data;
    
    if (teamsData.success) {
      console.log(`   ✅ 球队数据: ${teamsData.count} 个球队`);
      
      if (teamsData.data.length > 0) {
        console.log(`   前 5 个球队:`);
        teamsData.data.slice(0, 5).forEach((team, i) => {
          console.log(`     ${i + 1}. ${team.isports_en} (${team.isports_cn}) -> ${team.crown_cn || '(空)'}`);
        });
      }
    } else {
      console.log(`   ❌ 球队数据获取失败: ${teamsData.error}`);
    }

    // 测试导出联赛
    console.log('\n4️⃣ 测试导出联赛数据:');
    const leaguesRes = await axios.get('http://localhost:10089/api/thirdparty/export-leagues');
    const leaguesData = leaguesRes.data;
    
    if (leaguesData.success) {
      console.log(`   ✅ 联赛数据: ${leaguesData.count} 个联赛`);
      
      if (leaguesData.data.length > 0) {
        console.log(`   前 5 个联赛:`);
        leaguesData.data.slice(0, 5).forEach((league, i) => {
          console.log(`     ${i + 1}. ${league.isports_en} (${league.isports_cn}) -> ${league.crown_cn || '(空)'}`);
        });
      }
    } else {
      console.log(`   ❌ 联赛数据获取失败: ${leaguesData.error}`);
    }

    // 测试导出 Excel
    console.log('\n5️⃣ 测试导出 Excel:');
    try {
      const excelRes = await axios.get('http://localhost:10089/api/thirdparty/export-teams-excel', {
        responseType: 'arraybuffer',
      });
      
      console.log(`   ✅ Excel 文件大小: ${excelRes.data.length} 字节`);
      console.log(`   Content-Type: ${excelRes.headers['content-type']}`);
      
      if (excelRes.data.length === 0) {
        console.log(`   ⚠️  警告: Excel 文件为空！`);
      }
    } catch (error) {
      console.log(`   ❌ Excel 导出失败: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n💡 诊断结果:');
    
    const totalMatches = (isportsData.success ? isportsData.data.length : 0) + 
                        (oddsapiData.success ? oddsapiData.data.length : 0);
    
    if (totalMatches === 0) {
      console.log('❌ 问题: 第三方 API 没有数据');
      console.log('   解决方案:');
      console.log('   1. 检查 iSportsAPI 和 Odds-API 是否正常工作');
      console.log('   2. 检查 API 密钥是否正确');
      console.log('   3. 等待数据抓取完成');
    } else if (teamsData.success && teamsData.count === 0) {
      console.log('❌ 问题: 有赛事数据但没有球队数据');
      console.log('   解决方案: 检查数据解析逻辑');
    } else if (teamsData.success && teamsData.count > 0) {
      console.log('✅ 数据正常，可以导出和导入');
      console.log(`   球队数量: ${teamsData.count}`);
      console.log(`   联赛数量: ${leaguesData.count}`);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', error.response.data);
    }
  }
}

testExportData();

