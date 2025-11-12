/**
 * 调试脚本：检查服务状态和内存数据
 */

const axios = require('axios');

async function checkServiceStatus() {
  console.log('='.repeat(60));
  console.log('🔍 检查服务状态');
  console.log('='.repeat(60));

  try {
    // 1. 检查服务是否运行
    console.log('\n1️⃣ 检查服务是否运行...');
    try {
      const statusRes = await axios.get('http://localhost:10089/api/status', { timeout: 5000 });
      console.log('✅ 服务正在运行');
      console.log('\n服务状态:');
      console.log(JSON.stringify(statusRes.data, null, 2));
    } catch (error) {
      console.log('❌ 服务未运行或无法访问');
      console.log('错误:', error.message);
      return;
    }

    // 2. 检查内存中的赛事数据
    console.log('\n2️⃣ 检查内存中的赛事数据...');
    
    // 检查 live 赛事
    try {
      const liveRes = await axios.get('http://localhost:10089/api/matches?showType=live', { timeout: 5000 });
      console.log(`\n✅ Live 赛事: ${liveRes.data.data?.length || 0} 场`);
      if (liveRes.data.data && liveRes.data.data.length > 0) {
        console.log('示例赛事:');
        const match = liveRes.data.data[0];
        console.log(`  ${match.league_zh} | ${match.home_zh} vs ${match.away_zh}`);
        console.log(`  时间: ${match.match_time}`);
        console.log(`  GID: ${match.gid}`);
      }
    } catch (error) {
      console.log('❌ 获取 live 赛事失败:', error.message);
    }

    // 检查 today 赛事
    try {
      const todayRes = await axios.get('http://localhost:10089/api/matches?showType=today', { timeout: 5000 });
      console.log(`\n✅ Today 赛事: ${todayRes.data.data?.length || 0} 场`);
      if (todayRes.data.data && todayRes.data.data.length > 0) {
        console.log('示例赛事:');
        const match = todayRes.data.data[0];
        console.log(`  ${match.league_zh} | ${match.home_zh} vs ${match.away_zh}`);
        console.log(`  时间: ${match.match_time}`);
        console.log(`  GID: ${match.gid}`);
      }
    } catch (error) {
      console.log('❌ 获取 today 赛事失败:', error.message);
    }

    // 检查 early 赛事
    try {
      const earlyRes = await axios.get('http://localhost:10089/api/matches?showType=early', { timeout: 5000 });
      console.log(`\n✅ Early 赛事: ${earlyRes.data.data?.length || 0} 场`);
      if (earlyRes.data.data && earlyRes.data.data.length > 0) {
        console.log('示例赛事:');
        const match = earlyRes.data.data[0];
        console.log(`  ${match.league_zh} | ${match.home_zh} vs ${match.away_zh}`);
        console.log(`  时间: ${match.match_time}`);
        console.log(`  GID: ${match.gid}`);
      }
    } catch (error) {
      console.log('❌ 获取 early 赛事失败:', error.message);
    }

    // 3. 诊断建议
    console.log('\n3️⃣ 诊断建议:');
    console.log('\n如果内存中有数据，但数据库中没有数据，说明:');
    console.log('  1. useDatabase 可能设置为 false');
    console.log('  2. 数据库保存逻辑可能有问题');
    console.log('  3. 数据库连接可能在抓取时断开');
    console.log('\n建议操作:');
    console.log('  1. 查看完整日志: pm2 logs crown-scraper --lines 200');
    console.log('  2. 搜索关键词: pm2 logs crown-scraper --lines 200 | grep -E "useDatabase|保存|数据库"');
    console.log('  3. 检查是否有错误: pm2 logs crown-scraper --err --lines 50');

  } catch (error) {
    console.error('\n❌ 检查失败:', error.message);
  }
}

// 运行检查
checkServiceStatus().catch(console.error);

