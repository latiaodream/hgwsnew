# Nginx 反向代理配置指南（宝塔面板）

## 📋 为什么需要 Nginx 反向代理？

1. **安全性**：使用 HTTPS/WSS 加密连接
2. **域名访问**：使用域名代替 IP:端口
3. **负载均衡**：支持多个抓取服务器
4. **访问控制**：可以限制访问 IP

## 🔧 方法一：使用宝塔面板图形界面（推荐）

### 步骤 1：添加网站

1. 登录宝塔面板
2. 点击左侧菜单 **「网站」**
3. 点击 **「添加站点」**
4. 填写信息：
   - **域名**：`scraper.yourdomain.com`（修改为你的域名）
   - **根目录**：`/www/wwwroot/crown-scraper-service`
   - **FTP**：不创建
   - **数据库**：不创建
   - **PHP 版本**：纯静态
5. 点击 **「提交」**

### 步骤 2：配置 SSL 证书

1. 在网站列表中找到刚创建的网站
2. 点击 **「设置」**
3. 点击 **「SSL」** 标签
4. 选择 **「Let's Encrypt」**
5. 勾选你的域名
6. 点击 **「申请」**
7. 等待证书申请成功
8. 开启 **「强制 HTTPS」**

### 步骤 3：配置反向代理

1. 在网站设置中，点击 **「反向代理」** 标签
2. 点击 **「添加反向代理」**
3. 填写信息：
   - **代理名称**：`Crown Scraper WebSocket`
   - **目标 URL**：`http://127.0.0.1:8080`
   - **发送域名**：`$host`
4. 点击 **「提交」**

### 步骤 4：修改配置文件（重要！）

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

### 步骤 5：重载 Nginx

在宝塔终端中执行：
```bash
nginx -t  # 测试配置
nginx -s reload  # 重载配置
```

## 🔧 方法二：手动配置（高级用户）

### 步骤 1：创建配置文件

```bash
nano /www/server/panel/vhost/nginx/scraper.yourdomain.com.conf
```

### 步骤 2：粘贴配置

将 `nginx-config.conf` 文件的内容粘贴进去，并修改：
- `scraper.yourdomain.com` 改为你的域名
- SSL 证书路径（如果已有证书）

### 步骤 3：测试并重载

```bash
nginx -t
nginx -s reload
```

## 🌐 DNS 配置

### 步骤 1：添加 DNS 记录

登录你的域名服务商（如阿里云、腾讯云、Cloudflare）：

1. 添加 A 记录：
   - **主机记录**：`scraper`
   - **记录类型**：`A`
   - **记录值**：`你的服务器IP`
   - **TTL**：`600`

2. 等待 DNS 生效（通常 5-10 分钟）

### 步骤 2：验证 DNS

在宝塔终端中执行：
```bash
ping scraper.yourdomain.com
```

如果能 ping 通，说明 DNS 已生效。

## ✅ 测试连接

### 测试 HTTP 重定向

```bash
curl -I http://scraper.yourdomain.com
```

应该返回 `301 Moved Permanently`，重定向到 HTTPS。

### 测试 HTTPS

```bash
curl -I https://scraper.yourdomain.com
```

应该返回 `101 Switching Protocols`。

### 测试 WebSocket 连接

使用 WebSocket 客户端测试：
```javascript
const ws = new WebSocket('wss://scraper.yourdomain.com');

ws.on('open', () => {
  console.log('连接成功！');
  
  // 发送认证消息
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-auth-token'
  }));
});

ws.on('message', (data) => {
  console.log('收到消息:', data);
});
```

## 🔒 安全加固

### 1. 限制访问 IP（推荐）

在 Nginx 配置中添加：
```nginx
location / {
    # 只允许特定 IP 访问
    allow 1.2.3.4;      # 你的下注网站服务器 IP
    allow 5.6.7.8;      # 备用服务器 IP
    deny all;
    
    # ... 其他配置
}
```

