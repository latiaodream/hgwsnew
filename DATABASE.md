# 数据库集成说明

## 📦 数据库配置

本服务已集成 PostgreSQL 数据库，用于持久化存储以下数据：

1. **球队映射** (team_mappings) - 球队名称映射关系
2. **联赛映射** (league_mappings) - 联赛名称映射关系
3. **皇冠赛事** (crown_matches) - 皇冠平台的赛事数据
4. **第三方赔率** (thirdparty_matches) - iSportsAPI 和 Odds-API 的赔率数据

## 🔧 数据库连接信息

```
数据库名：hgwss
用户名：hgwss
密码：JG3KN46JGXWN4CbJ
主机：localhost (默认)
端口：5432 (默认)
```

## 📝 环境变量配置

在 `.env` 文件中添加以下配置（可选，默认值如上）：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hgwss
DB_USER=hgwss
DB_PASSWORD=JG3KN46JGXWN4CbJ
```

## 🚀 初始化数据库

### 方法 1：自动初始化（推荐）

服务启动时会自动：
1. 测试数据库连接
2. 创建所有必要的表和索引
3. 如果数据库连接失败，自动降级到 JSON 文件存储

```bash
npm start
```

### 方法 2：手动初始化

使用提供的 SQL 脚本手动创建表：

```bash
psql -U hgwss -d hgwss -f database-schema.sql
```

## 📊 数据库表结构

### 1. team_mappings (球队映射表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 唯一标识符 |
| isports_en | VARCHAR(255) | iSports 英文名 |
| isports_cn | VARCHAR(255) | iSports 中文名 |
| crown_cn | VARCHAR(255) | 皇冠中文名 |
| verified | BOOLEAN | 是否已验证 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**：
- `idx_team_mappings_isports_en`
- `idx_team_mappings_isports_cn`
- `idx_team_mappings_crown_cn`

### 2. league_mappings (联赛映射表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 唯一标识符 |
| isports_en | VARCHAR(255) | iSports 英文名 |
| isports_cn | VARCHAR(255) | iSports 中文名 |
| crown_cn | VARCHAR(255) | 皇冠中文名 |
| verified | BOOLEAN | 是否已验证 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**：
- `idx_league_mappings_isports_en`
- `idx_league_mappings_isports_cn`
- `idx_league_mappings_crown_cn`

### 3. crown_matches (皇冠赛事表)

| 字段 | 类型 | 说明 |
|------|------|------|
| gid | VARCHAR(50) | 赛事唯一标识符 (主键) |
| show_type | VARCHAR(20) | 赛事类型：live/today/early |
| league | VARCHAR(255) | 联赛名称 |
| team_home | VARCHAR(255) | 主队名称 |
| team_away | VARCHAR(255) | 客队名称 |
| match_time | TIMESTAMP | 比赛时间 (GMT-4) |
| handicap | DECIMAL(10,2) | 让球盘口 |
| handicap_home | DECIMAL(10,2) | 让球主队赔率 |
| handicap_away | DECIMAL(10,2) | 让球客队赔率 |
| over_under | DECIMAL(10,2) | 大小球盘口 |
| over | DECIMAL(10,2) | 大球赔率 |
| under | DECIMAL(10,2) | 小球赔率 |
| home_win | DECIMAL(10,2) | 主胜赔率 |
| draw | DECIMAL(10,2) | 平局赔率 |
| away_win | DECIMAL(10,2) | 客胜赔率 |
| strong | VARCHAR(10) | 强队标识：H/C |
| more | VARCHAR(10) | 更多玩法标识 |
| raw_data | JSONB | 原始数据 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**：
- `idx_crown_matches_show_type`
- `idx_crown_matches_match_time`
- `idx_crown_matches_league`
- `idx_crown_matches_updated_at`

### 4. thirdparty_matches (第三方赔率表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(100) | 赛事唯一标识符 (主键) |
| source | VARCHAR(50) | 数据源：isports/oddsapi |
| status | VARCHAR(20) | 赛事状态：live/upcoming |
| league_en | VARCHAR(255) | 联赛英文名 |
| league_cn | VARCHAR(255) | 联赛中文名 |
| team_home_en | VARCHAR(255) | 主队英文名 |
| team_home_cn | VARCHAR(255) | 主队中文名 |
| team_away_en | VARCHAR(255) | 客队英文名 |
| team_away_cn | VARCHAR(255) | 客队中文名 |
| match_time | TIMESTAMP | 比赛时间 (GMT-4) |
| handicap | JSONB | 让球盘口数据（支持多盘口） |
| totals | JSONB | 大小球盘口数据（支持多盘口） |
| moneyline | JSONB | 独赢盘口数据 |
| raw_data | JSONB | 原始数据 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**：
- `idx_thirdparty_matches_source`
- `idx_thirdparty_matches_status`
- `idx_thirdparty_matches_match_time`
- `idx_thirdparty_matches_league_en`
- `idx_thirdparty_matches_updated_at`

## 🔄 数据同步机制

### 双存储模式

服务支持两种存储模式：

1. **数据库模式**（默认）：
   - 所有数据存储在 PostgreSQL 数据库
   - 支持高并发查询和复杂查询
   - 数据持久化，服务重启不丢失

2. **JSON 文件模式**（降级）：
   - 当数据库连接失败时自动启用
   - 数据存储在 `data/` 目录下的 JSON 文件
   - 适合开发和测试环境

### 自动降级

如果数据库连接失败，服务会：
1. 记录警告日志
2. 自动切换到 JSON 文件存储
3. 继续正常运行

## 📈 数据管理

### 查询示例

```sql
-- 查询所有球队映射
SELECT * FROM team_mappings ORDER BY created_at DESC;

