/**
 * 测试 iSportsAPI 原始数据
 * 直接调用 iSportsAPI 查看返回的原始数据
 */

const axios = require('axios');
require('dotenv').config();

async function testISportsRaw() {
  try {
    const apiKey = process.env.ISPORTS_API_KEY;
    
    if (!apiKey) {
      console.error('❌ 请在 .env 文件中设置 ISPORTS_API_KEY');
      return;
    }

    console.log('正在调用 iSportsAPI /football/odds/main...\n');
    
    const response = await axios.get('http://api.isportsapi.com/sport/football/odds/main', {
      params: {
        api_key: apiKey,
        companyId: 3, // 皇冠 Company ID
      },
    });

    if (response.data.code !== 0) {
      console.error('❌ API 返回错误:', response.data);
      return;
    }

    const data = response.data.data || {};

    console.log('✅ API 调用成功\n');
    console.log('📊 数据统计:');
    console.log(`   handicap 数组长度: ${data.handicap?.length || 0}`);
    console.log(`   overUnder 数组长度: ${data.overUnder?.length || 0}`);
    console.log(`   europeOdds 数组长度: ${data.europeOdds?.length || 0}`);

    // 分析 handicap 数据
    if (data.handicap && data.handicap.length > 0) {
      console.log('\n📋 handicap 数据示例（前 10 条）:');
      console.log('格式: matchId,companyId,instantHandicap,instantHome,instantAway,maintenance,inPlay,handicapIndex,changeTime,close\n');
      
      const handicapByMatch = new Map();
      
      data.handicap.slice(0, 50).forEach((line, index) => {
        const parts = line.split(',');
        const matchId = parts[0];
        const companyId = parts[1];
        const handicapIndex = parts[7];
        
        if (!handicapByMatch.has(matchId)) {
          handicapByMatch.set(matchId, []);
        }
        handicapByMatch.get(matchId).push({
          line,
          handicapIndex: parseInt(handicapIndex) || 1,
        });
        
        if (index < 10) {
          console.log(`${index + 1}. ${line}`);
          console.log(`   matchId: ${matchId}, companyId: ${companyId}, handicapIndex: ${handicapIndex}`);
        }
      });

      // 查找有多盘口的赛事
      console.log('\n🔍 查找有多盘口的赛事:');
      let multiHandicapCount = 0;
      for (const [matchId, lines] of handicapByMatch.entries()) {
        if (lines.length > 1) {
          multiHandicapCount++;
          if (multiHandicapCount <= 3) {
            console.log(`\n   赛事 ${matchId} 有 ${lines.length} 个让球盘:`);
            lines.forEach((item, i) => {
              console.log(`     ${i + 1}. handicapIndex=${item.handicapIndex}: ${item.line}`);
            });
          }
        }
      }
      
      if (multiHandicapCount === 0) {
        console.log('   ⚠️  没有发现多盘口数据！');
        console.log('   说明: iSportsAPI /football/odds/main 端点可能只返回主盘数据');
        console.log('   建议: 查看 iSportsAPI 文档，是否需要使用其他端点获取多盘口数据');
      } else {
        console.log(`\n   ✅ 找到 ${multiHandicapCount} 场赛事有多盘口数据`);
      }
    }

    // 分析 overUnder 数据
    if (data.overUnder && data.overUnder.length > 0) {
      console.log('\n\n📋 overUnder 数据示例（前 10 条）:');
      console.log('格式: matchId,companyId,instantHandicap,instantOver,instantUnder,handicapIndex,changeTime,close\n');
      
      const overUnderByMatch = new Map();
      
      data.overUnder.slice(0, 50).forEach((line, index) => {
        const parts = line.split(',');
        const matchId = parts[0];
        const companyId = parts[1];
        const handicapIndex = parts[5];
        
        if (!overUnderByMatch.has(matchId)) {
          overUnderByMatch.set(matchId, []);
        }
        overUnderByMatch.get(matchId).push({
          line,
          handicapIndex: parseInt(handicapIndex) || 1,
        });
        
        if (index < 10) {
          console.log(`${index + 1}. ${line}`);
          console.log(`   matchId: ${matchId}, companyId: ${companyId}, handicapIndex: ${handicapIndex}`);
        }
      });

      // 查找有多盘口的赛事
      console.log('\n🔍 查找有多大小球盘口的赛事:');
      let multiTotalsCount = 0;
      for (const [matchId, lines] of overUnderByMatch.entries()) {
        if (lines.length > 1) {
          multiTotalsCount++;
          if (multiTotalsCount <= 3) {
            console.log(`\n   赛事 ${matchId} 有 ${lines.length} 个大小球盘:`);
            lines.forEach((item, i) => {
              console.log(`     ${i + 1}. handicapIndex=${item.handicapIndex}: ${item.line}`);
            });
          }
        }
      }
      
      if (multiTotalsCount === 0) {
        console.log('   ⚠️  没有发现多盘口数据！');
        console.log('   说明: iSportsAPI /football/odds/main 端点可能只返回主盘数据');
      } else {
        console.log(`\n   ✅ 找到 ${multiTotalsCount} 场赛事有多大小球盘口数据`);
      }
    }

    console.log('\n\n💡 提示:');
    console.log('   如果没有发现多盘口数据，可能的原因:');
    console.log('   1. /football/odds/main 端点只返回主盘（handicapIndex=1）');
    console.log('   2. 需要使用 /football/odds/changes 端点获取所有盘口');
    console.log('   3. 皇冠（Company ID=3）可能不提供多盘口数据');
    console.log('   4. 当前时间段没有多盘口数据');
    console.log('\n   请查看 iSportsAPI 官方文档确认正确的 API 端点和参数');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行测试
testISportsRaw();

