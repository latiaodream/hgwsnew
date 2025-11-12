/**
 * 测试 Excel 导入功能
 * 用于诊断导入失败的问题
 */

const XLSX = require('xlsx');
const fs = require('fs');

// 创建测试 Excel 文件
function createTestExcel() {
  console.log('📝 创建测试 Excel 文件...\n');

  const testData = [
    { isports_en: 'Manchester United', isports_cn: '曼联', crown_cn: '' },
    { isports_en: 'Liverpool', isports_cn: '利物浦', crown_cn: '' },
    { isports_en: 'Arsenal', isports_cn: '阿森纳', crown_cn: '阿仙奴' },
  ];

  // 方法 1: 使用 json_to_sheet（当前后端使用的方法）
  const worksheet1 = XLSX.utils.json_to_sheet(testData, {
    header: ['isports_en', 'isports_cn', 'crown_cn'],
  });
  const workbook1 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook1, worksheet1, 'Teams');
  XLSX.writeFile(workbook1, 'test-export-method1.xlsx');
  console.log('✅ 方法 1 (json_to_sheet): test-export-method1.xlsx');

  // 方法 2: 使用 aoa_to_sheet（数组方式）
  const aoa = [
    ['isports_en', 'isports_cn', 'crown_cn'],
    ['Manchester United', '曼联', ''],
    ['Liverpool', '利物浦', ''],
    ['Arsenal', '阿森纳', '阿仙奴'],
  ];
  const worksheet2 = XLSX.utils.aoa_to_sheet(aoa);
  const workbook2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook2, worksheet2, 'Teams');
  XLSX.writeFile(workbook2, 'test-export-method2.xlsx');
  console.log('✅ 方法 2 (aoa_to_sheet): test-export-method2.xlsx\n');

  return ['test-export-method1.xlsx', 'test-export-method2.xlsx'];
}

// 测试读取 Excel 文件
function testReadExcel(filename) {
  console.log(`\n📖 测试读取: ${filename}`);
  console.log('='.repeat(60));

  const workbook = XLSX.readFile(filename);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  console.log(`\n工作表名称: ${sheetName}`);

  // 方法 1: header: 1 (当前后端使用的方法)
  console.log('\n方法 1: sheet_to_json({ header: 1 })');
  const data1 = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log(`总行数: ${data1.length}`);
  console.log('前 5 行:');
  data1.slice(0, 5).forEach((row, i) => {
    console.log(`  第 ${i + 1} 行:`, JSON.stringify(row));
  });

  // 方法 2: 默认方式（对象）
  console.log('\n方法 2: sheet_to_json() - 默认');
  const data2 = XLSX.utils.sheet_to_json(worksheet);
  console.log(`总行数: ${data2.length}`);
  console.log('前 3 行:');
  data2.slice(0, 3).forEach((row, i) => {
    console.log(`  第 ${i + 1} 行:`, JSON.stringify(row));
  });

  // 模拟后端解析逻辑
  console.log('\n🔍 模拟后端解析逻辑:');
  const mappings = [];
  const errors = [];

  for (let i = 1; i < data1.length; i++) {
    const row = data1[i];

    // 跳过空行
    if (!row || row.length === 0 || !row[0]) {
      console.log(`  第 ${i + 1} 行: 跳过空行`);
      continue;
    }

    const isports_en = row[0]?.toString().trim();
    const isports_cn = row[1]?.toString().trim() || '';
    const crown_cn = row[2]?.toString().trim() || '';

    console.log(`  第 ${i + 1} 行: isports_en="${isports_en}", isports_cn="${isports_cn}", crown_cn="${crown_cn}"`);

    // 验证
    if (!isports_en) {
      errors.push({
        row: i + 1,
        error: '缺少 isports_en 字段',
        data: row,
      });
      console.log(`    ❌ 错误: 缺少 isports_en 字段`);
      continue;
    }

    mappings.push({
      isports_en,
      isports_cn,
      crown_cn,
      verified: false,
    });
    console.log(`    ✅ 有效数据`);
  }

  console.log(`\n📊 解析结果:`);
  console.log(`  有效数据: ${mappings.length} 条`);
  console.log(`  错误数据: ${errors.length} 条`);

  if (mappings.length === 0) {
    console.log(`\n❌ 没有有效的数据可导入！`);
  } else {
    console.log(`\n✅ 导入成功！`);
    console.log('\n导入的数据:');
    mappings.forEach((m, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(m)}`);
    });
  }

  if (errors.length > 0) {
    console.log('\n错误列表:');
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. 第 ${e.row} 行: ${e.error}`);
      console.log(`     数据: ${JSON.stringify(e.data)}`);
    });
  }
}

// 主函数
async function main() {
  console.log('🧪 Excel 导入功能测试\n');
  console.log('='.repeat(60));

  // 创建测试文件
  const files = createTestExcel();

  // 测试读取
  files.forEach(file => {
    testReadExcel(file);
  });

  console.log('\n\n💡 诊断建议:');
  console.log('1. 如果方法 1 和方法 2 生成的文件解析结果不同，说明导出方法有问题');
  console.log('2. 如果解析出的第一行是表头，说明 Excel 格式正确');
  console.log('3. 如果所有行都被跳过，检查空行判断逻辑');
  console.log('4. 如果 isports_en 为空，检查列顺序是否正确');
  console.log('\n请将生成的 test-export-method1.xlsx 或 test-export-method2.xlsx');
  console.log('上传到前端测试导入功能，看看哪个方法生成的文件可以正常导入。');
}

main().catch(console.error);

