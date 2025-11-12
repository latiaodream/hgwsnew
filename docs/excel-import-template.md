# Excel 导入模板说明

## 球队映射导入模板

### Excel 格式要求

- **文件格式**: `.xlsx` 或 `.xls`
- **文件大小**: 最大 5MB
- **第一行**: 表头（会被忽略）
- **列顺序**: `isports_en`, `isports_cn`, `crown_cn`

### 示例表格

| isports_en | isports_cn | crown_cn |
|------------|------------|----------|
| Manchester United | 曼联 | 曼联 |
| Liverpool | 利物浦 | 利物浦 |
| Arsenal | 阿森纳 | 阿仙奴 |
| Chelsea | 切尔西 | 车路士 |
| Manchester City | 曼城 | 曼城 |

### API 使用

```bash
# 导入球队映射
curl -X POST http://localhost:10089/api/mapping/teams/import-excel \
  -F "file=@team_mappings.xlsx"
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "imported": 5,
    "total": 5,
    "errors": 0
  }
}
```

---

## 联赛映射导入模板

### Excel 格式要求

- **文件格式**: `.xlsx` 或 `.xls`
- **文件大小**: 最大 5MB
- **第一行**: 表头（会被忽略）
- **列顺序**: `isports_en`, `isports_cn`, `crown_cn`

### 示例表格

| isports_en | isports_cn | crown_cn |
|------------|------------|----------|
| Premier League | 英超 | 英格兰超级联赛 |
| La Liga | 西甲 | 西班牙甲组联赛 |
| Serie A | 意甲 | 意大利甲组联赛 |
| Bundesliga | 德甲 | 德国甲组联赛 |
| Ligue 1 | 法甲 | 法国甲组联赛 |

### API 使用

```bash
# 导入联赛映射
curl -X POST http://localhost:10089/api/league-mapping/import-excel \
  -F "file=@league_mappings.xlsx"
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "imported": 5,
    "total": 5,
    "errors": 0
  }
}
```

---

## 错误处理

### 常见错误

1. **文件格式错误**
   ```json
   {
     "success": false,
     "error": "只支持 .xlsx 和 .xls 格式的文件"
   }
   ```

2. **文件为空**
   ```json
   {
     "success": false,
     "error": "Excel 文件为空或格式不正确"
   }
   ```

3. **缺少必要字段**
   ```json
   {
     "success": true,
     "data": {
       "imported": 3,
       "total": 5,
       "errors": 2
     },
     "errors": [
       {
         "row": 3,
         "error": "缺少必要字段",
         "data": ["Manchester United", "", ""]
       },
       {
         "row": 5,
         "error": "缺少必要字段",
         "data": ["", "利物浦", "利物浦"]
       }
     ]
   }
   ```

---

## 注意事项

1. **表头行**: 第一行会被自动忽略，可以填写任何内容作为表头
2. **空行**: 空行会被自动跳过
3. **必填字段**: 三个字段都必须填写，否则该行会被跳过
4. **重复数据**: 如果数据库中已存在相同的映射，会自动更新
5. **批量导入**: 支持一次导入大量数据，建议每次不超过 1000 条

---

## 前端集成示例

### HTML

```html
<input type="file" id="excelFile" accept=".xlsx,.xls" />
<button onclick="uploadExcel()">导入 Excel</button>
```

### JavaScript

```javascript
async function uploadExcel() {
  const fileInput = document.getElementById('excelFile');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('请选择文件');
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await fetch('/api/mapping/teams/import-excel', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert(`导入成功！共导入 ${result.data.imported} 条数据`);
      if (result.errors && result.errors.length > 0) {
        console.warn('部分数据导入失败:', result.errors);
      }
    } else {
      alert(`导入失败: ${result.error}`);
    }
  } catch (error) {
    alert(`导入失败: ${error.message}`);
  }
}
```

---

## 下载模板

可以使用以下工具创建 Excel 模板：

1. **Microsoft Excel**
2. **Google Sheets** (导出为 .xlsx)
3. **LibreOffice Calc**
4. **WPS Office**

或者使用代码生成：

```javascript
// 使用 xlsx 库生成模板
const XLSX = require('xlsx');

const data = [
  ['isports_en', 'isports_cn', 'crown_cn'],
  ['Manchester United', '曼联', '曼联'],
  ['Liverpool', '利物浦', '利物浦'],
];

const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, 'template.xlsx');
```

