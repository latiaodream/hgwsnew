// 赛事类型
export type ShowType = 'live' | 'today' | 'early';

// 账号配置
export interface AccountConfig {
  username: string;
  password: string;
  showType: ShowType;
  /**
   * 可选：为该账号指定独立代理（http/https/socks5），例如：
   * socks5://user:pass@host:port
   */
  proxyUrl?: string;
}

// 赛事数据
export interface Match {
  gid: string;
  lid?: string;
  home: string;
  home_zh: string;
  away: string;
  away_zh: string;
  league: string;
  league_zh: string;
  match_time: string;
  live_status?: string; // 滚球实时状态，如 "2H^82:14" 或 "HT"
  state: number; // 0: 未开始, 1: 进行中, 2: 已结束
  home_score?: number;
  away_score?: number;
  showType: ShowType;
  raw?: any;
  markets?: Markets;
}

// 盘口数据
export interface Markets {
  gid?: string; // 赛事 GID
  match_time?: string; // 比赛时间
  moneyline?: {
    home?: number;
    draw?: number;
    away?: number;
  };
  full?: {
    handicapLines?: HandicapLine[];
    overUnderLines?: OverUnderLine[];
  };
  half?: {
    handicapLines?: HandicapLine[];
    overUnderLines?: OverUnderLine[];
    moneyline?: {
      home?: number;
      draw?: number;
      away?: number;
    };
  };
  halfMoneyline?: {
    home?: number;
    draw?: number;
    away?: number;
  };
  // 角球盘口
  cornerFull?: {
    handicapLines?: HandicapLine[];
    overUnderLines?: OverUnderLine[];
  };
  cornerHalf?: {
    handicapLines?: HandicapLine[];
    overUnderLines?: OverUnderLine[];
  };
}

export interface HandicapLine {
	hdp: number;
	home: number;
	away: number;
	/**
	 * 行级盘口对应的皇冠 GID：
	 * - 主盘口一般等于赛事 gid；
	 * - 多盘口/角球盘口来自 get_game_more/get_game_OBT 的行级 gid；
	 * 前端会将其作为 spread_gid 传给 /odds/preview -> FT_order_view。
	 */
	gid?: string;
	/**
	 * 解析更多盘口时附带的原始元信息（isMaster/gopen/mode 等），仅用于调试/排序。
	 */
	__meta?: any;
}

export interface OverUnderLine {
	hdp: number;
	over: number;
	under: number;
	/** 行级盘口对应的皇冠 GID，用于下注预览时作为 spread_gid 传递 */
	gid?: string;
	__meta?: any;
}

// WebSocket 消息类型
export enum MessageType {
  // 服务端 -> 客户端
  FULL_DATA = 'full_data',           // 全量数据
  MATCH_UPDATE = 'match_update',     // 赛事更新
  MATCH_ADD = 'match_add',           // 新增赛事
  MATCH_REMOVE = 'match_remove',     // 删除赛事
  ODDS_UPDATE = 'odds_update',       // 赔率更新
  SCORE_UPDATE = 'score_update',     // 比分更新
  HEARTBEAT = 'heartbeat',           // 心跳
  ERROR = 'error',                   // 错误

  // 第三方数据推送
  THIRDPARTY_FULL_DATA = 'thirdparty_full_data',       // 第三方全量数据
  THIRDPARTY_UPDATE = 'thirdparty_update',             // 第三方数据更新

  // 客户端 -> 服务端
  AUTH = 'auth',                     // 认证
  SUBSCRIBE = 'subscribe',           // 订阅
  UNSUBSCRIBE = 'unsubscribe',       // 取消订阅
  PING = 'ping',                     // Ping
}

// WebSocket 消息
export interface WSMessage {
  type: MessageType;
  data?: any;
  timestamp?: number;
}

// 订阅选项
export interface SubscribeOptions {
  showTypes?: ShowType[];  // 订阅的类型，不传则订阅全部
  includeThirdparty?: boolean;  // 是否包含第三方数据，默认 false
  thirdpartySources?: ('isports' | 'oddsapi')[];  // 订阅的第三方数据源
}

// 抓取器状态
export interface ScraperStatus {
  showType: ShowType;
  isRunning: boolean;
  lastFetchTime?: number;
  matchCount: number;
  errorCount: number;
  lastError?: string;
}