-- 查询所有联赛映射
SELECT * FROM league_mappings ORDER BY created_at DESC;

-- 查询今日皇冠赛事
SELECT * FROM crown_matches WHERE show_type = 'today' ORDER BY match_time ASC;

-- 查询滚球赛事
SELECT * FROM crown_matches WHERE show_type = 'live' ORDER BY match_time ASC;

-- 查询第三方进行中的赛事
SELECT * FROM thirdparty_matches WHERE status = 'live' ORDER BY match_time ASC;

-- 统计各类型赛事数量
SELECT show_type, COUNT(*) as count FROM crown_matches GROUP BY show_type;

-- 统计各数据源赛事数量
SELECT source, COUNT(*) as count FROM thirdparty_matches GROUP BY source;
```

### 数据清理

定期清理旧数据以节省存储空间：

```sql
-- 删除 7 天前的旧赛事数据
DELETE FROM crown_matches WHERE match_time < NOW() - INTERVAL '7 days';
DELETE FROM thirdparty_matches WHERE match_time < NOW() - INTERVAL '7 days';
```

## 🛠️ API 接口

所有 API 接口已自动适配数据库存储，无需修改前端代码。

### 球队映射 API

- `GET /api/mapping/teams` - 获取所有球队映射
- `GET /api/mapping/teams/:id` - 获取单个球队映射
- `POST /api/mapping/teams` - 创建球队映射
- `PUT /api/mapping/teams/:id` - 更新球队映射
- `DELETE /api/mapping/teams/:id` - 删除球队映射
- `POST /api/mapping/teams/batch` - 批量导入球队映射
- `POST /api/mapping/verify/:id` - 验证球队映射
- `GET /api/mapping/statistics` - 获取统计信息

### 联赛映射 API

- `GET /api/league-mapping` - 获取所有联赛映射
- `GET /api/league-mapping/:id` - 获取单个联赛映射
- `POST /api/league-mapping` - 创建联赛映射
- `PUT /api/league-mapping/:id` - 更新联赛映射
- `DELETE /api/league-mapping/:id` - 删除联赛映射
- `POST /api/league-mapping/import` - 批量导入联赛映射
- `POST /api/league-mapping/:id/verify` - 验证联赛映射
- `GET /api/league-mapping/statistics` - 获取统计信息

## 🔍 故障排查

### 数据库连接失败

如果看到以下日志：

```
⚠️ 数据库连接失败，将使用 JSON 文件存储
```

请检查：
1. PostgreSQL 服务是否运行
2. 数据库连接信息是否正确
3. 数据库用户权限是否足够
4. 防火墙是否阻止连接

### 查看数据库日志

```bash
# 查看服务日志
tail -f logs/combined.log

# 查看 PostgreSQL 日志
tail -f /var/log/postgresql/postgresql-*.log
```

## 📚 相关文件

- `database-schema.sql` - 数据库表结构 SQL 脚本
- `src/config/database.ts` - 数据库配置和初始化
- `src/repositories/` - 数据库操作 Repository 类
- `src/utils/MappingManager.ts` - 球队映射管理器（支持数据库）
- `src/utils/LeagueMappingManager.ts` - 联赛映射管理器（支持数据库）

## 🎯 下一步计划

- [ ] 实现皇冠赛事数据自动存储到数据库
- [ ] 实现第三方赔率数据自动存储到数据库
- [ ] 添加数据清理定时任务
- [ ] 添加数据备份功能
- [ ] 添加数据统计和分析功能

