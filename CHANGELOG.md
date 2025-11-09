# 更新日志

## [1.0.1] - 2024-11-09

### 🐛 Bug 修复

- **修复 TypeScript 编译错误**
  - 在 `CrownScraper.ts` 中添加可选链检查，防止访问 undefined 属性
  - 修复位置：
    - 第 375 行：`markets.full?.handicapLines`
    - 第 387 行：`markets.full?.overUnderLines`
    - 第 405 行：`markets.half?.handicapLines`
    - 第 417 行：`markets.half?.overUnderLines`

### 📚 文档更新

- 新增 `BAOTA-DEPLOY.md` - 宝塔面板部署完整指南
- 新增 `NGINX-SETUP.md` - Nginx 反向代理配置指南
- 新增 `nginx-config.conf` - Nginx 配置模板

### 🚀 新增脚本

- 新增 `baota-deploy.sh` - 宝塔面板一键部署脚本
- 新增 `check-status.sh` - 服务状态检查脚本
- 新增 `fix-and-deploy.sh` - 修复编译错误并重新部署脚本

### 🎯 改进

- 所有脚本添加可执行权限
- 完善错误处理和日志输出
- 添加颜色输出，提升用户体验

---

## [1.0.0] - 2024-11-09

### 🎉 初始版本

- ✅ 完整的皇冠数据抓取服务
- ✅ 支持滚球、今日、早盘三种类型
- ✅ WebSocket 实时推送
- ✅ 多账号管理
- ✅ PM2 进程管理
- ✅ 完整的日志系统
- ✅ 详细的文档

### 核心功能

1. **数据抓取**
   - 登录皇冠 API
   - 获取赛事列表
   - 解析赛事数据
   - 获取赔率信息

2. **WebSocket 服务**
   - 实时推送数据变化
   - 支持认证和订阅
   - 心跳检测
   - 自动重连

3. **数据管理**
   - 变化检测（新增、删除、更新）
   - 比分更新推送
   - 赔率变化推送
   - 内存缓存

4. **部署支持**
   - PM2 进程管理
   - 开机自启动
   - 日志轮转
   - 健康检查

### 文档

- `README.md` - 完整使用文档
- `QUICKSTART.md` - 快速开始指南
- `IMPLEMENTATION.md` - 实现报告
- `client-example.ts` - 客户端示例
- `test-scraper.ts` - 测试脚本

### 配置

- `.env.example` - 环境变量模板
- `ecosystem.config.js` - PM2 配置
- `tsconfig.json` - TypeScript 配置
- `package.json` - 项目依赖

---

## 升级指南

### 从 1.0.0 升级到 1.0.1

1. **拉取最新代码**
   ```bash
   cd /www/wwwroot/crown-scraper-service
   git pull origin main
   ```

2. **运行修复脚本**
   ```bash
   bash fix-and-deploy.sh
   ```

3. **验证服务**
   ```bash
   bash check-status.sh
   ```

### 注意事项

- 升级过程中服务会短暂重启（约 3-5 秒）
- 不需要修改 `.env` 配置
- 不需要重新安装依赖
- WebSocket 客户端会自动重连

---

## 已知问题

### 1.0.1

- 无已知问题

### 1.0.0

- ✅ TypeScript 编译错误（已在 1.0.1 修复）

---

## 路线图

### 计划中的功能

- [ ] 支持更多赔率类型（波胆、半全场等）
- [ ] 添加数据持久化（Redis/PostgreSQL）
- [ ] 添加 Web 管理界面
- [ ] 支持多个皇冠站点
- [ ] 添加数据统计和分析
- [ ] 支持 Docker 部署
- [ ] 添加单元测试
- [ ] 添加性能监控

### 考虑中的功能

- [ ] 支持其他博彩平台
- [ ] 添加赔率对比功能
- [ ] 添加套利机会检测
- [ ] 支持移动端推送
- [ ] 添加 Telegram Bot 集成

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 报告 Bug

请提供以下信息：
- 操作系统和版本
- Node.js 版本
- 错误日志
- 复现步骤

### 提交功能请求

请描述：
- 功能需求
- 使用场景
- 预期效果

---

## 许可证

MIT License

---

## 联系方式

如有问题，请通过以下方式联系：
- 提交 GitHub Issue
- 发送邮件

---

**感谢使用皇冠数据抓取服务！** 🎉

