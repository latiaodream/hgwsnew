import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { AccountConfig, Match, ShowType, Markets } from '../types';
import logger from '../utils/logger';
import { parseStringPromise } from 'xml2js';

type RiskFlag = 'check_emnu' | 'double_login' | 'html_block';

/**
 * 皇冠数据抓取器
 * 负责从皇冠网站抓取赛事数据
 */
export class CrownScraper {
  private account: AccountConfig;
  private client: AxiosInstance;
  private isLoggedIn: boolean = false;
  private cookies: string = '';
  private uid: string = '';
  private version: string = '';
  private baseUrl: string = '';
  private baseUrlCandidates: string[] = [];
  private candidateIndex: number = 0;
  private siteUrl: string = '';
  private siteUrlCandidates: string[] = [];
  private siteIndex: number = 0;
  private suspendedUntil: number = 0;
  private suspensionReason: string = '';
  private lastSuspensionLog?: { context: string; time: number };
  private lastLoginTs?: number;
  private loginFailCount: number = 0; // 连续登录失败次数
  private enableMoreMarkets: boolean;
  private moreMarketsStartDelayMs: number;
  private moreMarketsIntervalMs: number;
  private lastMoreMarketTs: number = 0;
  private maxConcurrentMoreMarkets: number;
  private inflightMoreMarkets = 0;
  private successfulTransformPath: string = ''; // 记录成功的 transform.php 路径