### 2. 添加访问密码（可选）

```bash
# 安装 htpasswd 工具
yum install -y httpd-tools  # CentOS
apt-get install -y apache2-utils  # Ubuntu

# 创建密码文件
htpasswd -c /www/server/nginx/.htpasswd crown_user
```

在 Nginx 配置中添加：
```nginx
location / {
    auth_basic "Crown Scraper";
    auth_basic_user_file /www/server/nginx/.htpasswd;
    
    # ... 其他配置
}
```

### 3. 限制请求频率

```nginx
# 在 http 块中添加
limit_req_zone $binary_remote_addr zone=crown_limit:10m rate=10r/s;

# 在 location 块中添加
location / {
    limit_req zone=crown_limit burst=20 nodelay;
    
    # ... 其他配置
}
```

## 📊 监控和日志

### 查看访问日志

```bash
tail -f /www/wwwlogs/crown-scraper-access.log
```

### 查看错误日志

```bash
tail -f /www/wwwlogs/crown-scraper-error.log
```

### 分析日志

```bash
# 统计访问次数
cat /www/wwwlogs/crown-scraper-access.log | wc -l

# 统计 IP 访问次数
awk '{print $1}' /www/wwwlogs/crown-scraper-access.log | sort | uniq -c | sort -rn | head -10

# 查看错误日志
grep "error" /www/wwwlogs/crown-scraper-error.log
```

## 🐛 常见问题

### Q1: 502 Bad Gateway

**原因：**
- 后端服务未启动
- 端口配置错误

**解决方法：**
```bash
# 检查服务状态
pm2 status

# 检查端口
netstat -tunlp | grep 8080

# 重启服务
pm2 restart crown-scraper
```

### Q2: 504 Gateway Timeout

**原因：**
- 超时时间设置过短

**解决方法：**
在 Nginx 配置中增加超时时间：
```nginx
proxy_connect_timeout 7d;
proxy_send_timeout 7d;
proxy_read_timeout 7d;
```

### Q3: WebSocket 连接断开

**原因：**
- 缺少 WebSocket 必需的头部

**解决方法：**
确保 Nginx 配置中有：
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Q4: SSL 证书申请失败

**原因：**
- DNS 未生效
- 80 端口未开放
- 域名未备案（中国大陆）

**解决方法：**
1. 确认 DNS 已生效：`ping scraper.yourdomain.com`
2. 确认 80 端口开放：`netstat -tunlp | grep 80`
3. 如果在中国大陆，确保域名已备案

## 🎯 完整配置示例

```nginx
# 上游服务器
upstream crown_scraper_ws {
    server 127.0.0.1:8080;
    keepalive 64;
}

# HTTP 重定向
server {
    listen 80;
    server_name scraper.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS + WebSocket
server {
    listen 443 ssl http2;
    server_name scraper.yourdomain.com;
    
    # SSL 证书
    ssl_certificate /www/server/panel/vhost/cert/scraper.yourdomain.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/scraper.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    ssl_prefer_server_ciphers on;
    
    # 日志
    access_log /www/wwwlogs/crown-scraper-access.log;
    error_log /www/wwwlogs/crown-scraper-error.log;
    
    # WebSocket 代理
    location / {
        # IP 白名单（可选）
        allow 1.2.3.4;  # 你的下注网站 IP
        deny all;
        
        proxy_pass http://crown_scraper_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        proxy_buffering off;
    }
}
```

## 🎉 完成！

现在你可以使用以下地址连接：

- **HTTP**：`http://scraper.yourdomain.com`（自动重定向到 HTTPS）
- **HTTPS**：`https://scraper.yourdomain.com`
- **WebSocket**：`wss://scraper.yourdomain.com`

在下注网站中使用：
```javascript
const ws = new WebSocket('wss://scraper.yourdomain.com');
```

更安全、更专业！

