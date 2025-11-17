const axios = require('axios');
const https = require('https');
const xml2js = require('xml2js');

async function testLogin() {
  const baseUrl = 'https://hga027.com';
  const username = 'WjeLaA68i0';
  const password = 'I0FQsaTFFUHg';
  const version = '2025-10-16-fix342_120'; // 使用默认版本号
  
  const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
  const encodedUA = Buffer.from(userAgent).toString('base64');
  
  const client = axios.create({
    baseURL: baseUrl,
    timeout: 30000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Origin': baseUrl,
      'Referer': `${baseUrl}/`,
    },
  });
  
  console.log(`尝试登录: ${username}`);
  console.log(`使用版本号: ${version}`);
  console.log(`基础 URL: ${baseUrl}`);
  
  try {
    // 先访问首页获取 Cookie
    console.log(`\n1. 访问首页...`);
    try {
      const homeRes = await client.get('/');
      console.log(`✅ 首页访问成功`);
      console.log('首页 set-cookie:', homeRes.headers['set-cookie']);
    } catch (e) {
      console.log(`⚠️ 首页访问失败: ${e.message}`);
    }

    // 尝试登录
    console.log(`\n2. 尝试登录...`);
    const params = new URLSearchParams({
      p: 'chk_login',
      langx: 'zh-tw',
      ver: version,
      username: username,
      password: password,
      app: 'N',
      auto: 'CFHFID',
      blackbox: 'test_blackbox',
      userAgent: encodedUA,
    });
    
    const url = `/transform.php?ver=${version}`;
    console.log(`POST ${baseUrl}${url}`);
    console.log(`参数:`, params.toString());
    
    const response = await client.post(url, params.toString());

    console.log(`\n✅ 响应状态: ${response.status}`);
    console.log(`响应头 set-cookie:`, response.headers['set-cookie']);
    console.log(`响应数据:`, response.data);

    // 解析 XML（当前返回的是 HTML，这里先不解析，方便看原始内容）
    // const parser = new xml2js.Parser({ explicitArray: false });
    // const result = await parser.parseStringPromise(response.data);
    // console.log(`\n解析后的数据:`, JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(`\n❌ 登录失败:`);
    console.error(`错误信息: ${error.message}`);
    if (error.response) {
      console.error(`响应状态: ${error.response.status}`);
      console.error(`响应数据:`, error.response.data);
    }
  }
}

testLogin();

