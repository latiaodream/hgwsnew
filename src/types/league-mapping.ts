/**
 * 联赛名称映射类型定义
 */

export interface LeagueMapping {
  id: string;
  isports_en: string; // iSports 英文名
  isports_cn: string; // iSports 中文名（简体）
  crown_cn: string; // 皇冠中文名（简体）
  created_at: string;
  updated_at: string;
  verified: boolean; // 是否已人工验证
}

export interface LeagueMappingData {
  mappings: LeagueMapping[];
}