  constructor(account: AccountConfig) {
    this.account = account;

    this.baseUrlCandidates = this.resolveBaseUrlCandidates();
    this.baseUrl = this.baseUrlCandidates[0] || (process.env.CROWN_API_BASE_URL || 'https://hga038.com');

    // Site URL 候选
    this.siteUrlCandidates = this.resolveSiteUrlCandidates();
    this.siteUrl = this.siteUrlCandidates[0] || this.baseUrl;

    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

    // 代理支持
    const proxyAgent = this.createProxyAgent();

    // 增加超时时间，避免频繁超时
    const timeout = parseInt(process.env.API_TIMEOUT_MS || '60000', 10);

    // 优化：启用 Keep-Alive
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 256,
      maxFreeSockets: 256,
      scheduling: 'lifo',
      timeout: timeout
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: timeout, // 默认60秒，可通过环境变量配置
      httpsAgent: proxyAgent || httpsAgent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        'Connection': 'keep-alive'
      },
    });

    logger.info(`[${this.account.showType}] 使用基础域名: ${this.baseUrl}`);

    // 添加响应拦截器来自动保存 Cookie
    this.client.interceptors.response.use(
      (response) => {
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader && Array.isArray(setCookieHeader)) {
          const cookieValues = setCookieHeader.map(cookie => {
            const parts = cookie.split(';');
            return parts[0];
          });
          this.cookies = cookieValues.join('; ');
          logger.debug(`[${this.account.showType}] 保存 Cookie`);
        }
        return response;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // live 默认强制开启更多盘口，today/early 仍然由环境变量控制
    const autoEnableForLive = this.account.showType === 'live';
    this.enableMoreMarkets = autoEnableForLive || this.resolveMoreMarketsFlag();
    this.moreMarketsStartDelayMs = this.resolveStartDelay();
    this.moreMarketsIntervalMs = this.resolveThrottleInterval();
    this.maxConcurrentMoreMarkets = this.resolveConcurrentLimit();

    if (this.enableMoreMarkets) {
      logger.info(`[${this.account.showType}] 已启用更多盘口抓取 (enableMoreMarkets=${this.enableMoreMarkets}, autoByShowType=${autoEnableForLive})`);
    } else {
      logger.info(`[${this.account.showType}] 未启用更多盘口抓取 (enableMoreMarkets=${this.enableMoreMarkets}, autoByShowType=${autoEnableForLive})`);
    }

    // 添加请求拦截器来自动发送 Cookie
    this.client.interceptors.request.use(
      (config) => {
        if (this.cookies) {
          config.headers['Cookie'] = this.cookies;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  /**
   * 统一的 transform.php 请求
   * 404/405 时按以下路径依次回退：
   * 1) /transform.php?ver=...
   * 2) /transform.php
   * 3) /app/member/transform.php?ver=...
   * 4) /app/member/transform.php
   */
  private async postTransform(body: string, config: any = {}): Promise<any> {
    // 如果已经有成功的路径，优先使用
    if (this.successfulTransformPath) {
      try {
        logger.debug(`[${this.account.showType}] POST ${this.successfulTransformPath} (cached)`);
        return await this.client.post(this.successfulTransformPath, body, config);
      } catch (err: any) {
        const status = err?.response?.status;
        // 如果缓存的路径失败了（404/405），清除缓存并尝试其他路径
        if (status === 404 || status === 405) {
          logger.debug(`[${this.account.showType}] 缓存路径失效，重新探测`);
          this.successfulTransformPath = '';
        } else {
          // 其他错误直接抛出
          throw err;
        }
      }
    }

    // 尝试所有可能的路径
    const paths = [
      `/transform.php?ver=${this.version}`,
      `/transform.php`,
      `/api/transform.php?ver=${this.version}`,
      `/api/transform.php`,
      `/app/member/transform.php?ver=${this.version}`,
      `/app/member/transform.php`,
      `/app/member/api/transform.php?ver=${this.version}`,
      `/app/member/api/transform.php`,
    ];

    let lastErr: any = null;

    for (const path of paths) {
      try {
        logger.debug(`[${this.account.showType}] POST ${path}`);
        const response = await this.client.post(path, body, config);
        // 成功了，记录这个路径
        this.successfulTransformPath = path;
        logger.info(`[${this.account.showType}] ✅ 找到可用路径: ${path}`);
        return response;
      } catch (err: any) {
        lastErr = err;
        const status = err?.response?.status;
        if (status === 404 || status === 405) {
          logger.debug(`[${this.account.showType}] ${path} 返回 ${status}，尝试下一个路径`);
          continue;
        }
        // 其他错误不再回退，直接抛出
        throw err;
      }
    }

    // 所有路径都失败，抛出最后一个错误
    throw lastErr || new Error('All transform.php paths failed');
  }



  /**
   * 创建代理 Agent（支持 HTTP/HTTPS/SOCKS5）
   */
  private createProxyAgent(): any {
    const showTypeProxyKey = `${this.account.showType.toUpperCase()}_CROWN_PROXY_URL`;
    const showTypeProxy = (process.env as any)[showTypeProxyKey] as string | undefined;
    const proxyUrl = this.account.proxyUrl || showTypeProxy || process.env.CROWN_PROXY_URL;
    if (!proxyUrl) return null;

    try {
      if (proxyUrl.startsWith('socks://') || proxyUrl.startsWith('socks5://')) {
        logger.info(`[${this.account.showType}] 使用 SOCKS5 代理: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);
        return new SocksProxyAgent(proxyUrl, { rejectUnauthorized: false } as any);
      } else if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
        logger.info(`[${this.account.showType}] 使用 HTTP(S) 代理: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);
        return new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false } as any);
      } else {
        logger.warn(`[${this.account.showType}] 不支持的代理协议: ${proxyUrl}`);
        return null;
      }
    } catch (err: any) {
      logger.error(`[${this.account.showType}] 创建代理 Agent 失败: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * 解析基础 URL 候选
   */
  private resolveBaseUrlCandidates(): string[] {
    // 优先 candidates env
    const candidatesEnv = process.env.CROWN_API_BASE_URL_CANDIDATES;
    const fromEnvCandidates = candidatesEnv ? candidatesEnv.split(',').map(s => s.trim()).filter(Boolean) : [];

    // 单个 base url
    const singleBase = process.env.CROWN_API_BASE_URL ? [process.env.CROWN_API_BASE_URL.trim()] : [];

    // 如果明确配置了 CROWN_API_BASE_URL 或 CROWN_API_BASE_URL_CANDIDATES，则不使用内置备用域名
    if (singleBase.length > 0 || fromEnvCandidates.length > 0) {
      const all = [...singleBase, ...fromEnvCandidates];
      const uniq: string[] = [];
      for (const url of all) {
        if (url && !uniq.includes(url)) uniq.push(url);
      }
      return uniq.length ? uniq : ['https://hga026.com'];
    }

    // 内置备用域名（仅在未配置环境变量时使用）
    // hga050.com 放在第一位，因为测试确认可用
    const builtins = [
      'https://hga050.com',
      'https://hga026.com', 'https://hga027.com', 'https://hga030.com', 'https://hga035.com', 'https://hga038.com', 'https://hga039.com',
      'https://mos011.com', 'https://mos022.com', 'https://mos033.com', 'https://mos055.com', 'https://mos066.com', 'https://mos100.com'
    ];
    return builtins;
  }

  /**
   * 切换到下一个可用域名
   */
  private switchToNextBaseUrl(): void {
    this.candidateIndex = (this.candidateIndex + 1) % this.baseUrlCandidates.length;
    this.baseUrl = this.baseUrlCandidates[this.candidateIndex];
    this.client.defaults.baseURL = this.baseUrl;
    logger.warn(`[${this.account.showType}] 切换基础域名 -> ${this.baseUrl}`);
  }

  /**
   * 解析 Site URL 候选
   */
  private resolveSiteUrlCandidates(): string[] {
    const single = process.env.CROWN_SITE_URL ? [process.env.CROWN_SITE_URL.trim()] : [];
    const envs = process.env.CROWN_SITE_URL_CANDIDATES ? process.env.CROWN_SITE_URL_CANDIDATES.split(',').map(s => s.trim()).filter(Boolean) : [];

    // 如果明确配置了 CROWN_SITE_URL 或 CROWN_SITE_URL_CANDIDATES，则不使用内置备用域名
    if (single.length > 0 || envs.length > 0) {
      const all = [...single, ...envs];
      const uniq: string[] = [];
      for (const u of all) { if (u && !uniq.includes(u)) uniq.push(u); }
      return uniq.length ? uniq : [this.baseUrl];
    }

    // 内置备用域名（仅在未配置环境变量时使用）
    // hga050.com 放在第一位，因为测试确认可用
    const builtins = [
      'https://hga050.com',
      'https://hga026.com', 'https://hga027.com', 'https://hga030.com', 'https://hga035.com', 'https://hga038.com', 'https://hga039.com',
      'https://mos011.com', 'https://mos022.com', 'https://mos033.com', 'https://mos055.com', 'https://mos066.com', 'https://mos100.com'
    ];
    return builtins;
  }


  /**
   * 获取版本号
   */
  private async getVersion(): Promise<void> {
    // 优先使用环境变量指定的版本号
    const envVersion = process.env.CROWN_API_VERSION;
    if (envVersion) {
      this.version = envVersion.trim();
      logger.debug(`[${this.account.showType}] 使用环境变量版本号: ${this.version}`);
      return;
    }

    // 直接使用默认版本号（皇冠首页需要 JS 跳转，无法直接获取版本号）
    this.version = '2025-10-16-fix342_120';
    logger.debug(`[${this.account.showType}] 使用默认版本号: ${this.version}`);
  }

  /**
   * 获取 BlackBox
   */
  private async getBlackBox(): Promise<string> {
    // 生成类似真实 BlackBox 的字符串
    const timestamp = Date.now();
    const random1 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random3 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random4 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random5 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const fakeBlackBox = `0400${random1}${random2}@${random3}@${random4};${random5}${timestamp}`;
    logger.debug(`[${this.account.showType}] 生成 BlackBox，长度: ${fakeBlackBox.length}`);
    return fakeBlackBox;
  }

  /**
   * 解析 XML 响应，并尝试自动修复不规范的 & 字符
   */
  private async parseXmlResponse(xml: string): Promise<any> {
    try {
      const trimmed = xml.trim();
      // 有些域名（例如 hga026）的 transform.php 会直接返回 HTML 检测页，这里直接抛出特殊错误
      if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
        throw new Error('HTML_RESPONSE_NOT_XML');
      }

      // 部分 transform.php 响应中可能出现未转义的 &xxx 实体，导致 "Invalid character in entity name"
      // 这里先把非标准 XML 实体的 & 转成 &amp;，避免解析直接抛错
      const sanitizedXml = xml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');

      const result = await parseStringPromise(sanitizedXml, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
      });
      return result.serverresponse || result;
    } catch (error: any) {
      logger.error(`[${this.account.showType}] XML 解析失败:`, error.message);
      throw error;
    }
  }

  /**
   * 预热站点以拿到必要 Cookie（有些站点需要进入 /app/member/ 才会下发路由/语言相关 Cookie）
   */
  private async warmUp(): Promise<void> {
    const warmPaths = [
      '/',
      '/app/member/',
      '/app/member/mem_login.php?langx=zh-cn',
      '/app/member/index.php?langx=zh-cn'
    ];
    for (const p of warmPaths) {
      try {
        await this.client.get(p);
        logger.debug(`[${this.account.showType}] 预热: GET ${p} 成功`);
      } catch (e: any) {
        const s = e?.response?.status;
        logger.debug(`[${this.account.showType}] 预热: GET ${p} 失败${s ? '，状态 ' + s : ''}`);
        // 失败继续尝试下一个预热路径
      }
    }
  }

  /**
   * 登录皇冠账号
   */
  async login(): Promise<boolean> {
    // 如果账号正处于冷却期，直接跳过登录
    if (this.shouldSkipBecauseSuspended('login')) {
      return false;
    }

    // 按候选域名循环尝试登录
    for (let attempt = 0; attempt < this.baseUrlCandidates.length; attempt++) {
      try {
        logger.info(`[${this.account.showType}] 🔐 开始登录: ${this.account.username} @ ${this.baseUrl}`);

        const disableWarmup = (process.env.DISABLE_WARMUP || '').toLowerCase();
        const isWarmupDisabled = ['1', 'true', 'yes', 'on'].includes(disableWarmup);

        if (!isWarmupDisabled) {
          try {
            await this.warmUp();
          } catch (_) {
            // 忽略预热失败
          }
        } else {
          logger.debug(`[${this.account.showType}] 跳过预热 (DISABLE_WARMUP=1)`);
        }

        // 获取最新版本号
        await this.getVersion();

        // 获取 BlackBox
        const blackbox = await this.getBlackBox();

        // Base64 编码 UserAgent
        const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
        const encodedUA = Buffer.from(userAgent).toString('base64');

        // 构建请求参数
        const params = new URLSearchParams({
          p: 'chk_login',
          langx: 'zh-tw',  // 使用繁体中文版本（与投注系统一致）
          ver: this.version,
          username: this.account.username,
          password: this.account.password,
          app: 'N',
          auto: 'CFHFID',
          blackbox,
          userAgent: encodedUA,
        });

        const url = `/transform.php?ver=${this.version}`;
        logger.debug(`[${this.account.showType}] 🔄 尝试登录: POST ${this.baseUrl}${url}`);
        const response = await this.postTransform(params.toString());
        const data = await this.parseXmlResponse(response.data);

        const loginResponse = data as any;
        logger.info(`[${this.account.showType}] 📥 登录响应:`, {
          status: loginResponse.status,
          msg: loginResponse.msg,
          username: loginResponse.username,
          uid: loginResponse.uid,
        });

        if (loginResponse.msg === '100' && loginResponse.status !== 'success') {
          loginResponse.status = 'success';
        }

        if (loginResponse.status === 'success' || loginResponse.msg === '100' || loginResponse.msg === '109') {
          this.isLoggedIn = true;
          this.uid = loginResponse.uid;
          this.lastLoginTs = Date.now();
          this.loginFailCount = 0; // 成功后清零失败计数
          logger.info(`[${this.account.showType}] ✅ 登录成功，UID: ${this.uid}, baseUrl: ${this.baseUrl}`);
          return true;
        }

        if (loginResponse.msg === '109') {
          logger.warn(`[${this.account.showType}] ⚠️ 需要修改密码`);
          this.handleLoginFailure('需要修改密码');
          return false;
        }

        const msg = loginResponse.msg || loginResponse.err || '未知错误';
        logger.error(`[${this.account.showType}] ❌ 登录失败: ${msg}`);
        this.handleLoginFailure(msg);
        return false;
      } catch (error: any) {
        const status = error?.response?.status;
        const code = error?.code;
        const errorMsg = error?.message || String(error);
        logger.error(`[${this.account.showType}] ❌ 登录异常: ${errorMsg} @ ${this.baseUrl}`);
        if (status) logger.error(`[${this.account.showType}] 响应状态码: ${status}`);
        if (error?.response?.statusText) logger.error(`[${this.account.showType}] 响应状态文本: ${error.response.statusText}`);

        const responseData = error?.response?.data;
        if (responseData) {
          if (typeof responseData === 'string') {
            logger.error(`[${this.account.showType}] 响应数据: ${responseData.substring(0, 500)}`);
          } else {
            logger.error(`[${this.account.showType}] 响应数据: ${JSON.stringify(responseData).substring(0, 500)}`);
          }
        }
        if (code) logger.error(`[${this.account.showType}] 错误代码: ${code}`);

        // XML 解析失败 / HTML 检测页等情况，也视为当前域名不可用，切换下一个候选域名
        if (errorMsg.includes('HTML_RESPONSE_NOT_XML') ||
          errorMsg.includes('Invalid character in entity name') ||
          errorMsg.includes('Unencoded <')) {
          logger.warn(`[${this.account.showType}] 当前域名返回非预期 XML，尝试切换下一个基础域名...`);
          this.switchToNextBaseUrl();
          continue;
        }

        // 遇到 404/405/502/503 之类，切换下一个域名再试
        if ([404, 405, 502, 503].includes(status)) {
          this.switchToNextBaseUrl();
          continue;
        }

        // 其他错误不再重试
        this.handleLoginFailure(errorMsg || code || '未知异常');
        return false;
      }
    }

    // 所有候选都失败
    this.handleLoginFailure('所有基础域名登录失败');
    return false;
  }

  /**
   * 登出账号
   */
  async logout(): Promise<void> {
    if (!this.isLoggedIn || !this.uid) {
      logger.debug(`[${this.account.showType}] 未登录，无需登出`);
      return;
    }

    const uid = this.uid;

    try {
      logger.info(`[${this.account.showType}] 🚪 开始登出 (UID: ${uid})...`);

      // 构建登出参数
      const params = new URLSearchParams({
        p: 'logout',
        uid: uid,
        ver: this.version,
        langx: 'zh-cn',
      });

      try {
        // 使用 postTransform 方法，它会自动使用成功的路径
        await this.postTransform(params.toString());
        logger.info(`[${this.account.showType}] ✅ 登出 API 调用成功`);
      } catch (apiError: any) {
        // 登出 API 可能不存在或返回错误，这是正常的
        // 只在 debug 级别记录，避免日志噪音
        logger.debug(`[${this.account.showType}] 登出 API 调用失败: ${apiError.message}`);
      }

    } catch (error: any) {
      logger.error(`[${this.account.showType}] ❌ 登出过程出错: ${error.message}`);
    } finally {
      // 无论 API 调用是否成功，都清除本地登录状态
      this.isLoggedIn = false;
      this.uid = '';
      this.cookies = '';
      logger.info(`[${this.account.showType}] ✅ 本地登录状态已清除`);
    }
  }

  /**
   * 按类型获取赛事列表（用于轮询模式）
   */
  async fetchMatchesByType(showType: ShowType): Promise<Match[]> {
    // 临时修改 showType
    const originalShowType = this.account.showType;
    this.account.showType = showType;

    try {
      const matches = await this.fetchMatches();
      return matches;
    } finally {
      // 恢复原始 showType
      this.account.showType = originalShowType;
    }
  }

  /**
   * 获取赛事列表（可指定日期）
   * @param date 日期字符串，格式：YYYY-MM-DD，留空表示当前
   */
  async fetchMatches(date?: string): Promise<Match[]> {
    if (this.shouldSkipBecauseSuspended('get_game_list')) {
      return [];
    }

    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('登录失败');
      }
    }

    // 超时重试机制：最多重试2次
    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`[${this.account.showType}] 开始抓取赛事数据 (尝试 ${attempt}/${maxRetries})`);

        const timestamp = Date.now().toString();
        const showTypeParam = this.getShowTypeParam();

        // 构建请求参数
        const params = new URLSearchParams({
          uid: this.uid,
          ver: this.version,
          langx: 'zh-cn',
          p: 'get_game_list',
          p3type: '',
          date: date || '', // 使用传入的日期参数
          gtype: 'ft', // 足球
          showtype: showTypeParam.showtype,
          rtype: showTypeParam.rtype,
          ltype: '3',
          filter: '',
          cupFantasy: 'N',
          sorttype: 'L',
          specialClick: '',
          isFantasy: 'N',
          ts: timestamp,
        });

        logger.debug(`[${this.account.showType}] 请求参数:`, {
          showtype: showTypeParam.showtype,
          rtype: showTypeParam.rtype,
        });

        const response = await this.postTransform(params.toString(), {
          headers: {
            'Cookie': this.cookies,
          },
        });

        // 成功了，跳出重试循环
        lastError = null;

        const risk = this.detectRiskResponse(response.data);
        if (risk) {
          this.handleRiskyResponse(risk, `get_game_list/${this.account.showType}`);
          return [];
        }

        // 解析 XML 响应
        const data = await this.parseXmlResponse(response.data);

        // 检查是否有错误
        if (data.err) {
          logger.error(`[${this.account.showType}] API 返回错误: ${data.err}`);

          // 如果是登录过期，重新登录
          if (data.err.includes('login') || data.err.includes('登录')) {
            this.isLoggedIn = false;
            throw new Error('登录已过期');
          }

          return [];
        }

        const matches = this.parseMatches(data);

        if (this.enableMoreMarkets) {
          await this.enrichMatchesWithMoreMarkets(matches);
        }

        logger.info(`[${this.account.showType}] 抓取到 ${matches.length} 场赛事`);

        return matches;

      } catch (error: any) {
        lastError = error;

        // 如果是认证错误，重新登录，不重试
        if (error.response?.status === 401 || error.message?.includes('登录')) {
          this.isLoggedIn = false;
          throw error;
        }

        // 如果是超时错误，记录并重试
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        if (isTimeout && attempt < maxRetries) {
          logger.warn(`[${this.account.showType}] 请求超时，${attempt}/${maxRetries} 次尝试失败，等待 2 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // 其他错误或最后一次尝试失败，抛出错误
        if (attempt === maxRetries) {
          const errorMsg = error?.message || String(error);
          const errorCode = error?.code;
          logger.error(`[${this.account.showType}] 抓取失败 (${maxRetries}次尝试): ${errorMsg}${errorCode ? ` (${errorCode})` : ''}`);
          throw error;
        }
      }
    }

    // 不应该到这里，但为了类型安全
    throw lastError || new Error('抓取失败');
  }

  private async enrichMatchesWithMoreMarkets(matches: Match[]): Promise<void> {
    if (!Array.isArray(matches) || matches.length === 0) return;

    // 先筛选出明确有更多盘口的赛事（MORE > 0）
    const candidates = matches.filter(match => this.hasMoreMarketsFlag(match));
    if (candidates.length === 0) {
      logger.debug(`[${this.account.showType}] 当前没有标记 MORE>0 的赛事，跳过更多盘口抓取`);
      return;
    }

    const limitEnv = process.env.MORE_MARKETS_LIMIT;
    let maxCount = candidates.length;

    if (limitEnv !== undefined) {
      const parsedLimit = Number(limitEnv);
      if (Number.isFinite(parsedLimit)) {
        if (parsedLimit > 0) {
          maxCount = Math.min(parsedLimit, candidates.length);
        } else if (parsedLimit < 0) {
          logger.debug(`[${this.account.showType}] MORE_MARKETS_LIMIT < 0, 跳过更多盘口抓取`);
          return;
        }
      }
    }

    const targets = candidates.slice(0, maxCount);

    for (const match of targets) {
      if (this.isSuspended()) {
        logger.warn(`[${this.account.showType}] 账号冷却中，跳过更多盘口抓取`);
        break;
      }

      const now = Date.now();
      if (this.moreMarketsStartDelayMs > 0 && now - (this.lastLoginTs || 0) < this.moreMarketsStartDelayMs) {
        logger.debug(`[${this.account.showType}] 多盘口延迟期内，跳过 ${match.gid}`);
        continue;
      }

      if (this.inflightMoreMarkets >= this.maxConcurrentMoreMarkets) {
        break;
      }

      const diff = now - this.lastMoreMarketTs;
      if (diff < this.moreMarketsIntervalMs) {
        await new Promise(resolve => setTimeout(resolve, this.moreMarketsIntervalMs - diff));
      }

      let extraMarkets: Markets | null = null;

      const moreMarkets = await this.fetchMoreMarkets(match);
      if (moreMarkets) {
        extraMarkets = moreMarkets;
      } else if (match.showType === 'live' && this.hasMoreMarketsFlag(match)) {
        // 对于 live 且 MORE>0 的赛事，再尝试一次 get_game_OBT（浏览器前端使用的多盘口接口）
        const obtMarkets = await this.fetchObtMarkets(match);
        if (obtMarkets) {
          extraMarkets = obtMarkets;
        }
      }

      if (extraMarkets) {
        match.markets = this.mergeMarkets(match.markets || {}, extraMarkets);
      }

      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }

  private mergeMarkets(base: Markets, incoming: Markets): Markets {
    const merged: Markets = {
      moneyline: base.moneyline ? { ...base.moneyline } : undefined,
      full: base.full ? { ...base.full } : {},
      half: base.half ? { ...base.half } : {},
    };

    if (incoming.moneyline) {
      merged.moneyline = { ...(merged.moneyline || {}), ...incoming.moneyline };
    }

    // 合并盘口数组时顺便去重，避免主盘口和更多盘口返回完全相同的行导致前端重复显示
    const mergeLineArray = <T>(target?: T[], addition?: T[]): T[] | undefined => {
      const combined: T[] = [];
      if (target && target.length) combined.push(...target);
      if (addition && addition.length) combined.push(...addition);

      if (!combined.length) {
        return target;
      }

      const seen = new Set<string>();
      const result: T[] = [];

      for (const item of combined) {
        if (item == null) continue;
        const key = JSON.stringify(item);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
      }

      return result;
    };

    if (incoming.full) {
      merged.full = merged.full || {};
      merged.full.handicapLines = mergeLineArray(merged.full.handicapLines, incoming.full.handicapLines);
      merged.full.overUnderLines = mergeLineArray(merged.full.overUnderLines, incoming.full.overUnderLines);
    }

    if (incoming.half) {
      merged.half = merged.half || {};
      merged.half.handicapLines = mergeLineArray(merged.half.handicapLines, incoming.half.handicapLines);
      merged.half.overUnderLines = mergeLineArray(merged.half.overUnderLines, incoming.half.overUnderLines);
    }

    return merged;
  }

  private async fetchMoreMarkets(match: Match): Promise<Markets | null> {
    if (this.shouldSkipBecauseSuspended('get_game_more')) {
      return null;
    }
    if (!match?.gid) return null;
    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        return null;
      }
    }

    try {
      this.inflightMoreMarkets++;
      const isLive = match.showType === 'live';
      const lid = match.lid || match.raw?.game?.LID || match.raw?.game?.lid || match.raw?.LID || match.raw?.lid;
      const ecid =
        match.raw?.game?.ECID ||
        match.raw?.game?.ecid ||
        match.raw?.league?.ECID ||
        match.raw?.league?.ecid ||
        match.raw?.ECID ||
        match.raw?.ecid;

      const attempts = this.buildMoreMarketAttempts(ecid, lid);

      for (const attempt of attempts) {
        const attemptLabel = attempt.label || 'unknown';
        const maxRetries = 2;

        for (let retry = 1; retry <= maxRetries; retry++) {
          try {
            const params = new URLSearchParams({
              uid: this.uid,
              ver: this.version,
              langx: attempt.langx || 'zh-cn',
              p: 'get_game_more',
              gtype: 'ft', // 与文档示例保持一致
              showtype: isLive ? 'live' : match.showType,
              ltype: '3',
              isRB: isLive ? 'Y' : 'N',
              from: 'game_more',
              mode: 'NORMAL',
              // live 用空 filter 拉全部滚球盘口，today/early 仍然只拉 Main
              filter: isLive ? '' : 'Main',
              specialClick: '',
              ts: Date.now().toString(),
            });

            if (attempt.includeLid !== false && lid) {
              params.set('lid', String(lid));
            }
            if (attempt.useEcid && ecid) {
              params.set('ecid', String(ecid));
            }
            if (attempt.useGid !== false) {
              params.set('gid', match.gid);
            }

            const response = await this.postTransform(params.toString(), {
              headers: {
                'Cookie': this.cookies,
              },
            });

            this.lastMoreMarketTs = Date.now();

            // 调试：无论解析是否成功，都把原始文本截断后挂到 raw.moreMarketsRaw，方便排查
            try {
              let rawText: string | null = null;
              if (typeof response.data === 'string') {
                rawText = response.data;
              } else if (Buffer.isBuffer(response.data)) {
                rawText = response.data.toString('utf8');
              }
              if (rawText) {
                (match as any).raw = (match as any).raw || {};
                (match as any).raw.moreMarketsRaw = rawText.slice(0, 4000);
              }
            } catch {
              // ignore
            }

            const risk = this.detectRiskResponse(response.data);
            if (risk) {
              this.handleRiskyResponse(risk, `get_game_more/${match.showType}`);
              return null;
            }

            const text = typeof response.data === 'string' ? response.data : '';
            if (!text || !text.includes('<game')) {
              // 当前尝试没有返回有效盘口，换下一个组合
              break;
            }

            let parsed;
            try {
              parsed = await this.parseXmlResponse(response.data);
            } catch (error: any) {
              logger.warn(
                `[${this.account.showType}] 解析 get_game_more XML 失败 (GID: ${match.gid}, attempt=${attemptLabel}): ${
                  error?.message || error
                }`
              );
              // 当前 attempt 没解析成功，换下一个组合
              break;
            }

            const serverResponse = parsed?.serverresponse || parsed;
            const markets = this.parseMoreMarkets(serverResponse);
            if (markets) {
              // 调试用途：把更多盘口的原始返回也挂到 match.raw 里，方便通过 /api/matches/:gid 查看结构
              try {
                (match as any).raw = (match as any).raw || {};
                (match as any).raw.moreMarkets = serverResponse;
              } catch {
                // ignore
              }
              return markets;
            }

            // 正常返回但没有解析到盘口，结束本 attempt，尝试下一个
            break;
          } catch (error: any) {
            const msg = error?.message || String(error);
            const code = (error as any)?.code;
            const isTimeout = code === 'ECONNABORTED' || msg.includes('timeout');
            const isSocketClosed =
              msg.includes('Socket closed') ||
              msg.includes('socket hang up') ||
              code === 'ECONNRESET' ||
              code === 'EPIPE';

            if ((isTimeout || isSocketClosed) && retry < maxRetries) {
              logger.warn(
                `[${this.account.showType}] get_game_more 网络错误重试 (${attemptLabel}, GID: ${
                  match.gid
                }, retry=${retry}/${maxRetries}): ${msg}${code ? ` (${code})` : ''}`
              );
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }

            // 非瞬时错误或已到最大重试次数，记录并放弃当前 attempt
            logger.warn(
              `[${this.account.showType}] get_game_more 调用失败 (${attemptLabel}, GID: ${
                match.gid
              }): ${msg}${code ? ` (${code})` : ''}`
            );

            if (error?.response?.status === 401 || msg.includes('登录')) {
              this.isLoggedIn = false;
            }

            // 结束当前 attempt，继续下一个 attempts 组合
            break;
          }
        }
      }

      logger.warn(`[${this.account.showType}] get_game_more 多次尝试仍未获取到盘口 (GID: ${match.gid})`);
      return null;
    } catch (error: any) {
      const msg = error?.message || String(error);
      logger.warn(`[${this.account.showType}] 获取更多盘口失败 (GID: ${match.gid}): ${msg}`);
      return null;
    } finally {
      this.inflightMoreMarkets = Math.max(0, this.inflightMoreMarkets - 1);
    }
  }


  private async fetchObtMarkets(match: Match): Promise<Markets | null> {
    if (this.shouldSkipBecauseSuspended('get_game_OBT')) {
      return null;
    }
    if (!match?.gid) return null;
    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        return null;
      }
    }

    try {
      this.inflightMoreMarkets++;
      const isLive = match.showType === 'live';
      const ecid =
        match.raw?.game?.ECID ||
        match.raw?.game?.ecid ||
        match.raw?.league?.ECID ||
        match.raw?.league?.ecid ||
        match.raw?.ECID ||
        match.raw?.ecid;

      if (!ecid) {
        return null;
      }

      const params = new URLSearchParams({
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        p: 'get_game_OBT',
        gtype: 'ft',
        showtype: isLive ? 'live' : match.showType,
        isSpecial: '',
        isEarly: isLive ? 'N' : (match.showType === 'early' ? 'Y' : 'N'),
        model: 'ROU|MIX',
        isETWI: 'N',
        ecid: String(ecid),
        ltype: '3',
        is_rb: isLive ? 'Y' : 'N',
        ts: Date.now().toString(),
        isClick: 'Y',
      });

      const response = await this.postTransform(params.toString(), {
        headers: {
          Cookie: this.cookies,
        },
      });

      this.lastMoreMarketTs = Date.now();

      // 调试：把 OBT 的原始返回挂到 raw.obtRaw，方便通过 /api/matches/:gid 查看结构
      try {
        let rawText: string | null = null;
        if (typeof response.data === 'string') {
          rawText = response.data;
        } else if (Buffer.isBuffer(response.data)) {
          rawText = response.data.toString('utf8');
        }
        if (rawText) {
          (match as any).raw = (match as any).raw || {};
          (match as any).raw.obtRaw = rawText.slice(0, 4000);
        }
      } catch {
        // ignore
      }

      const risk = this.detectRiskResponse(response.data);
      if (risk) {
        this.handleRiskyResponse(risk, `get_game_OBT/${match.showType}`);
        return null;
      }

      const text = typeof response.data === 'string' ? response.data : '';
      if (!text || !text.includes('<game')) {
        return null;
      }

      let parsed;
      try {
        parsed = await this.parseXmlResponse(response.data);
      } catch (error: any) {
        logger.warn(
          `[${this.account.showType}] 解析 get_game_OBT XML 失败 (GID: ${match.gid}): ${error?.message || error}`
        );
        return null;
      }

      const serverResponse = parsed?.serverresponse || parsed;
      const markets = this.parseMoreMarkets(serverResponse);
      if (markets) {
        try {
          (match as any).raw = (match as any).raw || {};
          (match as any).raw.obt = serverResponse;
        } catch {
          // ignore
        }
        return markets;
      }

      return null;
    } catch (error: any) {
      const msg = error?.message || String(error);
      logger.warn(`[${this.account.showType}] get_game_OBT 调用失败 (GID: ${match.gid}): ${msg}`);
      return null;
    } finally {
      this.inflightMoreMarkets = Math.max(0, this.inflightMoreMarkets - 1);
    }
  }




  /**
   * 获取单场赛事的详细赔率
   */
  async fetchMatchOdds(gid: string): Promise<Markets | null> {
    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        return null;
      }
    }

    try {
      logger.debug(`[${this.account.showType}] 获取赛事赔率 (GID: ${gid})`);

      // 获取独赢赔率
      const params = new URLSearchParams({
        p: 'FT_order_view',
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        odd_f_type: 'H',
        gid: gid,
        gtype: 'FT',
        wtype: this.account.showType === 'live' ? 'RM' : 'M',
        chose_team: 'H',
      });

      const response = await this.postTransform(params.toString(), {
        headers: {
          'Cookie': this.cookies,
        },
      });

      const data = await this.parseXmlResponse(response.data);

      if (data.code === '555' || data.err) {
        logger.debug(`[${this.account.showType}] 赔率不可用 (GID: ${gid})`);
        return null;
      }

      // 构建赔率对象
      const markets: Markets = {
        moneyline: {
          home: this.parseOddsValue(data.ioratio),
          draw: undefined,
          away: undefined,
        },
        full: {
          handicapLines: [],
          overUnderLines: [],
        },
        half: {
          handicapLines: [],
          overUnderLines: [],
        },
      };

      return markets;
    } catch (error: any) {
      logger.error(`[${this.account.showType}] 获取赔率失败 (GID: ${gid}):`, error.message);
      return null;
    }
  }

  /**
   * 解析赛事数据
   */
  private parseMatches(data: any): Match[] {
    const matches: Match[] = [];

    // 检查是否有赛事数据
    if (!data || !data.ec) {
      logger.debug(`[${this.account.showType}] 没有赛事数据`);
      return matches;
    }

    // ec 可能是数组或单个对象
    const leagues = Array.isArray(data.ec) ? data.ec : [data.ec];

    for (const league of leagues) {
      if (!league || !league.game) continue;

      // game 可能是数组或单个对象
      const games = Array.isArray(league.game) ? league.game : [league.game];

      for (const game of games) {
        try {
          const gid = game.GID || game.gid;
          const matchTime = this.parseMatchTime(game.DATETIME || game.datetime);

          const match: Match = {
            gid,
            lid: league.LID || league.lid || game.LID || game.lid,
            home: game.TEAM_H || game.team_h || '',
            home_zh: game.TEAM_H || game.team_h || '',
            away: game.TEAM_C || game.team_c || '',
            away_zh: game.TEAM_C || game.team_c || '',
            league: game.LEAGUE || game.league || '',
            league_zh: game.LEAGUE || game.league || '',
            match_time: matchTime,
            live_status: this.parseLiveStatus(game),
            state: this.parseState(game),
            home_score: this.parseScore(game.SCORE_H || game.score_h),
            away_score: this.parseScore(game.SCORE_C || game.score_c),
            showType: this.account.showType,
            raw: {
              league,
              game,
            },
          };

          // 直接从 get_game_list 的 game 字段解析基础盘（独赢/让球/大小球）
          const markets = this.parseOdds(game);
          if (markets && (
            markets.moneyline ||
            markets.full?.handicapLines?.length ||
            markets.full?.overUnderLines?.length ||
            markets.half?.handicapLines?.length ||
            markets.half?.overUnderLines?.length
          )) {
            match.markets = markets;
          }

          matches.push(match);
        } catch (error: any) {
          logger.warn(`[${this.account.showType}] 解析赛事失败:`, error.message);
        }
      }
    }

    return matches;
  }

  /**
   * 解析比赛时间（转换为 UTC-4 时区）
   */
  private parseMatchTime(datetime: string): string {
    if (!datetime) {
      // 返回当前 GMT-4 时间
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const hour = String(now.getUTCHours()).padStart(2, '0');
      const minute = String(now.getUTCMinutes()).padStart(2, '0');
      const second = String(now.getUTCSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`;
    }

    try {
      // 格式：11-11 03:00p 或 11-11 11:00a
      const cleaned = datetime.replace(/<br>/g, ' ').trim();
      let [date, timeStr] = cleaned.split(/\s+/);

      if (!date || !timeStr) {
        throw new Error('Invalid datetime format');
      }

      // 检查 AM/PM 标记
      const isPM = timeStr.endsWith('p');
      const isAM = timeStr.endsWith('a');
      timeStr = timeStr.replace(/[ap]$/i, ''); // 移除 a/p 后缀

      const [month, day] = date.split('-');
      const [hourStr, minute] = timeStr.split(':');
      let hour = parseInt(hourStr);

      // 处理 PM 时间（12小时制转24小时制）
      if (isPM && hour < 12) {
        hour += 12;
      } else if (isAM && hour === 12) {
        hour = 0;
      }

      const year = new Date().getFullYear();

      // 皇冠时间是美东时间（GMT-4），直接返回 GMT-4 格式的 ISO 字符串
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:00-04:00`;
    } catch (error) {
      logger.warn(`[${this.account.showType}] 解析时间失败: ${datetime}`, error);
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const hour = String(now.getUTCHours()).padStart(2, '0');
      const minute = String(now.getUTCMinutes()).padStart(2, '0');
      const second = String(now.getUTCSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`;
    }
  }

  /**
   * 解析比分
   */
  private parseScore(score: any): number | undefined {
    if (!score || score === '-') return undefined;
    const num = parseInt(score);
    return isNaN(num) ? undefined : num;
  }

  /**
   * 解析赔率数据
   */
  private parseOdds(game: any): Markets | undefined {
    // 辅助函数：从多个候选字段中选择第一个有值的
    const pick = (keys: string[]): any => {
      for (const key of keys) {
        const candidates = [key];
        const lower = key.toLowerCase();
        const upper = key.toUpperCase();

        if (!candidates.includes(lower)) {
          candidates.push(lower);
        }
        if (!candidates.includes(upper)) {
          candidates.push(upper);
        }

        for (const candidate of candidates) {
          if (game[candidate] !== undefined && game[candidate] !== null && game[candidate] !== '') {
            return game[candidate];
          }
        }
      }
      return undefined;
    };

    const markets: Markets = {};

    // 独赢（Moneyline）- 使用小写字段名
    const mh = pick(['ior_rmh', 'ior_mh', 'ratio_mh', 'ratio_rmh']);
    const mn = pick(['ior_rmn', 'ior_rmd', 'ior_mn', 'ratio_mn']);
    const mc = pick(['ior_rmc', 'ior_mc', 'ratio_mc']);

    if (mh || mn || mc) {
      markets.moneyline = {
        home: this.parseOddsValue(mh),
        draw: this.parseOddsValue(mn),
        away: this.parseOddsValue(mc),
      };
    }

    // 全场让球和大小球
    markets.full = {
      handicapLines: [],
      overUnderLines: [],
    };

    // 全场让球 - 主盘口
    const ratioR = pick(['ratio', 'ratio_re', 'ratio_r', 'strong']);
    const ratioRH = pick(['ior_reh', 'ior_rh', 'ratio_rh']);
    const ratioRC = pick(['ior_rec', 'ior_rc', 'ratio_rc']);

    if (ratioR || ratioRH || ratioRC) {
      const hdp = this.parseHandicap(ratioR);
      if (hdp !== null && markets.full?.handicapLines) {
        markets.full.handicapLines.push({
          hdp,
          home: this.parseOddsValue(ratioRH) || 0,
          away: this.parseOddsValue(ratioRC) || 0,
        });
      }
    }

    // 全场让球 - A/B/C/D/E/F 盘口
    const handicapPrefixes = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const prefix of handicapPrefixes) {
      const ratio = pick([`ratio_${prefix}r`, `RATIO_${prefix.toUpperCase()}R`]);
      const home = pick([`ior_${prefix.toUpperCase()}RH`, `IOR_${prefix.toUpperCase()}RH`]);
      const away = pick([`ior_${prefix.toUpperCase()}RC`, `IOR_${prefix.toUpperCase()}RC`]);

      if (ratio || home || away) {
        const hdp = this.parseHandicap(ratio);
        if (hdp !== null && markets.full?.handicapLines) {
          markets.full.handicapLines.push({
            hdp,
            home: this.parseOddsValue(home) || 0,
            away: this.parseOddsValue(away) || 0,
          });
        }
      }
    }

    // 全场大小球 - 主盘口
    const ratioO = pick(['ratio_rouo', 'ratio_rouu', 'ratio_o', 'ratio_u', 'ratio_ouo', 'ratio_ouu']);
    const ratioOUH = pick(['ior_rouh', 'ior_ouh', 'ratio_ouh']);
    const ratioOUC = pick(['ior_rouc', 'ior_ouc', 'ratio_ouc']);

    if (ratioO || ratioOUH || ratioOUC) {
      const hdp = this.parseHandicap(ratioO);
      if (hdp !== null && markets.full?.overUnderLines) {
        markets.full.overUnderLines.push({
          hdp,
          over: this.parseOddsValue(ratioOUC) || 0,  // 注意：大球是 C
          under: this.parseOddsValue(ratioOUH) || 0,  // 小球是 H
        });
      }
    }

    // 全场大小球 - A/B/C/D/E/F 盘口
    const ouPrefixes = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const prefix of ouPrefixes) {
      const ratio = pick([`ratio_${prefix}ouo`, `ratio_${prefix}ouu`, `RATIO_${prefix.toUpperCase()}OUO`]);
      const under = pick([`ior_${prefix.toUpperCase()}OUO`, `IOR_${prefix.toUpperCase()}OUO`]);
      const over = pick([`ior_${prefix.toUpperCase()}OUU`, `IOR_${prefix.toUpperCase()}OUU`]);

      if (ratio || under || over) {
        const hdp = this.parseHandicap(ratio);
        if (hdp !== null && markets.full?.overUnderLines) {
          markets.full.overUnderLines.push({
            hdp,
            over: this.parseOddsValue(over) || 0,
            under: this.parseOddsValue(under) || 0,
          });
        }
      }
    }

    // 半场让球和大小球
    markets.half = {
      handicapLines: [],
      overUnderLines: [],
    };

    // 半场让球 - 主盘口
    const ratioHR = pick(['hratio', 'ratio_hre', 'ratio_hr', 'hstrong']);
    const ratioHRH = pick(['ior_hreh', 'ior_hrh', 'ratio_hrh']);
    const ratioHRC = pick(['ior_hrec', 'ior_hrc', 'ratio_hrc']);

    if (ratioHR || ratioHRH || ratioHRC) {
      const hdp = this.parseHandicap(ratioHR);
      if (hdp !== null && markets.half?.handicapLines) {
        markets.half.handicapLines.push({
          hdp,
          home: this.parseOddsValue(ratioHRH) || 0,
          away: this.parseOddsValue(ratioHRC) || 0,
        });
      }
    }

    // 半场大小球 - 主盘口
    const ratioHO = pick(['ratio_hrouo', 'ratio_hrouu', 'ratio_ho', 'ratio_hu', 'ratio_houo', 'ratio_houu']);
    const ratioHOUH = pick(['ior_hrouh', 'ior_houh', 'ratio_houh']);
    const ratioHOUC = pick(['ior_hrouc', 'ior_houc', 'ratio_houc']);

    if (ratioHO || ratioHOUH || ratioHOUC) {
      const hdp = this.parseHandicap(ratioHO);
      if (hdp !== null && markets.half?.overUnderLines) {
        markets.half.overUnderLines.push({
          hdp,
          over: this.parseOddsValue(ratioHOUC) || 0,
          under: this.parseOddsValue(ratioHOUH) || 0,
        });
      }
    }
    // 半场独赢（Half-time Moneyline）
    const hmh = pick(['ior_hmh', 'ratio_hmh']);
    const hmn = pick(['ior_hmn', 'ratio_hmn']);
    const hmc = pick(['ior_hmc', 'ratio_hmc']);

    if (hmh || hmn || hmc) {
      const halfMoneyline = {
        home: this.parseOddsValue(hmh),
        draw: this.parseOddsValue(hmn),
        away: this.parseOddsValue(hmc),
      };

      // 同时填充到 top-level 和 half 里，方便前端使用 markets.half.moneyline
      markets.halfMoneyline = halfMoneyline;

      if (markets.half) {
        (markets.half as any).moneyline = halfMoneyline;
      } else {
        markets.half = {
          handicapLines: [],
          overUnderLines: [],
          moneyline: halfMoneyline,
        } as any;
      }
    }


    return markets;
  }

  /**
   * 解析更多盘口数据
   */
  private parseMoreMarkets(data: any): Markets | null {
    try {
      if (!data) {
        return null;
      }

      const gameContainer = data.game || data.GAME || data?.serverresponse?.game;
      if (!gameContainer) {
        return null;
      }

      const games = Array.isArray(gameContainer) ? gameContainer : [gameContainer];

      const markets: Markets = {
        full: { handicapLines: [], overUnderLines: [] },
        half: { handicapLines: [], overUnderLines: [] },
      };

      const pickString = (obj: any, keys: string[]): string | undefined => {
        if (!obj) return undefined;
        for (const key of keys) {
          const variants = [key, key.toLowerCase(), key.toUpperCase()];
          for (const variant of variants) {
            const value = obj[variant];
            if (value !== undefined && value !== null && value !== '') {
              return String(value).trim();
            }
          }
        }
        return undefined;
      };

      const isCardOrCornerMarket = (game: any): boolean => {
        const mode = pickString(game, ['@_mode', 'mode']);
        if (mode && ['CN', 'RN'].includes(mode.toUpperCase())) {
          return true;
        }

        const ptype = pickString(game, ['@_ptype', 'ptype']);
        if (ptype && /(角球|罰牌|罚牌)/.test(ptype)) {
          return true;
        }

        const teamH = pickString(game, ['TEAM_H', 'team_h', 'TEAM_H_CN', 'team_h_cn']);
        const teamC = pickString(game, ['TEAM_C', 'team_c', 'TEAM_C_CN', 'team_c_cn']);
        const combined = `${teamH || ''}${teamC || ''}`;
        if (/(角球|罰牌|罚牌)/.test(combined)) {
          return true;
        }

        return false;
      };

      for (const game of games) {
        if (!game) continue;
        if (isCardOrCornerMarket(game)) continue;

        // 全场让球盘口 - 主盘口
        const ratioR = pickString(game, ['RE', 'R', 'ratio']);
        const iorRH = pickString(game, ['ior_REH', 'ior_RH']);
        const iorRC = pickString(game, ['ior_REC', 'ior_RC']);

        if (ratioR && (iorRH || iorRC)) {
          const hdp = this.parseHandicap(ratioR);
          if (hdp !== null) {
            markets.full!.handicapLines = markets.full!.handicapLines || [];
            markets.full!.handicapLines!.push({
              hdp,
              home: this.parseOddsValue(iorRH) || 0,
              away: this.parseOddsValue(iorRC) || 0,
            });
          }
        }

        // 全场让球盘口 - 更多盘 (ARE/BRE/CRE/DRE/ERE/FRE)
        const reAltPrefixes = ['A', 'B', 'C', 'D', 'E', 'F'];
        for (const prefix of reAltPrefixes) {
          const swKey = `sw_${prefix}RE`;
          const swValue = pickString(game, [swKey]);
          if (swValue && swValue.toUpperCase() !== 'Y') {
            continue;
          }

          const ratioAlt = pickString(game, [
            `ratio_${prefix.toLowerCase()}re`,
            `ratio_${prefix.toLowerCase()}r`,
          ]);
          const iorAltH = pickString(game, [
            `ior_${prefix}REH`,
          ]);
          const iorAltC = pickString(game, [
            `ior_${prefix}REC`,
          ]);

          if (!ratioAlt || (!iorAltH && !iorAltC)) {
            continue;
          }

          const hdpAlt = this.parseHandicap(ratioAlt);
          if (hdpAlt !== null) {
            const homeVal = this.parseOddsValue(iorAltH);
            const awayVal = this.parseOddsValue(iorAltC);
            if (homeVal === undefined && awayVal === undefined) {
              continue;
            }
            markets.full!.handicapLines = markets.full!.handicapLines || [];
            markets.full!.handicapLines!.push({
              hdp: hdpAlt,
              home: homeVal || 0,
              away: awayVal || 0,
            });
          }
        }

        // 全场大小球盘口 - 主盘口
        const ratioO = pickString(game, ['ROU', 'OU', 'ratio_o', 'ratio_u']);
        const iorOUH = pickString(game, ['ior_ROUH', 'ior_OUH']);
        const iorOUC = pickString(game, ['ior_ROUC', 'ior_OUC']);

        if (ratioO && (iorOUH || iorOUC)) {
          const hdp = this.parseHandicap(ratioO);
          if (hdp !== null) {
            markets.full!.overUnderLines = markets.full!.overUnderLines || [];
            markets.full!.overUnderLines!.push({
              hdp,
              over: this.parseOddsValue(iorOUC) || 0,
              under: this.parseOddsValue(iorOUH) || 0,
            });
          }
        }

        // 全场大小球盘口 - 更多盘 (AROU/BROU/CROU/DROU/EROU/FROU)
        const ouAltPrefixes = ['A', 'B', 'C', 'D', 'E', 'F'];
        for (const prefix of ouAltPrefixes) {
          const swKey = `sw_${prefix}ROU`;
          const swValue = pickString(game, [swKey]);
          if (swValue && swValue.toUpperCase() !== 'Y') {
            continue;
          }

          const ratioAltO = pickString(game, [
            `ratio_${prefix.toLowerCase()}rouo`,
            `ratio_${prefix.toLowerCase()}rouu`,
          ]);
          const iorAltOUO = pickString(game, [
            `ior_${prefix}ROUO`,
          ]);
          const iorAltOUU = pickString(game, [
            `ior_${prefix}ROUU`,
          ]);

          if (!ratioAltO || (!iorAltOUO && !iorAltOUU)) {
            continue;
          }

          const hdpAltO = this.parseHandicap(ratioAltO);
          if (hdpAltO !== null) {
            const underVal = this.parseOddsValue(iorAltOUO);
            const overVal = this.parseOddsValue(iorAltOUU);
            if (underVal === undefined && overVal === undefined) {
              continue;
            }
            markets.full!.overUnderLines = markets.full!.overUnderLines || [];
            markets.full!.overUnderLines!.push({
              hdp: hdpAltO,
              over: overVal || 0,
              under: underVal || 0,
            });
          }
        }

        // 半场让球盘口
        const ratioHR = pickString(game, ['HRE', 'HR', 'hratio']);
        const iorHRH = pickString(game, ['ior_HREH', 'ior_HRH']);
        const iorHRC = pickString(game, ['ior_HREC', 'ior_HRC']);

        if (ratioHR && (iorHRH || iorHRC)) {
          const hdp = this.parseHandicap(ratioHR);
          if (hdp !== null) {
            markets.half!.handicapLines = markets.half!.handicapLines || [];
            markets.half!.handicapLines!.push({
              hdp,
              home: this.parseOddsValue(iorHRH) || 0,
              away: this.parseOddsValue(iorHRC) || 0,
            });
          }
        }

        // 半场大小球盘口
        const ratioHO = pickString(game, ['HROU', 'HOU', 'hratio_o', 'hratio_u']);
        const iorHOUH = pickString(game, ['ior_HROUH', 'ior_HOUH']);
        const iorHOUC = pickString(game, ['ior_HROUC', 'ior_HOUC']);

        if (ratioHO && (iorHOUH || iorHOUC)) {
          const hdp = this.parseHandicap(ratioHO);
          if (hdp !== null) {
            markets.half!.overUnderLines = markets.half!.overUnderLines || [];
            markets.half!.overUnderLines!.push({
              hdp,
              over: this.parseOddsValue(iorHOUC) || 0,
              under: this.parseOddsValue(iorHOUH) || 0,
            });
          }
        }
      }

      return markets;
    } catch (error: any) {
      logger.warn(`解析更多盘口数据失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 解析赔率值
   */
  private parseOddsValue(value: any): number | undefined {
    if (!value || value === '-') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  }

  /**
   * 解析让球/大小球盘口
   */
  private parseHandicap(value: any): number | null {
    if (!value || value === '-') return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const str = String(value).trim();
    if (!str) return null;

    if (str.includes('/')) {
      const parts = str.split('/').map((p) => parseFloat(p));
      const valid = parts.filter((n) => Number.isFinite(n));
      if (!valid.length) return null;
      return valid.reduce((sum, num) => sum + num, 0) / valid.length;
    }

    const num = parseFloat(str);
    return Number.isNaN(num) ? null : num;
  }

  isSuspended(): boolean {
    if (!this.suspendedUntil) return false;
    return Date.now() < this.suspendedUntil;
  }

  getSuspensionInfo(): { reason: string; until: number } | null {
    if (!this.isSuspended()) return null;
    return { reason: this.suspensionReason, until: this.suspendedUntil };
  }

  getAccountLabel(): string {
    return this.account.username;
  }

  private resolveMoreMarketsFlag(): boolean {
    const raw = (process.env.ENABLE_MORE_MARKETS || '').toLowerCase();
    if (!raw) return false;
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }

  private shouldSkipBecauseSuspended(context: string): boolean {
    if (!this.suspendedUntil) {
      return false;
    }

    const now = Date.now();
    if (now >= this.suspendedUntil) {
      this.suspendedUntil = 0;
      this.suspensionReason = '';
      return false;
    }

    const secondsLeft = Math.ceil((this.suspendedUntil - now) / 1000);
    const shouldLog =
      !this.lastSuspensionLog ||
      this.lastSuspensionLog.context !== context ||
      now - this.lastSuspensionLog.time > 5000;
    if (shouldLog) {
      logger.warn(
        `[${this.account.showType}] 账号冷却中 (${this.suspensionReason || '未知原因'})，剩余 ${secondsLeft}s，跳过 ${context}`
      );
      this.lastSuspensionLog = { context, time: now };
    }
    return true;
  }

  /**
   * 记录一次登录失败，并在连续失败达到阈值后触发账号冷却
   */
  private handleLoginFailure(reason: string): void {
    this.loginFailCount++;

    const thresholdRaw = process.env.LOGIN_FAIL_THRESHOLD || '5';
    const cooldownMinutesRaw = process.env.LOGIN_FAIL_COOLDOWN_MINUTES || '30';
    const threshold = Number(thresholdRaw);
    const cooldownMinutes = Number(cooldownMinutesRaw);

    if (!Number.isFinite(threshold) || threshold <= 0) {
      return;
    }

    if (this.loginFailCount < threshold) {
      return;
    }

    this.loginFailCount = 0; // 触发一次冷却后重置计数

    if (!Number.isFinite(cooldownMinutes) || cooldownMinutes <= 0) {
      return;
    }

    const durationMs = cooldownMinutes * 60 * 1000;
    this.suspendAccount(durationMs, `连续登录失败超过阈值(${threshold})：${reason}`);
  }

  private suspendAccount(durationMs: number, reason: string): void {
    this.suspendedUntil = Date.now() + durationMs;
    this.suspensionReason = reason;
    this.isLoggedIn = false;
    logger.warn(
      `[${this.account.showType}] 账号进入冷却：${reason}，暂停 ${Math.ceil(durationMs / 60000)} 分钟`
    );
  }

  private detectRiskResponse(raw: any): RiskFlag | null {
    if (!raw) return null;
    let text: string | null = null;

    if (typeof raw === 'string') {
      text = raw.trim();
    } else if (Buffer.isBuffer(raw)) {
      text = raw.toString('utf8').trim();
    } else if (typeof raw === 'object' && raw.data && typeof raw.data === 'string') {
      text = raw.data.trim();
    }

    if (!text) return null;

    if (/CheckEMNU/i.test(text)) {
      return 'check_emnu';
    }

    if (/double\s*login/i.test(text)) {
      return 'double_login';
    }

    if (!text.startsWith('<')) {
      return 'html_block';
    }

    return null;
  }

  private handleRiskyResponse(flag: RiskFlag, context: string): void {
    let duration = 10 * 60 * 1000;
    let reason = '未知风险';

    switch (flag) {
      case 'check_emnu':
        // 忽略 CheckEMNU，只在 debug 级别记录，避免日志噪音
        logger.debug(
          `[${this.account.showType}] 检测到 CheckEMNU 安全校验 (${context})，忽略并继续运行`
        );
        return; // 直接返回，不暂停账号
      case 'double_login':
        // 忽略重复登录警告，这是我们自己的保护机制，不是服务器限制
        logger.debug(
          `[${this.account.showType}] 检测到重复登录提示 (${context})，忽略并继续运行`
        );
        return; // 直接返回，不暂停账号
      case 'html_block':
        duration = 5 * 60 * 1000;
        reason = '返回非预期页面';
        break;
    }

    logger.warn(
      `[${this.account.showType}] ${reason} (${context})，暂停抓取 ${Math.ceil(duration / 60000)} 分钟`
    );
    this.suspendAccount(duration, `${reason} @ ${context}`);
  }

  /**
   * 解析滚球实时状态（如 "2H^82:14" 或 "HT"）
   */
  private parseLiveStatus(game: any): string | undefined {
    // 只有滚球才有实时状态
    if (this.account.showType !== 'live') {
      return undefined;
    }

    // NOW_MODEL 字段表示当前状态
    // HT: 中场休息, 1H: 上半场, 2H: 下半场
    const nowModel = game.NOW_MODEL || game.now_model;
    if (nowModel) {
      // 如果是中场休息，直接返回 HT
      if (nowModel === 'HT') {
        return 'HT';
      }

      // 如果有 RETIMESET 字段，表示比赛时间
      const timer = game.RETIMESET || game.retimeset || '';
      if (timer && timer !== '0') {
        // 格式化为 "1H^45:00" 或 "2H^82:14"
        return `${nowModel}^${timer}`;
      }

      return nowModel;
    }

    return undefined;
  }

  /**
   * 解析赛事状态
   */
  private parseState(game: any): number {
    // 检查是否有比分（有比分说明正在进行）
    if (game.SCORE_H && game.SCORE_C && game.SCORE_H !== '-' && game.SCORE_C !== '-') {
      return 1; // 进行中
    }

    // 检查状态字段
    if (game.RETIMESET && game.RETIMESET !== '0') {
      return 1; // 进行中
    }

    // 默认未开始
    return 0;
  }

  /**
   * 获取 showType 对应的 API 参数
   */
  private getShowTypeParam(): { showtype: string; rtype: string } {
    switch (this.account.showType) {
      case 'live':
        return { showtype: 'live', rtype: 'rb' }; // 滚球
      case 'today':
        return { showtype: 'today', rtype: 'r' }; // 今日
      case 'early':
        return { showtype: 'early', rtype: 'r' }; // 早盘
      default:
        return { showtype: 'live', rtype: 'rb' };
    }
  }

  private buildMoreMarketAttempts(ecid?: any, lid?: any): Array<{
    label: string;
    useEcid?: boolean;
    useGid?: boolean;
    includeLid?: boolean;
    langx?: string;
  }> {
    const base: Array<{
      label: string;
      useEcid?: boolean;
      useGid?: boolean;
      includeLid?: boolean;
      langx?: string;
    }> = [
        { label: 'ecid+gid+lid zh-cn', useEcid: true, useGid: true, includeLid: true, langx: 'zh-cn' },
        { label: 'gid+lid zh-cn', useEcid: false, useGid: true, includeLid: true, langx: 'zh-cn' },
        { label: 'gid only zh-cn', useEcid: false, useGid: true, includeLid: false, langx: 'zh-cn' },
      ];

    if (ecid) {
      base.push({ label: 'ecid only zh-cn', useEcid: true, useGid: false, includeLid: false, langx: 'zh-cn' });
    }

    base.push({ label: 'gid only zh-tw', useEcid: false, useGid: true, includeLid: false, langx: 'zh-tw' });

    return base;
  }

  private hasMoreMarketsFlag(match: Match): boolean {
    const raw = (match as any)?.raw || {};
    const game = raw.game || raw.league?.game || raw;
    if (!game) return false;

    const moreValue = game.MORE ?? game.more;
    if (moreValue === undefined || moreValue === null || moreValue === '') return false;

    const n = Number(moreValue);
    return Number.isFinite(n) && n > 0;
  }

  private resolveStartDelay(): number {
    const raw = Number(process.env.MORE_MARKETS_START_DELAY_SECONDS || '0');
    if (Number.isFinite(raw) && raw > 0) {
      return raw * 1000;
    }
    return 0;
  }

  private resolveThrottleInterval(): number {
    const raw = Number(process.env.MORE_MARKETS_INTERVAL_MS || '400');
    if (Number.isFinite(raw) && raw >= 0) {
      return raw;
    }
    return 400;
  }

  private resolveConcurrentLimit(): number {
    const raw = Number(process.env.MORE_MARKETS_MAX_CONCURRENCY || '1');
    if (Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return 1;
  }
  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }

}
