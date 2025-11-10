// 赛事类型
export type ShowType = 'live' | 'today' | 'early';

// 账号配置
export interface AccountConfig {
  username: string;
  password: string;
  showType: ShowType;
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
  state: number; // 0: 未开始, 1: 进行中, 2: 已结束
  home_score?: number;
  away_score?: number;
  showType: ShowType;
  raw?: any;
  markets?: Markets;
}

// 盘口数据
export interface Markets {
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
  };
}

export interface HandicapLine {
  hdp: number;
  home: number;
  away: number;
}

export interface OverUnderLine {
  hdp: number;
  over: number;
  under: number;
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
