# 宝塔服务器部署指南

## 📋 服务器信息

- **宝塔站点目录**：`/www/wwwroot/wss.aibcbot.top`
- **GitHub 仓库**：https://github.com/latiaodream/hgwss.git
- **域名**：wss.aibcbot.top

## 🚀 快速部署（三步完成）

### 第一步：SSH 连接服务器并克隆代码

```bash
# 连接服务器
ssh root@你的服务器IP

# 进入宝塔站点目录
cd /www/wwwroot

# 克隆代码（如果目录已存在，先删除或重命名）
git clone https://github.com/latiaodream/hgwss.git wss.aibcbot.top

# 进入项目目录
cd wss.aibcbot.top
```

### 第二步：配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env
```

**必需配置项：**

```env
# WebSocket 配置
WS_PORT=8080
WS_AUTH_TOKEN=你的32位随机密钥

# 皇冠 API 配置
CROWN_API_BASE_URL=https://你的皇冠API地址

# 滚球账号
LIVE_CROWN_USERNAME=滚球账号
LIVE_CROWN_PASSWORD=滚球密码

# 今日账号
TODAY_CROWN_USERNAME=今日账号
TODAY_CROWN_PASSWORD=今日密码

# 早盘账号
EARLY_CROWN_USERNAME=早盘账号
EARLY_CROWN_PASSWORD=早盘密码

# 抓取间隔（秒）
LIVE_FETCH_INTERVAL=2
TODAY_FETCH_INTERVAL=10
EARLY_FETCH_INTERVAL=30
```

**保存并退出：**
- 按 `Ctrl + O` 保存
- 按 `Enter` 确认
- 按 `Ctrl + X` 退出

### 第三步：一键部署

```bash
# 运行部署脚本
bash baota-deploy.sh
```

脚本会自动：
1. ✅ 检查 Node.js 和 PM2
2. ✅ 安装项目依赖
3. ✅ 编译 TypeScript
4. ✅ 启动服务
5. ✅ 配置开机自启动
6. ✅ 显示连接信息

## 🔥 开放防火墙端口

### 1. 在宝塔面板中开放端口

1. 登录宝塔面板
2. 点击左侧菜单 **「安全」**
3. 点击 **「添加端口规则」**
4. 填写信息：
   - **端口**：`8080`
   - **协议**：`TCP`
   - **备注**：`Crown Scraper WebSocket`
5. 点击 **「提交」**

### 2. 在云服务器控制台开放端口

**阿里云：**
1. 登录阿里云控制台
2. 进入 ECS 实例
3. 点击 **「安全组」**
4. 点击 **「配置规则」**
5. 点击 **「添加安全组规则」**
6. 填写信息：
   - **端口范围**：`8080/8080`
   - **授权对象**：`0.0.0.0/0`（或指定 IP）
   - **描述**：`Crown Scraper WebSocket`
7. 点击 **「确定」**

**腾讯云：**
1. 登录腾讯云控制台
2. 进入云服务器实例
3. 点击 **「安全组」**
4. 点击 **「添加规则」**
5. 填写信息：
   - **类型**：`自定义`
   - **来源**：`0.0.0.0/0`（或指定 IP）
   - **协议端口**：`TCP:8080`
   - **策略**：`允许`
6. 点击 **「完成」**

## ✅ 验证部署

### 1. 检查服务状态

```bash
bash check-status.sh
```

应该看到：
- ✅ PM2 服务状态：online
- ✅ 端口 8080 正在监听
- ✅ 无错误日志

### 2. 查看实时日志

```bash
pm2 logs crown-scraper
```

应该看到：
```
[Crown Scraper] WebSocket 服务器启动在端口 8080
[Crown Scraper] 滚球抓取器已启动
[Crown Scraper] 今日抓取器已启动
[Crown Scraper] 早盘抓取器已启动
```

### 3. 测试 WebSocket 连接

在本地或下注网站中测试连接：

```javascript
const ws = new WebSocket('ws://你的服务器IP:8080');

