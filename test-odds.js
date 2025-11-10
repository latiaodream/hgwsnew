/**
 * 测试赔率解析
 * 用于验证不同字段名格式的赔率数据是否能正确解析
 */

// 模拟不同格式的赛事数据
const testCases = [
  {
    name: '格式1：IOR_ 前缀（滚球）',
    game: {
      GID: '3001234',
      TEAM_H: '曼联',
      TEAM_C: '利物浦',
      IOR_RMH: '2.10',
      IOR_RMN: '3.20',
      IOR_RMC: '3.50',
      RATIO_RE: '0.5',
      IOR_REH: '0.95',
      IOR_REC: '0.90',
      RATIO_ROUO: '2.5',
      IOR_ROUC: '0.88',
      IOR_ROUH: '0.97',
      RATIO_HRE: '0.25',
      IOR_HREH: '1.00',
      IOR_HREC: '0.85',
      RATIO_HROUO: '1.5',
      IOR_HROUC: '0.92',
      IOR_HROUH: '0.93',
    },
  },
  {
    name: '格式2：RATIO_ 前缀（今日/早盘）',
    game: {
      GID: '3001235',
      TEAM_H: '巴萨',
      TEAM_C: '皇马',
      RATIO_MH: '2.20',
      RATIO_MN: '3.10',
      RATIO_MC: '3.40',
      RATIO_R: '0.75',
      RATIO_RH: '0.98',
      RATIO_RC: '0.87',
      RATIO_O: '3.0',
      RATIO_OUH: '0.95',
      RATIO_OUC: '0.90',
      RATIO_HR: '0.5',
      RATIO_HRH: '0.96',
      RATIO_HRC: '0.89',
      RATIO_HO: '1.75',
      RATIO_HOUH: '0.94',
      RATIO_HOUC: '0.91',
    },
  },
  {
    name: '格式3：混合格式',
    game: {
      GID: '3001236',
      TEAM_H: '拜仁',
      TEAM_C: '多特',
      IOR_MH: '1.80',
      RATIO_MN: '3.50',
      IOR_RMC: '4.20',
      STRONG: '1.0',
      IOR_RH: '0.92',
      RATIO_RC: '0.93',
      RATIO_OUO: '2.75',
      IOR_OUC: '0.89',
      RATIO_OUH: '0.96',
    },
  },
  {
    name: '格式4：部分字段缺失',
    game: {
      GID: '3001237',
      TEAM_H: '尤文',
      TEAM_C: 'AC米兰',
      IOR_RMH: '2.50',
      IOR_RMC: '2.80',
      // 缺少平局赔率
      RATIO_RE: '0.25',
      IOR_REH: '0.94',
      IOR_REC: '0.91',
      // 缺少大小球
    },
  },
];

