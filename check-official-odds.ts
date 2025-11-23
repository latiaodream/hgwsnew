/**
 * 直接查看官网赔率，对比抓取的数据
 */

import axios from 'axios';
import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config();

const TARGET_GID = '8294765';

async function checkOfficialOdds() {
  console.log('='.repeat(100));
  console.log('🌐 查看官网实际赔率');
  console.log('='.repeat(100));
  console.log(`目标 GID: ${TARGET_GID}`);
  console.log('');

  // 创建 axios 客户端
  const client = axios.create({
    timeout: 30000,
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });

  const baseUrls = [
    'https://hga026.com',
    'https://hga027.com',
    'https://hga035.com',
    'https://hga050.com',
  ];

  console.log('📡 尝试访问官网...\n');

  for (const baseUrl of baseUrls) {
    try {
      console.log(`尝试: ${baseUrl}`);
      
      // 先访问首页看看能否连接
      const homeResponse = await client.get(baseUrl, {
        maxRedirects: 5,
        validateStatus: () => true,
      });

      console.log(`  状态码: ${homeResponse.status}`);
      console.log(`  响应长度: ${homeResponse.data?.length || 0} 字节`);

      if (homeResponse.status === 200) {
        console.log(`  ✅ ${baseUrl} 可访问`);
        
        // 尝试访问滚球页面
        const liveUrl = `${baseUrl}/app/member/FT_browse/index.php?rtype=rb&langx=zh-cn`;
        console.log(`\n  尝试访问滚球页面: ${liveUrl}`);
        
        const liveResponse = await client.get(liveUrl, {
          maxRedirects: 5,
          validateStatus: () => true,
        });

        console.log(`  滚球页面状态码: ${liveResponse.status}`);
        
        if (liveResponse.status === 200) {
          const html = liveResponse.data;
          
          // 检查是否需要登录
          if (html.includes('login') || html.includes('登录') || html.includes('登入')) {
            console.log(`  ⚠️  需要登录才能查看`);
          } else {
            console.log(`  ✅ 可以访问滚球页面`);
            
            // 查找 GID
            if (html.includes(TARGET_GID)) {
              console.log(`  🎯 找到目标赛事 GID: ${TARGET_GID}`);
              
              // 尝试提取赔率信息（简单的文本搜索）
              const lines = html.split('\n');
              const relevantLines: string[] = [];
              
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(TARGET_GID)) {
                  // 收集前后各 5 行
                  for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 6); j++) {
                    relevantLines.push(lines[j]);
                  }
                }
              }
              
              console.log(`\n  相关 HTML 片段:`);
              console.log('  ' + '-'.repeat(90));
              relevantLines.slice(0, 20).forEach(line => {
                const trimmed = line.trim();
                if (trimmed) {
                  console.log(`  ${trimmed.substring(0, 100)}`);
                }
              });
            } else {
              console.log(`  ⚠️  未找到 GID: ${TARGET_GID}`);
            }
          }
        }
        
        break;
      } else {
        console.log(`  ❌ 无法访问 (状态码: ${homeResponse.status})`);
      }
      
    } catch (error: any) {
      console.log(`  ❌ 访问失败: ${error.message}`);
    }
    
    console.log('');
  }

  console.log('='.repeat(100));
  console.log('💡 提示:');
  console.log('  由于皇冠网站需要登录才能查看赔率，我们无法直接从官网抓取。');
  console.log('  但是我们可以对比以下数据源:');
  console.log('');
  console.log('  1. get_game_list 返回的数据 (主盘口):');
  console.log('     - RATIO_RE: 0');
  console.log('     - IOR_REH: 1.040 (主队)');
  console.log('     - IOR_REC: 0.850 (客队)');
  console.log('');
  console.log('  2. get_game_more 返回的数据 (更多盘口):');
  console.log('     - ratio_re: 0');
  console.log('     - ior_REH: 0.960 (主队)');
  console.log('     - ior_REC: 0.930 (客队)');
  console.log('');
  console.log('  3. 当前解析结果:');
  console.log('     - hdp: 0');
  console.log('     - home: 0.96 (使用了 get_game_more 的值)');
  console.log('     - away: 0.93 (使用了 get_game_more 的值)');
  console.log('');
  console.log('  问题: get_game_more 的数据覆盖了 get_game_list 的主盘口数据！');
  console.log('='.repeat(100));
}

checkOfficialOdds().catch(error => {
  console.error('❌ 脚本异常:', error);
  process.exit(1);
});

