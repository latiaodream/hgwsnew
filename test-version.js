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
    });
    
    console.log(`状态码: ${resp.status}`);
    console.log(`响应长度: ${resp.data.length} 字符`);
    
    const html = resp.data || '';
    const m1 = html.match(/top\.ver\s*=\s*'([^']+)'/);
    const m2 = m1 ? null : html.match(/ver=([^&"']+)/);
    const ver = (m1?.[1] || m2?.[1])?.trim();
    
    if (ver) {
      console.log(`✅ 成功获取版本号: ${ver}`);
    } else {
      console.log(`❌ 未找到版本号`);
      console.log(`HTML 前 500 字符:`);
      console.log(html.substring(0, 500));
    }
  } catch (e) {
    console.error(`❌ 请求失败: ${e.message}`);
  }
}

testGetVersion();