// 模拟 parseOdds 函数
function parseOdds(game) {
  const pick = (keys) => {
    for (const key of keys) {
      if (game[key] !== undefined && game[key] !== null && game[key] !== '') {
        return game[key];
      }
    }
    return undefined;
  };

  const parseOddsValue = (value) => {
    if (!value) return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  };

  const parseHandicap = (value) => {
    if (!value || value === '-') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const markets = {};

  // 独赢
  const mh = pick(['IOR_RMH', 'IOR_MH', 'RATIO_MH']);
  const mn = pick(['IOR_RMN', 'IOR_MN', 'RATIO_MN', 'IOR_RMD']);
  const mc = pick(['IOR_RMC', 'IOR_MC', 'RATIO_MC']);

  if (mh || mn || mc) {
    markets.moneyline = {
      home: parseOddsValue(mh),
      draw: parseOddsValue(mn),
      away: parseOddsValue(mc),
    };
  }

  // 全场让球和大小球
  markets.full = {
    handicapLines: [],
    overUnderLines: [],
  };

  // 全场让球
  const ratioR = pick(['RATIO_RE', 'RATIO_R', 'STRONG']);
  const ratioRH = pick(['IOR_REH', 'IOR_RH', 'RATIO_RH']);
  const ratioRC = pick(['IOR_REC', 'IOR_RC', 'RATIO_RC']);

  if (ratioR || ratioRH || ratioRC) {
    const hdp = parseHandicap(ratioR);
    if (hdp !== null) {
      markets.full.handicapLines.push({
        hdp,
        home: parseOddsValue(ratioRH) || 0,
        away: parseOddsValue(ratioRC) || 0,
      });
    }
  }

  // 全场大小球
  const ratioO = pick(['RATIO_ROUO', 'RATIO_OUO', 'RATIO_O']);
  const ratioOUH = pick(['IOR_ROUH', 'IOR_OUH', 'RATIO_OUH']);
  const ratioOUC = pick(['IOR_ROUC', 'IOR_OUC', 'RATIO_OUC']);

  if (ratioO || ratioOUH || ratioOUC) {
    const hdp = parseHandicap(ratioO);
    if (hdp !== null) {
      markets.full.overUnderLines.push({
        hdp,
        over: parseOddsValue(ratioOUC) || 0,
        under: parseOddsValue(ratioOUH) || 0,
      });
    }
  }

  // 半场让球和大小球
  markets.half = {
    handicapLines: [],
    overUnderLines: [],
  };

  // 半场让球
  const ratioHR = pick(['RATIO_HRE', 'RATIO_HR', 'HSTRONG']);
  const ratioHRH = pick(['IOR_HREH', 'IOR_HRH', 'RATIO_HRH']);
  const ratioHRC = pick(['IOR_HREC', 'IOR_HRC', 'RATIO_HRC']);

  if (ratioHR || ratioHRH || ratioHRC) {
    const hdp = parseHandicap(ratioHR);
    if (hdp !== null) {
      markets.half.handicapLines.push({
        hdp,
        home: parseOddsValue(ratioHRH) || 0,
        away: parseOddsValue(ratioHRC) || 0,
      });
    }
  }

  // 半场大小球
  const ratioHO = pick(['RATIO_HROUO', 'RATIO_HO']);
  const ratioHOUH = pick(['IOR_HROUH', 'IOR_HOUH', 'RATIO_HOUH']);
  const ratioHOUC = pick(['IOR_HROUC', 'IOR_HOUC', 'RATIO_HOUC']);

  if (ratioHO || ratioHOUH || ratioHOUC) {
    const hdp = parseHandicap(ratioHO);
    if (hdp !== null) {
      markets.half.overUnderLines.push({
        hdp,
        over: parseOddsValue(ratioHOUC) || 0,
        under: parseOddsValue(ratioHOUH) || 0,
      });
    }
  }

  return markets;
}

// 运行测试
console.log('='.repeat(80));
console.log('赔率解析测试');
console.log('='.repeat(80));
console.log('');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(80));
  console.log('输入数据:', JSON.stringify(testCase.game, null, 2));
  console.log('');

  const markets = parseOdds(testCase.game);
  console.log('解析结果:');
  console.log(JSON.stringify(markets, null, 2));
  console.log('');

  // 验证结果
  let passed = true;
  const errors = [];

  if (testCase.game.IOR_RMH || testCase.game.IOR_MH || testCase.game.RATIO_MH) {
    if (!markets.moneyline) {
      passed = false;
      errors.push('❌ 独赢数据缺失');
    } else {
      console.log('✅ 独赢数据解析成功');
    }
  }

  if (testCase.game.RATIO_RE || testCase.game.RATIO_R || testCase.game.STRONG) {
    if (!markets.full?.handicapLines || markets.full.handicapLines.length === 0) {
      passed = false;
      errors.push('❌ 全场让球数据缺失');
    } else {
      console.log('✅ 全场让球数据解析成功');
    }
  }

  if (testCase.game.RATIO_ROUO || testCase.game.RATIO_OUO || testCase.game.RATIO_O) {
    if (!markets.full?.overUnderLines || markets.full.overUnderLines.length === 0) {
      passed = false;
      errors.push('❌ 全场大小球数据缺失');
    } else {
      console.log('✅ 全场大小球数据解析成功');
    }
  }

  if (testCase.game.RATIO_HRE || testCase.game.RATIO_HR) {
    if (!markets.half?.handicapLines || markets.half.handicapLines.length === 0) {
      passed = false;
      errors.push('❌ 半场让球数据缺失');
    } else {
      console.log('✅ 半场让球数据解析成功');
    }
  }

  if (testCase.game.RATIO_HROUO || testCase.game.RATIO_HO) {
    if (!markets.half?.overUnderLines || markets.half.overUnderLines.length === 0) {
      passed = false;
      errors.push('❌ 半场大小球数据缺失');
    } else {
      console.log('✅ 半场大小球数据解析成功');
    }
  }

  if (errors.length > 0) {
    console.log('');
    errors.forEach((error) => console.log(error));
  }

  console.log('');
  console.log(passed ? '✅ 测试通过' : '❌ 测试失败');
  console.log('='.repeat(80));
  console.log('');
});

console.log('所有测试完成！');

