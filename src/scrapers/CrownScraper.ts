import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { AccountConfig, Match, ShowType, Markets } from '../types';
import logger from '../utils/logger';
import { parseStringPromise } from 'xml2js';

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

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent: proxyAgent || new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent
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
        return await this.client.post(path, body, config);
      } catch (err: any) {
        lastErr = err;
        const status = err?.response?.status;
        if (status === 404 || status === 405) {
          logger.warn(`[${this.account.showType}] ${path} 返回 ${status}，尝试下一个路径`);
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
    const proxyUrl = process.env.CROWN_PROXY_URL;
    if (!proxyUrl) return null;

    try {
      if (proxyUrl.startsWith('socks://') || proxyUrl.startsWith('socks5://')) {
        logger.info(`[${this.account.showType}] 使用 SOCKS5 代理: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);
        return new SocksProxyAgent(proxyUrl);
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
    const builtins = [
      'https://hga026.com','https://hga027.com','https://hga030.com','https://hga035.com','https://hga038.com','https://hga039.com','https://hga050.com',
      'https://mos011.com','https://mos022.com','https://mos033.com','https://mos055.com','https://mos066.com','https://mos100.com'
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
    const envs = process.env.CROWN_SITE_URL_CANDIDATES ? process.env.CROWN_SITE_URL_CANDIDATES.split(',').map(s=>s.trim()).filter(Boolean) : [];

    // 如果明确配置了 CROWN_SITE_URL 或 CROWN_SITE_URL_CANDIDATES，则不使用内置备用域名
    if (single.length > 0 || envs.length > 0) {
      const all = [...single, ...envs];
      const uniq: string[] = [];
      for (const u of all) { if (u && !uniq.includes(u)) uniq.push(u); }
      return uniq.length ? uniq : [this.baseUrl];
    }

    // 内置备用域名（仅在未配置环境变量时使用）
    const builtins = [
      'https://hga026.com','https://hga027.com','https://hga030.com','https://hga035.com','https://hga038.com','https://hga039.com','https://hga050.com',
      'https://mos011.com','https://mos022.com','https://mos033.com','https://mos055.com','https://mos066.com','https://mos100.com'
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
   * 解析 XML 响应
   */
  private async parseXmlResponse(xml: string): Promise<any> {
    try {
      const result = await parseStringPromise(xml, {
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
    // 按候选域名循环尝试登录
    for (let attempt = 0; attempt < this.baseUrlCandidates.length; attempt++) {
      try {
        logger.info(`[${this.account.showType}] 🔐 开始登录: ${this.account.username} @ ${this.baseUrl}`);

        // 预热（首页 + /app/member/...）
        try {
          await this.warmUp();
        } catch (_) { /* 忽略 */ }

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
          langx: 'zh-cn',  // 使用简体中文版本
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
          logger.info(`[${this.account.showType}] ✅ 登录成功，UID: ${this.uid}, baseUrl: ${this.baseUrl}`);
          return true;
        }

        if (loginResponse.msg === '109') {
          logger.warn(`[${this.account.showType}] ⚠️ 需要修改密码`);
          return false;
        }

        logger.error(`[${this.account.showType}] ❌ 登录失败: ${loginResponse.msg || loginResponse.err || '未知错误'}`);
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

        // 遇到 404/405/502/503 之类，切换下一个域名再试
        if ([404, 405, 502, 503].includes(status)) {
          this.switchToNextBaseUrl();
          continue;
        }

        // 其他错误不再重试
        return false;
      }
    }

    // 所有候选都失败
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

      // 尝试调用登出 API（可能不存在，但尝试一下）
      try {
        const params = new URLSearchParams({
          p: 'logout',
          uid: uid,
          ver: this.version,
          langx: 'zh-cn',
        });

        await this.postTransform(params.toString());
        logger.info(`[${this.account.showType}] ✅ 登出 API 调用成功`);
      } catch (apiError: any) {
        // 登出 API 可能不存在或返回 404，这是正常的
        logger.warn(`[${this.account.showType}] ⚠️ 登出 API 调用失败（可能不存在）: ${apiError.message}`);
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
   * 获取赛事列表
   */
  async fetchMatches(): Promise<Match[]> {
    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('登录失败');
      }
    }

    try {
      logger.debug(`[${this.account.showType}] 开始抓取赛事数据`);

      const timestamp = Date.now().toString();
      const showTypeParam = this.getShowTypeParam();

      // 构建请求参数
      const params = new URLSearchParams({
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        p: 'get_game_list',
        p3type: '',
        date: '',
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

      await this.enrichMatchesWithMoreMarkets(matches);

      logger.info(`[${this.account.showType}] 抓取到 ${matches.length} 场赛事`);

      return matches;
    } catch (error: any) {
      logger.error(`[${this.account.showType}] 抓取失败:`, error.message);

      // 如果是认证错误，重新登录
      if (error.response?.status === 401 || error.message.includes('登录')) {
        this.isLoggedIn = false;
      }

      throw error;
    }
  }

  private async enrichMatchesWithMoreMarkets(matches: Match[]): Promise<void> {
    if (!Array.isArray(matches) || matches.length === 0) return;

    const maxCount = this.account.showType === 'live' ? 30 : 15;
    const targets = matches.slice(0, maxCount);

    for (const match of targets) {
      const moreMarkets = await this.fetchMoreMarkets(match);
      if (moreMarkets) {
        match.markets = this.mergeMarkets(match.markets || {}, moreMarkets);
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

    const mergeLineArray = <T>(target?: T[], addition?: T[]): T[] | undefined => {
      if ((!target || target.length === 0) && (!addition || addition.length === 0)) {
        return target;
      }
      return [...(target || []), ...(addition || [])];
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
    if (!match?.gid) return null;
    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        return null;
      }
    }

    try {
      const params = new URLSearchParams({
        p: 'get_game_more',
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        gtype: 'FT',
        showtype: match.showType === 'live' ? 'live' : (match.showType === 'today' ? 'today' : 'early'),
        ltype: '3',
        isRB: match.showType === 'live' ? 'Y' : 'N',
        gid: match.gid,
        filter: 'All',
      });

      if (match.lid) {
        params.set('lid', match.lid);
      }

      const response = await this.postTransform(params.toString(), {
        headers: {
          'Cookie': this.cookies,
        },
      });

      if (typeof response.data === 'string') {
        const trimmed = response.data.trim();
        if (!trimmed.startsWith('<')) {
          logger.warn(`[${this.account.showType}] get_game_more 返回非 XML: ${trimmed.slice(0, 120)}`);
          return null;
        }
      }

      let parsed;
      try {
        parsed = await this.parseXmlResponse(response.data);
      } catch (error: any) {
        logger.warn(`[${this.account.showType}] 解析 get_game_more XML 失败 (GID: ${match.gid}): ${error?.message || error}`);
        return null;
      }
      const serverResponse = parsed?.serverresponse || parsed;
      const markets = this.parseMoreMarkets(serverResponse);
      return markets;
    } catch (error: any) {
      logger.warn(`[${this.account.showType}] 获取更多盘口失败 (GID: ${match.gid}): ${error.message}`);
      return null;
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
          const match: Match = {
            gid: game.GID || game.gid,
            lid: league.LID || league.lid || game.LID || game.lid,
            home: game.TEAM_H || game.team_h || '',
            home_zh: game.TEAM_H || game.team_h || '',
            away: game.TEAM_C || game.team_c || '',
            away_zh: game.TEAM_C || game.team_c || '',
            league: league.LEAGUE || league.league || '',
            league_zh: league.LEAGUE || league.league || '',
            match_time: this.parseMatchTime(game.DATETIME || game.datetime),
            state: this.parseState(game),
            home_score: this.parseScore(game.SCORE_H || game.score_h),
            away_score: this.parseScore(game.SCORE_C || game.score_c),
            showType: this.account.showType,
            raw: {
              league,
              game,
            },
            markets: this.parseOdds(game),
          };

          matches.push(match);
        } catch (error: any) {
          logger.warn(`[${this.account.showType}] 解析赛事失败:`, error.message);
        }
      }
    }

    return matches;
  }

  /**
   * 解析比赛时间
   */
  private parseMatchTime(datetime: string): string {
    if (!datetime) return new Date().toISOString();

    try {
      // 格式：11-09<br>23:15
      const cleaned = datetime.replace(/<br>/g, ' ');
      const [date, time] = cleaned.split(' ');
      const [month, day] = date.split('-');
      const year = new Date().getFullYear();

      return new Date(`${year}-${month}-${day} ${time}`).toISOString();
    } catch (error) {
      return new Date().toISOString();
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
        if (game[key] !== undefined && game[key] !== null && game[key] !== '') {
          return game[key];
        }
      }
      return undefined;
    };

    const markets: Markets = {};

    // 独赢（Moneyline）- 使用小写字段名
    const mh = pick(['ior_MH', 'IOR_MH']);
    const mn = pick(['ior_MN', 'IOR_MN']);
    const mc = pick(['ior_MC', 'IOR_MC']);

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
    const ratioR = pick(['ratio', 'RATIO_RE', 'RATIO_R', 'STRONG']);
    const ratioRH = pick(['ior_RH', 'IOR_RH']);
    const ratioRC = pick(['ior_RC', 'IOR_RC']);

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
    const ratioO = pick(['ratio_o', 'ratio_u', 'RATIO_O']);
    const ratioOUH = pick(['ior_OUH', 'IOR_OUH']);
    const ratioOUC = pick(['ior_OUC', 'IOR_OUC']);

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
    const ratioHR = pick(['hratio', 'RATIO_HR', 'HSTRONG']);
    const ratioHRH = pick(['ior_HRH', 'IOR_HRH']);
    const ratioHRC = pick(['ior_HRC', 'IOR_HRC']);

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
    const ratioHO = pick(['ratio_ho', 'ratio_hu', 'RATIO_HO']);
    const ratioHOUH = pick(['ior_HOUH', 'IOR_HOUH']);
    const ratioHOUC = pick(['ior_HOUC', 'IOR_HOUC']);

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

      for (const game of games) {
        // 全场让球盘口
        const ratioR = game.ratio || game.RATIO || game.RATIO_RE;
        const iorRH = game.ior_RH || game.IOR_RH;
        const iorRC = game.ior_RC || game.IOR_RC;

        if (ratioR && (iorRH || iorRC)) {
          const hdp = this.parseHandicap(ratioR);
          if (hdp !== null) {
            markets.full!.handicapLines!.push({
              hdp,
              home: this.parseOddsValue(iorRH) || 0,
              away: this.parseOddsValue(iorRC) || 0,
            });
          }
        }

        // 全场大小球盘口
        const ratioO = game.ratio_o || game.ratio_u || game.RATIO_O || game.RATIO_U;
        const iorOUH = game.ior_OUH || game.IOR_OUH;
        const iorOUC = game.ior_OUC || game.IOR_OUC;

        if (ratioO && (iorOUH || iorOUC)) {
          const hdp = this.parseHandicap(ratioO);
          if (hdp !== null) {
            markets.full!.overUnderLines!.push({
              hdp,
              over: this.parseOddsValue(iorOUC) || 0,
              under: this.parseOddsValue(iorOUH) || 0,
            });
          }
        }

        // 半场让球盘口
        const ratioHR = game.hratio || game.HRATIO || game.RATIO_HR;
        const iorHRH = game.ior_HRH || game.IOR_HRH;
        const iorHRC = game.ior_HRC || game.IOR_HRC;

        if (ratioHR && (iorHRH || iorHRC)) {
          const hdp = this.parseHandicap(ratioHR);
          if (hdp !== null) {
            markets.half!.handicapLines!.push({
              hdp,
              home: this.parseOddsValue(iorHRH) || 0,
              away: this.parseOddsValue(iorHRC) || 0,
            });
          }
        }

        // 半场大小球盘口
        const ratioHO = game.ratio_ho || game.ratio_hu || game.RATIO_HO || game.RATIO_HU;
        const iorHOUH = game.ior_HOUH || game.IOR_HOUH;
        const iorHOUC = game.ior_HOUC || game.IOR_HOUC;

        if (ratioHO && (iorHOUH || iorHOUC)) {
          const hdp = this.parseHandicap(ratioHO);
          if (hdp !== null) {
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
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
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

  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }

}
