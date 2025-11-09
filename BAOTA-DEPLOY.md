# 宝塔面板部署指南

## 📋 前置要求

- 一台独立的服务器（建议 2核4G 以上）
- 已安装宝塔面板（Linux 版本）
- 服务器可以访问皇冠网站

## 🔧 第一步：安装 Node.js

### 1.1 登录宝塔面板

打开浏览器，访问你的宝塔面板地址：
```
http://你的服务器IP:8888
```

### 1.2 安装 Node.js

1. 点击左侧菜单 **「软件商店」**
2. 搜索 **「Node.js 版本管理器」**
3. 点击 **「安装」**
4. 安装完成后，点击 **「设置」**
5. 安装 **Node.js 18.x** 或更高版本
6. 设置为默认版本

### 1.3 验证安装

点击左侧菜单 **「终端」**，输入：
```bash
node -v
npm -v
```

如果显示版本号，说明安装成功。

## 📦 第二步：上传项目文件

### 2.1 创建项目目录

在宝塔终端中执行：
```bash
# 创建项目目录
mkdir -p /www/wwwroot/crown-scraper-service
cd /www/wwwroot/crown-scraper-service
```

### 2.2 上传文件

**方法一：使用宝塔文件管理器**

1. 点击左侧菜单 **「文件」**
2. 进入 `/www/wwwroot/crown-scraper-service` 目录
3. 点击 **「上传」**
4. 将本地的 `crown-scraper-service` 文件夹中的所有文件上传

**方法二：使用 Git（推荐）**

如果你的代码在 Git 仓库中：
```bash
cd /www/wwwroot
git clone <你的仓库地址>
cd crown-scraper-service
```

### 2.3 验证文件

确保以下文件都已上传：
```bash
ls -la
```

应该看到：
```
src/
package.json
tsconfig.json
ecosystem.config.js
.env.example
deploy.sh
README.md
...
```

## ⚙️ 第三步：配置环境变量

### 3.1 创建 .env 文件

在宝塔终端中执行：
```bash
cd /www/wwwroot/crown-scraper-service
cp .env.example .env
nano .env
```

### 3.2 填写配置

按 `i` 进入编辑模式，填写以下内容：

```env
# WebSocket 服务器配置
WS_PORT=8080
WS_AUTH_TOKEN=your-super-secret-token-change-this-in-production

# 皇冠 API 配置
CROWN_API_BASE_URL=https://你的皇冠API地址.com

# 滚球账号（建议使用独立账号）
LIVE_CROWN_USERNAME=live_account
LIVE_CROWN_PASSWORD=live_password

# 今日账号（建议使用独立账号）
TODAY_CROWN_USERNAME=today_account
TODAY_CROWN_PASSWORD=today_password

# 早盘账号（建议使用独立账号）
EARLY_CROWN_USERNAME=early_account
EARLY_CROWN_PASSWORD=early_password

# 抓取间隔（秒）
LIVE_FETCH_INTERVAL=2
TODAY_FETCH_INTERVAL=10
EARLY_FETCH_INTERVAL=30

# 日志级别
LOG_LEVEL=info
```

**重要提示：**
- `CROWN_API_BASE_URL` 必须填写实际的皇冠 API 地址
- 三个账号建议使用不同的账号，避免封号
- `WS_AUTH_TOKEN` 必须修改为强密码

按 `Esc`，输入 `:wq`，按 `Enter` 保存退出。

### 3.3 验证配置

```bash
cat .env
```

确认配置正确。

## 📥 第四步：安装依赖

### 4.1 安装 PM2（全局）

```bash
npm install -g pm2
```

### 4.2 安装项目依赖

```bash
cd /www/wwwroot/crown-scraper-service
npm install
```

这个过程可能需要 2-5 分钟，请耐心等待。

### 4.3 验证安装

```bash
ls node_modules/
```

应该看到很多依赖包。

## 🔨 第五步：编译 TypeScript

```bash
npm run build
```

编译成功后，会生成 `dist` 目录：
```bash
ls dist/
```

应该看到编译后的 JavaScript 文件。

## 🚀 第六步：启动服务

### 6.1 使用 PM2 启动

```bash
pm2 start ecosystem.config.js
```

### 6.2 查看运行状态

```bash
pm2 status
```

应该看到：
```
┌─────┬──────────────────┬─────────┬─────────┬──────────┐
│ id  │ name             │ status  │ restart │ uptime   │
├─────┼──────────────────┼─────────┼─────────┼──────────┤
│ 0   │ crown-scraper    │ online  │ 0       │ 0s       │
└─────┴──────────────────┴─────────┴─────────┴──────────┘
```

如果 status 是 `online`，说明启动成功！

### 6.3 查看日志

```bash
pm2 logs crown-scraper
```

按 `Ctrl + C` 退出日志查看。

### 6.4 设置开机自启动