ws.onopen = () => {
  console.log('连接成功！');
  
  // 发送认证消息
  ws.send(JSON.stringify({
    type: 'auth',
    token: '你的WS_AUTH_TOKEN'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到消息:', data);
};
```

## 🔒 配置 HTTPS/WSS（推荐）

### 1. 在宝塔面板中添加网站

1. 点击左侧菜单 **「网站」**
2. 点击 **「添加站点」**
3. 填写信息：
   - **域名**：`wss.aibcbot.top`
   - **根目录**：`/www/wwwroot/wss.aibcbot.top`
   - **FTP**：不创建
   - **数据库**：不创建
   - **PHP 版本**：纯静态
4. 点击 **「提交」**

### 2. 申请 SSL 证书

1. 在网站列表中找到 `wss.aibcbot.top`
2. 点击 **「设置」**
3. 点击 **「SSL」** 标签
4. 选择 **「Let's Encrypt」**
5. 勾选域名
6. 点击 **「申请」**
7. 等待证书申请成功
8. 开启 **「强制 HTTPS」**

### 3. 配置反向代理

1. 在网站设置中，点击 **「反向代理」** 标签
2. 点击 **「添加反向代理」**
3. 填写信息：
   - **代理名称**：`Crown Scraper WebSocket`
   - **目标 URL**：`http://127.0.0.1:8080`
   - **发送域名**：`$host`
4. 点击 **「提交」**

### 4. 修改配置文件（重要！）

1. 在网站设置中，点击 **「配置文件」** 标签
2. 找到反向代理的 `location /` 块
3. 添加 WebSocket 支持的配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    
    # WebSocket 必需的头部
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # 代理头部
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 超时设置（WebSocket 长连接）
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;
    
    # 缓冲设置
    proxy_buffering off;
}
```

4. 点击 **「保存」**
5. 重载 Nginx：`nginx -s reload`

### 5. 测试 WSS 连接

```javascript
const ws = new WebSocket('wss://wss.aibcbot.top');

ws.onopen = () => {
  console.log('WSS 连接成功！');
};
```

## 📊 常用管理命令

### 服务管理

```bash
pm2 status                    # 查看服务状态
pm2 restart crown-scraper     # 重启服务
pm2 stop crown-scraper        # 停止服务
pm2 logs crown-scraper        # 查看日志
pm2 monit                     # 监控资源使用
```

### 代码更新

```bash
cd /www/wwwroot/wss.aibcbot.top
git pull origin main          # 拉取最新代码
bash fix-and-deploy.sh        # 重新编译和部署
```

### 健康检查

```bash
bash check-status.sh          # 全面健康检查
```

### 日志查看

```bash
tail -f logs/combined.log     # 查看完整日志
tail -f logs/error.log        # 查看错误日志
pm2 logs crown-scraper --err  # 查看 PM2 错误日志
```

## 🐛 常见问题

### Q1: 编译失败

**错误信息：**
```
error TS18048: 'markets.full.handicapLines' is possibly 'undefined'.
```

**解决方法：**
```bash
git pull origin main          # 拉取最新代码（已修复）
bash fix-and-deploy.sh        # 重新部署
```

### Q2: 服务启动失败

**可能原因：**
- .env 配置错误
- 端口被占用
- Node.js 版本过低

**解决方法：**
```bash
# 检查配置
cat .env

# 检查端口
netstat -tunlp | grep 8080

# 查看错误日志
pm2 logs crown-scraper --err
```

### Q3: 无法连接 WebSocket

**可能原因：**
- 防火墙未开放端口
- 服务未运行
- 认证 Token 错误

**解决方法：**
```bash
# 检查服务状态
pm2 status

# 检查端口
netstat -tunlp | grep 8080

# 测试本地连接
curl http://localhost:8080
```

### Q4: 登录皇冠失败

**可能原因：**
- CROWN_API_BASE_URL 错误
- 账号密码错误
- 服务器无法访问皇冠网站

**解决方法：**
```bash
# 检查配置
cat .env | grep CROWN

# 测试网络连接
curl -I $CROWN_API_BASE_URL

# 查看详细日志
pm2 logs crown-scraper
```

## 🎯 完整部署流程总结

```bash
# 1. 连接服务器
ssh root@你的服务器IP

# 2. 克隆代码
cd /www/wwwroot
git clone https://github.com/latiaodream/hgwss.git wss.aibcbot.top
cd wss.aibcbot.top

# 3. 配置环境变量
cp .env.example .env
nano .env  # 填入实际配置

# 4. 一键部署
bash baota-deploy.sh

# 5. 开放防火墙端口（宝塔面板 + 云服务器控制台）

# 6. 验证部署
bash check-status.sh

# 7. 配置 HTTPS/WSS（可选但推荐）

# 8. 测试连接
# 在下注网站中连接: wss://wss.aibcbot.top
```

## 🎉 完成！

现在你的皇冠数据抓取服务已经成功部署在宝塔服务器上了！

**连接地址：**
- HTTP: `ws://你的服务器IP:8080`
- HTTPS: `wss://wss.aibcbot.top`（配置 Nginx 后）

**下一步：**
1. 在下注网站中集成 WebSocket 客户端
2. 监控服务运行状态
3. 定期检查日志

祝你使用愉快！🚀

