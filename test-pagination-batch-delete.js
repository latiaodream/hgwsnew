/**
 * 测试分页和批量删除功能
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:10089';

async function testPagination() {
  console.log('🧪 测试分页功能');
  console.log('========================================\n');

  try {
    // 1. 测试球队映射分页
    console.log('1️⃣ 测试球队映射分页:');
    console.log('----------------------------------------');
    
    // 获取第一页
    const page1 = await axios.get(`${BASE_URL}/api/mapping/teams`, {
      params: { page: 1, pageSize: 10 }
    });
    
    if (page1.data.success) {
      console.log('✅ 第一页数据:');
      console.log(`   - 当前页: ${page1.data.pagination.page}`);
      console.log(`   - 每页数量: ${page1.data.pagination.pageSize}`);
      console.log(`   - 总数: ${page1.data.pagination.total}`);
      console.log(`   - 总页数: ${page1.data.pagination.totalPages}`);
      console.log(`   - 返回数据: ${page1.data.data.length} 条\n`);
      
      if (page1.data.data.length > 0) {
        console.log('   前 3 条数据:');
        page1.data.data.slice(0, 3).forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.isports_en} -> ${item.crown_cn || '[空]'}`);
        });
        console.log('');
      }
      
      // 获取第二页
      if (page1.data.pagination.totalPages > 1) {
        const page2 = await axios.get(`${BASE_URL}/api/mapping/teams`, {
          params: { page: 2, pageSize: 10 }
        });
        
        if (page2.data.success) {
          console.log('✅ 第二页数据:');
          console.log(`   - 返回数据: ${page2.data.data.length} 条\n`);
        }
      }
    } else {
      console.log('❌ 获取球队映射失败:', page1.data.error);
    }
    
    // 2. 测试联赛映射分页
    console.log('\n2️⃣ 测试联赛映射分页:');
    console.log('----------------------------------------');
    
    const leaguePage1 = await axios.get(`${BASE_URL}/api/league-mapping`, {
      params: { page: 1, pageSize: 10 }
    });
    
    if (leaguePage1.data.success) {
      console.log('✅ 第一页数据:');
      console.log(`   - 当前页: ${leaguePage1.data.pagination.page}`);
      console.log(`   - 每页数量: ${leaguePage1.data.pagination.pageSize}`);
      console.log(`   - 总数: ${leaguePage1.data.pagination.total}`);
      console.log(`   - 总页数: ${leaguePage1.data.pagination.totalPages}`);
      console.log(`   - 返回数据: ${leaguePage1.data.data.length} 条\n`);
      
      if (leaguePage1.data.data.length > 0) {
        console.log('   前 3 条数据:');
        leaguePage1.data.data.slice(0, 3).forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.isports_en} -> ${item.crown_cn || '[空]'}`);
        });
        console.log('');
      }
    } else {
      console.log('❌ 获取联赛映射失败:', leaguePage1.data.error);
    }
    
    // 3. 测试搜索 + 分页
    console.log('\n3️⃣ 测试搜索 + 分页:');
    console.log('----------------------------------------');
    
    const searchResult = await axios.get(`${BASE_URL}/api/mapping/teams`, {
      params: { search: 'United', page: 1, pageSize: 5 }
    });
    
    if (searchResult.data.success) {
      console.log(`✅ 搜索 "United" 结果:`);
      console.log(`   - 总数: ${searchResult.data.pagination.total}`);
      console.log(`   - 返回数据: ${searchResult.data.data.length} 条\n`);
      
      if (searchResult.data.data.length > 0) {
        console.log('   搜索结果:');
        searchResult.data.data.forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.isports_en} -> ${item.crown_cn || '[空]'}`);
        });
        console.log('');
      }
    } else {
      console.log('❌ 搜索失败:', searchResult.data.error);
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 服务未启动，请先启动服务');
    }
  }
}

async function testBatchDelete() {
  console.log('\n\n🧪 测试批量删除功能');
  console.log('========================================\n');

  try {
    // 注意: 这个测试会实际删除数据，请谨慎使用！
    console.log('⚠️  警告: 批量删除测试会实际删除数据！');
    console.log('⚠️  建议在测试环境中运行此测试\n');
    
    // 1. 创建测试数据
    console.log('1️⃣ 创建测试数据:');
    console.log('----------------------------------------');
    
    const testMappings = [
      { isports_en: 'Test Team 1', isports_cn: '测试球队1', crown_cn: '', verified: false },
      { isports_en: 'Test Team 2', isports_cn: '测试球队2', crown_cn: '', verified: false },
      { isports_en: 'Test Team 3', isports_cn: '测试球队3', crown_cn: '', verified: false },
    ];
    
    const createdIds = [];
    
    for (const mapping of testMappings) {
      try {
        const res = await axios.post(`${BASE_URL}/api/mapping/teams`, mapping);
        if (res.data.success) {
          createdIds.push(res.data.data.id);
          console.log(`✅ 创建测试数据: ${mapping.isports_en} (ID: ${res.data.data.id})`);
        }
      } catch (error) {
        console.log(`⚠️  创建失败: ${mapping.isports_en}`);
      }
    }
    
    console.log(`\n✅ 共创建 ${createdIds.length} 条测试数据\n`);
    
    if (createdIds.length === 0) {
      console.log('⚠️  没有创建测试数据，跳过批量删除测试');
      return;
    }
    
    // 2. 批量删除测试数据
    console.log('2️⃣ 批量删除测试数据:');
    console.log('----------------------------------------');
    
    const deleteRes = await axios.post(`${BASE_URL}/api/mapping/teams/batch-delete`, {
      ids: createdIds
    });
    
    if (deleteRes.data.success) {
      console.log('✅ 批量删除成功:');
      console.log(`   - 成功删除: ${deleteRes.data.data.deleted} 条`);
      console.log(`   - 删除失败: ${deleteRes.data.data.failed} 条`);
      console.log(`   - 总计: ${deleteRes.data.data.total} 条`);
      console.log(`   - 消息: ${deleteRes.data.message}\n`);
    } else {
      console.log('❌ 批量删除失败:', deleteRes.data.error);
    }
    
    // 3. 验证删除结果
    console.log('3️⃣ 验证删除结果:');
    console.log('----------------------------------------');
    
    for (const id of createdIds) {
      try {
        const res = await axios.get(`${BASE_URL}/api/mapping/teams/${id}`);
        if (res.data.success) {
          console.log(`⚠️  数据仍然存在: ${id}`);
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          console.log(`✅ 数据已删除: ${id}`);
        } else {
          console.log(`❌ 验证失败: ${id}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 服务未启动，请先启动服务');
    }
  }
}

async function main() {
  console.log('🚀 开始测试分页和批量删除功能\n');
  
  // 测试分页
  await testPagination();
  
  // 测试批量删除（可选，会实际删除数据）
  // await testBatchDelete();
  
  console.log('\n========================================');
  console.log('✅ 测试完成！\n');
  console.log('💡 API 使用示例:\n');
  console.log('分页查询:');
  console.log('  GET /api/mapping/teams?page=1&pageSize=50');
  console.log('  GET /api/league-mapping?page=2&pageSize=20\n');
  console.log('搜索 + 分页:');
  console.log('  GET /api/mapping/teams?search=United&page=1&pageSize=10\n');
  console.log('批量删除:');
  console.log('  POST /api/mapping/teams/batch-delete');
  console.log('  Body: { "ids": ["id1", "id2", "id3"] }\n');
  console.log('  POST /api/league-mapping/batch-delete');
  console.log('  Body: { "ids": ["id1", "id2", "id3"] }\n');
}

main();