```bash
pm2 startup
pm2 save
```

## 🔥 第七步：配置防火墙

### 7.1 在宝塔面板中开放端口

1. 点击左侧菜单 **「安全」**
2. 点击 **「添加端口规则」**
3. 填写：
   - 端口：`8080`（与 .env 中的 WS_PORT 一致）
   - 协议：`TCP`
   - 备注：`Crown Scraper WebSocket`
4. 点击 **「确定」**

### 7.2 在服务器防火墙中开放端口

**阿里云/腾讯云：**
1. 登录云服务器控制台
2. 找到 **「安全组」** 设置
3. 添加入站规则：
   - 端口：`8080`
   - 协议：`TCP`
   - 来源：`0.0.0.0/0`（或指定 IP）

## ✅ 第八步：测试服务

### 8.1 测试 WebSocket 连接

在宝塔终端中执行：
```bash
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: test" \
     http://localhost:8080
```

如果返回 `101 Switching Protocols`，说明 WebSocket 服务正常。

### 8.2 查看实时日志

```bash
pm2 logs crown-scraper --lines 50
```

应该看到类似的日志：
```
[INFO] Crown Scraper Service 启动成功
[INFO] WebSocket 服务器运行在端口: 8080
[INFO] [live] 登录成功
[INFO] [today] 登录成功
[INFO] [early] 登录成功
[INFO] [live] 获取到 58 场赛事
```

## 🔧 第九步：常用管理命令

### 9.1 查看服务状态
```bash
pm2 status
```

### 9.2 重启服务
```bash
pm2 restart crown-scraper
```

### 9.3 停止服务
```bash
pm2 stop crown-scraper
```

### 9.4 查看日志
```bash
pm2 logs crown-scraper
```

### 9.5 查看详细信息
```bash
pm2 show crown-scraper
```

### 9.6 监控资源使用
```bash
pm2 monit
```

## 📊 第十步：监控和维护

### 10.1 安装 PM2 监控面板（可选）

```bash
pm2 install pm2-logrotate
```

### 10.2 设置日志轮转

```bash
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 10.3 定期检查

建议每天检查一次：
```bash
pm2 status
pm2 logs crown-scraper --lines 100
```

## 🔗 第十一步：集成到下注网站

### 11.1 获取 WebSocket 地址

```
ws://你的服务器IP:8080
```

或者使用域名（需要配置 Nginx 反向代理）：
```
wss://scraper.yourdomain.com
```

### 11.2 在下注网站中添加客户端

参考 `client-example.ts` 文件，在你的下注网站后端添加 WebSocket 客户端。

### 11.3 测试连接

确保下注网站能够连接到抓取服务器。

## 🛡️ 安全建议

### 1. 修改默认端口
如果 8080 端口不安全，可以修改 `.env` 中的 `WS_PORT`。

### 2. 使用强密码
`WS_AUTH_TOKEN` 必须使用强密码，建议 32 位以上随机字符串。

### 3. 限制访问 IP
在防火墙中只允许下注网站服务器的 IP 访问。

### 4. 使用 SSL/TLS
配置 Nginx 反向代理，使用 HTTPS/WSS 加密连接。

### 5. 定期更换账号
建议每周更换一次皇冠账号密码。

## 🐛 常见问题

### Q1: 服务启动失败
**解决方法：**
```bash
# 查看错误日志
pm2 logs crown-scraper --err

# 检查配置文件
cat .env

# 检查端口是否被占用
netstat -tunlp | grep 8080
```

### Q2: 登录失败
**解决方法：**
- 检查 `CROWN_API_BASE_URL` 是否正确
- 检查账号密码是否正确
- 检查服务器是否能访问皇冠网站
- 查看日志：`pm2 logs crown-scraper`

### Q3: 无法连接 WebSocket
**解决方法：**
- 检查防火墙是否开放端口
- 检查服务是否正常运行：`pm2 status`
- 测试本地连接：`curl http://localhost:8080`

### Q4: 内存占用过高
**解决方法：**
```bash
# 重启服务
pm2 restart crown-scraper

# 增加服务器内存
# 或减少抓取频率（修改 .env 中的 FETCH_INTERVAL）
```

### Q5: 账号被封
**解决方法：**
- 更换新的账号
- 修改 `.env` 文件
- 重启服务：`pm2 restart crown-scraper`

## 📞 技术支持

如果遇到问题：
1. 查看日志：`pm2 logs crown-scraper`
2. 查看错误日志：`pm2 logs crown-scraper --err`
3. 查看完整日志文件：`cat logs/error.log`

## 🎉 完成！

现在你的皇冠数据抓取服务已经在宝塔面板上成功部署并运行了！

下一步：
1. 在下注网站中集成 WebSocket 客户端
2. 测试数据推送是否正常
3. 监控服务运行状态
4. 定期检查日志和账号状态

