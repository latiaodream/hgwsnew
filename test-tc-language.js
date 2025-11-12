/**
 * 测试繁体中文语言包 API
 */

const axios = require('axios');

const apiKey = process.env.ISPORTS_API_KEY || 'GvpziueL9ouzIJNj';
const baseUrl = 'http://api.isportsapi.com/sport';

async function testTraditionalChinese() {
  try {
    console.log('🔍 测试繁体中文语言包 API...\n');
    
    const response = await axios.get(`${baseUrl}/languagetc`, {
      params: {
        api_key: apiKey,
        sport: 'football',
      },
    });

    console.log('✅ API 响应状态:', response.status);
    console.log('✅ API 响应 code:', response.data.code);
    console.log('✅ API 响应 message:', response.data.message);
    console.log('\n📊 数据结构:');
    
    if (response.data?.data && response.data.data.length > 0) {
      const data = response.data.data[0];
      console.log('- 顶层字段:', Object.keys(data));
      
      // 检查 leagues
      if (data.leagues) {
        console.log(`\n✅ leagues 字段存在，共 ${data.leagues.length} 个联赛`);
        console.log('前 5 个联赛示例:');
        data.leagues.slice(0, 5).forEach((league, index) => {
          console.log(`  ${index + 1}. leagueId: ${league.leagueId}, name_tc: ${league.name_tc}`);
        });
      } else {
        console.log('\n❌ leagues 字段不存在');
      }
      
      // 检查 teams
      if (data.teams) {
        console.log(`\n✅ teams 字段存在，共 ${data.teams.length} 个球队`);
        console.log('前 5 个球队示例:');
        data.teams.slice(0, 5).forEach((team, index) => {
          console.log(`  ${index + 1}. teamId: ${team.teamId}, name_tc: ${team.name_tc}`);
        });
      } else {
        console.log('\n❌ teams 字段不存在');
      }
      
      // 检查其他可能的字段
      const otherFields = Object.keys(data).filter(key => key !== 'leagues' && key !== 'teams');
      if (otherFields.length > 0) {
        console.log('\n📋 其他字段:', otherFields);
        otherFields.forEach(field => {
          if (Array.isArray(data[field])) {
            console.log(`  - ${field}: 数组，长度 ${data[field].length}`);
            if (data[field].length > 0) {
              console.log(`    示例: ${JSON.stringify(data[field][0])}`);
            }
          } else {
            console.log(`  - ${field}: ${typeof data[field]}`);
          }
        });
      }
      
    } else {
      console.log('❌ 没有数据返回');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 同时测试一个实际的赛事，看看 league_id 的格式
async function testMatchData() {
  try {
    console.log('\n\n🔍 测试实际赛事数据...\n');
    
    const response = await axios.get(`${baseUrl}/football/odds/main`, {
      params: {
        api_key: apiKey,
        companyId: 3, // 皇冠
      },
    });

    if (response.data.code === 0 && response.data.data) {
      const data = response.data.data;
      
      // 获取第一个赛事的 matchId
      let firstMatchId = null;
      if (data.handicap && data.handicap.length > 0) {
        firstMatchId = data.handicap[0].split(',')[0];
      }
      
      if (firstMatchId) {
        console.log(`✅ 找到赛事 ID: ${firstMatchId}`);
        
        // 获取赛事详情
        const detailResponse = await axios.get(`${baseUrl}/football/match/detail`, {
          params: {
            api_key: apiKey,
            matchId: firstMatchId,
          },
        });
        
        if (detailResponse.data.code === 0 && detailResponse.data.data) {
          const match = detailResponse.data.data[0];
          console.log('\n📋 赛事详情:');
          console.log(`  - matchId: ${match.matchId}`);
          console.log(`  - leagueId: ${match.leagueId}`);
          console.log(`  - leagueName: ${match.leagueName}`);
          console.log(`  - homeId: ${match.homeId}`);
          console.log(`  - homeName: ${match.homeName}`);
          console.log(`  - awayId: ${match.awayId}`);
          console.log(`  - awayName: ${match.awayName}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
(async () => {
  await testTraditionalChinese();
  await testMatchData();
})();

