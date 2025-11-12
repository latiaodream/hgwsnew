# 部署和更新指南

## 📋 目录

- [首次部署](#首次部署)
- [更新代码](#更新代码)
- [手动部署](#手动部署)
- [常见问题](#常见问题)

---

## 🚀 首次部署

### 方式一：使用自动化脚本（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/latiaodream/hgwss.git
cd hgwss

# 2. 运行部署脚本
./scripts/deploy.sh
```

脚本会自动完成：
- ✅ 检查 Node.js 环境
- ✅ 安装依赖
- ✅ 配置环境变量
- ✅ 创建必要目录
- ✅ 创建数据库（可选）
- ✅ 编译代码
- ✅ 启动服务

### 方式二：手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/latiaodream/hgwss.git
cd hgwss

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的配置
nano .env

# 4. 创建数据库（可选）
psql -U postgres -c "CREATE DATABASE hgwss;"
psql -U postgres -c "CREATE USER hgwss WITH PASSWORD 'JG3KN46JGXWN4CbJ';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE hgwss TO hgwss;"
psql -U hgwss -d hgwss -f database-schema.sql

# 5. 编译代码
npm run build

# 6. 启动服务
npm start
# 或启用 WebSocket
ENABLE_WEBSOCKET=1 npm start
```

---

## 🔄 更新代码

### 方式一：使用自动化脚本（推荐）

```bash
# 进入项目目录
cd /path/to/hgwss

# 运行更新脚本
./scripts/update.sh
```

脚本会自动完成：
- ✅ 停止服务
- ✅ 备份当前版本
- ✅ 拉取最新代码
- ✅ 安装新依赖（如果有）
- ✅ 编译代码
- ✅ 启动服务

### 方式二：手动更新

```bash
# 1. 进入项目目录
cd /path/to/hgwss

# 2. 停止服务
npm run stop
# 或手动停止
kill $(cat crown-scraper.pid)

# 3. 备份当前版本（可选）
mkdir -p backups/$(date +%Y%m%d_%H%M%S)
cp -r dist backups/$(date +%Y%m%d_%H%M%S)/
cp -r data backups/$(date +%Y%m%d_%H%M%S)/

# 4. 拉取最新代码
git pull origin main

# 5. 安装新依赖（如果 package.json 有变化）
npm install

# 6. 编译代码
npm run build

# 7. 启动服务
npm start
# 或启用 WebSocket
ENABLE_WEBSOCKET=1 npm start
```

---

## 📦 手动部署

### 环境要求

- **Node.js**: >= 16.x
- **npm**: >= 8.x
- **PostgreSQL**: >= 12.x（可选）
- **Redis**: >= 6.x（可选）

### 详细步骤

#### 1. 克隆仓库

```bash
git clone https://github.com/latiaodream/hgwss.git
cd hgwss
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 皇冠账号配置
CROWN_USERNAME=your_username
CROWN_PASSWORD=your_password
CROWN_BASE_URL=https://hga026.com

# 第三方 API 配置
ISPORTS_API_KEY=your_isports_api_key
ODDSAPI_API_KEY=your_oddsapi_api_key

# WebSocket 配置
ENABLE_WEBSOCKET=1
WS_PORT=8080
WS_AUTH_TOKEN=your_auth_token

# 数据库配置（可选）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hgwss
DB_USER=hgwss
DB_PASSWORD=JG3KN46JGXWN4CbJ

# Redis 配置（可选）
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
```

#### 4. 创建数据库（可选）

如果不创建数据库，服务会自动使用 JSON 文件存储。

```bash
# 创建数据库和用户
psql -U postgres << EOF
CREATE DATABASE hgwss;
CREATE USER hgwss WITH PASSWORD 'JG3KN46JGXWN4CbJ';
GRANT ALL PRIVILEGES ON DATABASE hgwss TO hgwss;
EOF

# 初始化表结构
psql -U hgwss -d hgwss -f database-schema.sql
```

#### 5. 编译代码

```bash
npm run build
```

#### 6. 启动服务

```bash
# 前台运行
npm start

# 后台运行
nohup npm start > server.out 2>&1 &

# 使用 PM2（推荐）
npm install -g pm2
pm2 start dist/index.js --name crown-scraper
pm2 save
pm2 startup
```

---

## 🔧 常用命令

### 服务管理

```bash
# 启动服务
npm start

# 停止服务
npm run stop

# 重启服务
npm run restart

# 查看状态
npm run status
```

### 日志查看

```bash
# 查看实时日志
tail -f server.out

# 查看最近 100 行日志
tail -n 100 server.out

# 搜索错误日志
grep "error" server.out
```

### 数据管理

```bash
# 备份数据
mkdir -p backups/$(date +%Y%m%d)
cp -r data backups/$(date +%Y%m%d)/

# 恢复数据
cp -r backups/20231112/data .
```

---

## ❓ 常见问题

### 1. 更新后服务无法启动

**原因**：可能是编译失败或配置错误

**解决方法**：
```bash
# 查看编译错误
npm run build

# 查看启动日志
tail -f server.out

# 恢复备份
cp -r backups/latest/dist .
npm start
```

### 2. 数据库连接失败

**原因**：数据库未创建或配置错误

**解决方法**：
```bash
# 检查数据库是否存在
psql -U postgres -c "\l" | grep hgwss

# 检查 .env 配置
cat .env | grep DB_

# 服务会自动降级到 JSON 文件存储
```

### 3. WebSocket 无法连接

**原因**：WebSocket 未启用或端口被占用

**解决方法**：
```bash
# 检查 WebSocket 配置
cat .env | grep ENABLE_WEBSOCKET

# 检查端口占用
lsof -i :8080

# 启用 WebSocket
echo "ENABLE_WEBSOCKET=1" >> .env
npm restart
```

### 4. 更新脚本权限不足

**原因**：脚本没有执行权限

**解决方法**：
```bash
chmod +x scripts/update.sh
chmod +x scripts/deploy.sh
```

### 5. Git 拉取失败

**原因**：本地有未提交的修改

**解决方法**：
```bash
# 查看修改
git status

# 暂存修改
git stash

# 拉取代码
git pull origin main

# 恢复修改
git stash pop
```

---

## 📊 服务验证

更新完成后，验证服务是否正常：

### 1. 检查服务状态

```bash
# 检查进程
ps aux | grep node

# 检查 PID 文件
cat crown-scraper.pid
```

### 2. 访问服务

```bash
# 测试 HTTP 服务
curl http://localhost:10089/api/status

# 测试 WebSocket（需要安装 wscat）
npm install -g wscat
wscat -c ws://localhost:8080
```

### 3. 查看日志

```bash
# 查看最新日志
tail -f server.out

# 检查是否有错误
grep -i error server.out
```

### 4. 访问管理界面

打开浏览器访问：
- **管理界面**: http://localhost:10089/admin.html
- **皇冠赛事**: http://localhost:10089/matches
- **第三方赔率**: http://localhost:10089/thirdparty-odds

---

## 🔐 安全建议

1. **修改默认密码**：更新 `.env` 中的所有密码和令牌
2. **限制访问**：使用防火墙限制端口访问
3. **启用 HTTPS**：在生产环境使用 HTTPS
4. **定期备份**：定期备份数据库和数据文件
5. **监控日志**：定期检查日志文件，及时发现问题

---

## 📚 相关文档

- [DATABASE.md](DATABASE.md) - 数据库集成说明
- [WEBSOCKET.md](WEBSOCKET.md) - WebSocket 接入文档
- [README.md](README.md) - 项目说明

---

## 💡 提示

- 使用 `./scripts/update.sh` 可以自动完成更新流程
- 更新前会自动备份，出错可以快速恢复
- 建议在非高峰期进行更新
- 更新后建议测试所有功能是否正常

