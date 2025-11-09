const axios = require('axios');
const https = require('https');

async function testGetVersion() {
  const url = 'https://hga026.com/';
  const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
  
  console.log(`正在访问: ${url}`);
  
  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      timeout: 15000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      validateStatus: (s) => s >= 200 && s < 500,
      maxRedirects: 5,
    });
    
    console.log(`状态码: ${resp.status}`);
    console.log(`最终 URL: ${resp.request.res.responseUrl || url}`);
    console.log(`响应长度: ${resp.data.length} 字符`);
    
    const html = resp.data || '';
    
    // 保存完整 HTML 到文件
    const fs = require('fs');
    fs.writeFileSync('response.html', html);
    console.log(`完整 HTML 已保存到 response.html`);
    
    // 尝试多种模式匹配
    const patterns = [
      /top\.ver\s*=\s*'([^']+)'/,
      /top\.ver\s*=\s*"([^"]+)"/,
      /ver\s*=\s*'([^']+)'/,
      /ver\s*=\s*"([^"]+)"/,
      /ver=([^&"'\s]+)/,
      /version\s*=\s*'([^']+)'/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        console.log(`✅ 找到版本号 (模式: ${pattern}): ${match[1]}`);
        return;
      }
    }
    
    console.log(`❌ 未找到版本号`);
    console.log(`\nHTML 内容:`);
    console.log(html);
  } catch (e) {
    console.error(`❌ 请求失败: ${e.message}`);
    if (e.response) {
      console.error(`响应状态: ${e.response.status}`);
      console.error(`响应头:`, e.response.headers);
    }
  }
}

testGetVersion();

