/**
 * 测试皇冠历史赛事抓取
 * 在服务器上运行：node test-history-dates.js
 */

const { CrownScraper } = require('./dist/scrapers/CrownScraper');
const logger = require('./dist/utils/logger').default;
const fs = require('fs');

async function testHistoryDates() {
  // 优先级：命令行参数 > config.json > 环境变量 > 默认值
  let account;

  // 1. 尝试从命令行参数读取
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    account = {
      username: args[0],
      password: args[1],
      showType: 'early',
    };
    logger.info(`使用命令行参数账号: ${account.username}`);
  }
  // 2. 尝试从 config.json 读取
  else {
    try {
      const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
      account = config.accounts.find(a => a.showType === 'early');
      if (account) {
        logger.info(`从 config.json 读取账号: ${account.username}`);
      }
    } catch (error) {
      // 忽略错误，继续尝试其他方式
    }
  }

  // 3. 尝试从环境变量读取
  if (!account && process.env.CROWN_USERNAME && process.env.CROWN_PASSWORD) {
    account = {
      username: process.env.CROWN_USERNAME,
      password: process.env.CROWN_PASSWORD,
      showType: 'early',
    };
    logger.info(`从环境变量读取账号: ${account.username}`);
  }

  // 4. 使用默认测试账号
  if (!account) {
    logger.error('未找到账号信息！');
    logger.error('请使用以下方式之一提供账号：');
    logger.error('  1. 命令行参数: node test-history-dates.js <username> <password>');
    logger.error('  2. 环境变量: CROWN_USERNAME=xxx CROWN_PASSWORD=xxx node test-history-dates.js');
    logger.error('  3. 创建 config.json 文件');
    return;
  }

  logger.info(`使用账号: ${account.username}`);
  
  const scraper = new CrownScraper(account);

  try {
    // 登录
    logger.info('开始登录...');
    const loginSuccess = await scraper.login();
    if (!loginSuccess) {
      logger.error('登录失败');
      return;
    }

    logger.info('✅ 登录成功！');

    // 测试不同的日期格式
    const testDates = [
      { date: '', desc: '默认（当前）' },
      { date: '2024-11-05', desc: '一周前（11月5日）' },
      { date: '2024-11-01', desc: '本月初（11月1日）' },
      { date: '2024-11-12', desc: '今天（11月12日）' },
      { date: '2024-11-13', desc: '明天（11月13日）' },
      { date: '2024-11-20', desc: '下周（11月20日）' },
      { date: '11-05', desc: '短格式：11-05' },
      { date: '11/05', desc: '斜杠格式：11/05' },
    ];

    for (const { date, desc } of testDates) {
      console.log('\n' + '='.repeat(70));
      logger.info(`测试日期: ${desc} (参数: "${date}")`);
      console.log('='.repeat(70));

      try {
        const matches = await scraper.fetchMatches(date);
        logger.info(`✅ 抓取到 ${matches.length} 场赛事`);

        if (matches.length > 0) {
          logger.info('前 5 场赛事:');
          matches.slice(0, 5).forEach((match, index) => {
            logger.info(`  ${index + 1}. ${match.league_zh}: ${match.home_team_zh} vs ${match.away_team_zh}`);
            logger.info(`     时间: ${match.match_time}`);
          });
        } else {
          logger.warn('⚠️ 没有抓取到赛事');
        }
      } catch (error) {
        logger.error(`❌ 抓取失败: ${error.message}`);
      }

      // 等待 3 秒避免请求过快
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 登出
    await scraper.logout();
    logger.info('\n✅ 测试完成！');

  } catch (error) {
    logger.error('❌ 测试失败:', error.message);
    logger.error(error.stack);
  }
}

testHistoryDates();

