/**
 * 球队名称映射类型定义
 */

export interface TeamMapping {
  id: string;
  isports_en: string; // iSports 英文名
  isports_cn: string; // iSports 中文名（简体）
  crown_cn: string; // 皇冠中文名（简体）
  created_at: string;
  updated_at: string;
  verified: boolean; // 是否已人工验证
}

export interface TeamMappingData {
  mappings: TeamMapping[];
}

export interface TeamMappingSuggestion {
  crown_match: {
    team_home: string;
    team_away: string;
    league: string;
  };
  isports_match?: {
    match_id: string;
    team_home_cn: string;
    team_home_en: string;
    team_away_cn: string;
    team_away_en: string;
    league_cn: string;
    league_en: string;
    confidence: number;
  };
  oddsapi_match?: {
    match_id: string;
    team_home_cn: string;
    team_home_en: string;
    team_away_cn: string;
    team_away_en: string;
    league_cn: string;
    league_en: string;
    confidence: number;
  };
}

