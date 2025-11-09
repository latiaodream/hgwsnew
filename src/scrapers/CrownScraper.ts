import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

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

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Origin': this.baseUrl,
        'Referer': `${this.baseUrl}/`,
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
        // 同步 Origin/Referer 为当前 baseUrl
        config.headers['Origin'] = this.baseUrl;
        config.headers['Referer'] = `${this.baseUrl}/`;
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
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

    // 内置备用域名
    const builtins = [
      'https://hga026.com','https://hga027.com','https://hga030.com','https://hga035.com','https://hga038.com','https://hga039.com','https://hga050.com',
      'https://mos011.com','https://mos022.com','https://mos033.com','https://mos055.com','https://mos066.com','https://mos100.com'
    ];

    // 合并去重，保持顺序：singleBase -> fromEnvCandidates -> builtins
    const all = [...singleBase, ...fromEnvCandidates, ...builtins];
    const uniq: string[] = [];
    for (const url of all) {
      if (url && !uniq.includes(url)) uniq.push(url);
    }
    return uniq.length ? uniq : ['https://hga038.com'];
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
    const builtins = [
      'https://hga038.com','https://hga026.com','https://hga027.com','https://hga030.com','https://hga035.com','https://hga039.com','https://hga050.com',
      'https://mos011.com','https://mos022.com','https://mos033.com','https://mos055.com','https://mos066.com','https://mos100.com'
    ];
    const all = [...single, ...envs, ...builtins];
    const uniq: string[] = [];
    for (const u of all) { if (u && !uniq.includes(u)) uniq.push(u); }
    return uniq.length ? uniq : [this.baseUrl];
  }


  /**
   * 获取版本号
   */
  private async getVersion(): Promise<void> {
    // 依次在 siteUrl 候选上尝试获取版本号
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
    for (let i = 0; i < this.siteUrlCandidates.length; i++) {
      const url = this.siteUrlCandidates[i];
      try {
        const resp = await axios.get(`${url}/`, {
          headers: {
            'User-Agent': userAgent,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          timeout: 15000,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          validateStatus: (s) => s >= 200 && s < 500,
        });
        const html = resp.data || '';
        const m1 = html.match(/top\.ver\s*=\s*'([^']+)'/);
        const m2 = m1 ? null : html.match(/ver=([^&"']+)/);
        const ver = (m1?.[1] || m2?.[1])?.trim();
        if (ver) {
          this.version = ver;
          this.siteUrl = url;
          logger.debug(`[${this.account.showType}] 获取版本号成功: ${this.version} @ ${this.siteUrl}`);
          return;
        }
      } catch (e: any) {
        logger.warn(`[${this.account.showType}] 获取版本号失败 @ ${url}: ${e?.message || e}`);
        continue;
      }
    }
    logger.warn(`[${this.account.showType}] 获取版本号失败，使用默认值`);
    this.version = '2025-10-16-fix342_120';
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
   * 登录皇冠账号
   */
  async login(): Promise<boolean> {
    // 按候选域名循环尝试登录
    for (let attempt = 0; attempt < this.baseUrlCandidates.length; attempt++) {
      try {
        logger.info(`[${this.account.showType}] 🔐 开始登录: ${this.account.username} @ ${this.baseUrl}`);

        // 访问首页预热（拿 Cookie）
        try {
          await this.client.get('/');
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
          langx: 'zh-tw',  // 使用繁体中文版本
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
        const response = await this.client.post(url, params.toString());
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

    try {
      logger.info(`[${this.account.showType}] 🚪 开始登出...`);

      // 调用登出 API
      const params = new URLSearchParams({
        p: 'logout',
        uid: this.uid,
        ver: this.version,
        langx: 'zh-tw',
      });

      await this.client.post(`/transform.php?ver=${this.version}`, params.toString());

      // 清除登录状态
      this.isLoggedIn = false;
      this.uid = '';
      this.cookies = '';

      logger.info(`[${this.account.showType}] ✅ 登出成功`);
    } catch (error: any) {
      logger.error(`[${this.account.showType}] ❌ 登出失败: ${error.message}`);
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
        langx: 'zh-tw',
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

      const response = await this.client.post(`/transform.php?ver=${this.version}`, params.toString(), {
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
        langx: 'zh-tw',
        odd_f_type: 'H',
        gid: gid,
        gtype: 'FT',
        wtype: this.account.showType === 'live' ? 'RM' : 'M',
        chose_team: 'H',
      });

      const response = await this.client.post(`/transform.php?ver=${this.version}`, params.toString(), {
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
    const markets: Markets = {};

    // 独赢（Moneyline）
    if (game.RATIO_MH || game.RATIO_MN || game.RATIO_MC) {
      markets.moneyline = {
        home: this.parseOddsValue(game.RATIO_MH),
        draw: this.parseOddsValue(game.RATIO_MN),
        away: this.parseOddsValue(game.RATIO_MC),
      };
    }

    // 全场让球和大小球
    markets.full = {
      handicapLines: [],
      overUnderLines: [],
    };

    // 全场让球
    if (game.RATIO_R || game.RATIO_RH || game.RATIO_RC) {
      const hdp = this.parseHandicap(game.RATIO_R || game.STRONG);
      if (hdp !== null && markets.full?.handicapLines) {
        markets.full.handicapLines.push({
          hdp,
          home: this.parseOddsValue(game.RATIO_RH) || 0,
          away: this.parseOddsValue(game.RATIO_RC) || 0,
        });
      }
    }

    // 全场大小球
    if (game.RATIO_O || game.RATIO_OUH || game.RATIO_OUC) {
      const hdp = this.parseHandicap(game.RATIO_O);
      if (hdp !== null && markets.full?.overUnderLines) {
        markets.full.overUnderLines.push({
          hdp,
          over: this.parseOddsValue(game.RATIO_OUH) || 0,
          under: this.parseOddsValue(game.RATIO_OUC) || 0,
        });
      }
    }

    // 半场让球和大小球
    markets.half = {
      handicapLines: [],
      overUnderLines: [],
    };

    // 半场让球
    if (game.RATIO_HR || game.RATIO_HRH || game.RATIO_HRC) {
      const hdp = this.parseHandicap(game.RATIO_HR || game.HSTRONG);
      if (hdp !== null && markets.half?.handicapLines) {
        markets.half.handicapLines.push({
          hdp,
          home: this.parseOddsValue(game.RATIO_HRH) || 0,
          away: this.parseOddsValue(game.RATIO_HRC) || 0,
        });
      }
    }

    // 半场大小球
    if (game.RATIO_HO || game.RATIO_HOUH || game.RATIO_HOUC) {
      const hdp = this.parseHandicap(game.RATIO_HO);
      if (hdp !== null && markets.half?.overUnderLines) {
        markets.half.overUnderLines.push({
          hdp,
          over: this.parseOddsValue(game.RATIO_HOUH) || 0,
          under: this.parseOddsValue(game.RATIO_HOUC) || 0,
        });
      }
    }

    return markets;
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

