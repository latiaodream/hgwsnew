-- 皇冠数据抓取服务 - PostgreSQL 数据库表结构
-- 数据库名：hgwss
-- 用户名：hgwss
-- 密码：JG3KN46JGXWN4CbJ

-- ============================================
-- 1. 球队映射表
-- ============================================
CREATE TABLE IF NOT EXISTS team_mappings (
  id UUID PRIMARY KEY,
  isports_en VARCHAR(255) NOT NULL,
  isports_cn VARCHAR(255) NOT NULL,
  crown_cn VARCHAR(255) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 球队映射索引
CREATE INDEX IF NOT EXISTS idx_team_mappings_isports_en ON team_mappings(isports_en);
CREATE INDEX IF NOT EXISTS idx_team_mappings_isports_cn ON team_mappings(isports_cn);
CREATE INDEX IF NOT EXISTS idx_team_mappings_crown_cn ON team_mappings(crown_cn);

COMMENT ON TABLE team_mappings IS '球队名称映射表';
COMMENT ON COLUMN team_mappings.id IS '唯一标识符';
COMMENT ON COLUMN team_mappings.isports_en IS 'iSports 英文名';
COMMENT ON COLUMN team_mappings.isports_cn IS 'iSports 中文名（简体）';
COMMENT ON COLUMN team_mappings.crown_cn IS '皇冠中文名（简体）';
COMMENT ON COLUMN team_mappings.verified IS '是否已人工验证';
COMMENT ON COLUMN team_mappings.created_at IS '创建时间';
COMMENT ON COLUMN team_mappings.updated_at IS '更新时间';

-- ============================================
-- 2. 联赛映射表
-- ============================================
CREATE TABLE IF NOT EXISTS league_mappings (
  id UUID PRIMARY KEY,
  isports_en VARCHAR(255) NOT NULL,
  isports_cn VARCHAR(255) NOT NULL,
  crown_cn VARCHAR(255) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 联赛映射索引
CREATE INDEX IF NOT EXISTS idx_league_mappings_isports_en ON league_mappings(isports_en);
CREATE INDEX IF NOT EXISTS idx_league_mappings_isports_cn ON league_mappings(isports_cn);
CREATE INDEX IF NOT EXISTS idx_league_mappings_crown_cn ON league_mappings(crown_cn);

COMMENT ON TABLE league_mappings IS '联赛名称映射表';
COMMENT ON COLUMN league_mappings.id IS '唯一标识符';
COMMENT ON COLUMN league_mappings.isports_en IS 'iSports 英文名';
COMMENT ON COLUMN league_mappings.isports_cn IS 'iSports 中文名（简体）';
COMMENT ON COLUMN league_mappings.crown_cn IS '皇冠中文名（简体）';
COMMENT ON COLUMN league_mappings.verified IS '是否已人工验证';
COMMENT ON COLUMN league_mappings.created_at IS '创建时间';
COMMENT ON COLUMN league_mappings.updated_at IS '更新时间';

-- ============================================
-- 3. 皇冠赛事表
-- ============================================
CREATE TABLE IF NOT EXISTS crown_matches (
  gid VARCHAR(50) PRIMARY KEY,
  show_type VARCHAR(20) NOT NULL,
  league VARCHAR(255),
  team_home VARCHAR(255),
  team_away VARCHAR(255),
  match_time TIMESTAMP WITH TIME ZONE,
  handicap DECIMAL(10, 2),
  handicap_home DECIMAL(10, 2),
  handicap_away DECIMAL(10, 2),
  over_under DECIMAL(10, 2),
  over DECIMAL(10, 2),
  under DECIMAL(10, 2),
  home_win DECIMAL(10, 2),
  draw DECIMAL(10, 2),
  away_win DECIMAL(10, 2),
  strong VARCHAR(10),
  more VARCHAR(10),
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 皇冠赛事索引
CREATE INDEX IF NOT EXISTS idx_crown_matches_show_type ON crown_matches(show_type);
CREATE INDEX IF NOT EXISTS idx_crown_matches_match_time ON crown_matches(match_time);
CREATE INDEX IF NOT EXISTS idx_crown_matches_league ON crown_matches(league);
CREATE INDEX IF NOT EXISTS idx_crown_matches_updated_at ON crown_matches(updated_at);

COMMENT ON TABLE crown_matches IS '皇冠赛事数据表';
COMMENT ON COLUMN crown_matches.gid IS '赛事唯一标识符';
COMMENT ON COLUMN crown_matches.show_type IS '赛事类型：live(滚球), today(今日), early(早盘)';
COMMENT ON COLUMN crown_matches.league IS '联赛名称';
COMMENT ON COLUMN crown_matches.team_home IS '主队名称';
COMMENT ON COLUMN crown_matches.team_away IS '客队名称';
COMMENT ON COLUMN crown_matches.match_time IS '比赛时间（GMT-4）';
COMMENT ON COLUMN crown_matches.handicap IS '让球盘口';
COMMENT ON COLUMN crown_matches.handicap_home IS '让球主队赔率';
COMMENT ON COLUMN crown_matches.handicap_away IS '让球客队赔率';
COMMENT ON COLUMN crown_matches.over_under IS '大小球盘口';
COMMENT ON COLUMN crown_matches.over IS '大球赔率';
COMMENT ON COLUMN crown_matches.under IS '小球赔率';
COMMENT ON COLUMN crown_matches.home_win IS '主胜赔率';
COMMENT ON COLUMN crown_matches.draw IS '平局赔率';
COMMENT ON COLUMN crown_matches.away_win IS '客胜赔率';
COMMENT ON COLUMN crown_matches.strong IS '强队标识：H(主队), C(客队)';
COMMENT ON COLUMN crown_matches.more IS '更多玩法标识';
COMMENT ON COLUMN crown_matches.raw_data IS '原始数据（JSON格式）';
COMMENT ON COLUMN crown_matches.created_at IS '创建时间';
COMMENT ON COLUMN crown_matches.updated_at IS '更新时间';

-- ============================================
-- 4. 第三方赔率表
-- ============================================
CREATE TABLE IF NOT EXISTS thirdparty_matches (
  id VARCHAR(100) PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  status VARCHAR(20),
  league_en VARCHAR(255),
  league_cn VARCHAR(255),
  team_home_en VARCHAR(255),
  team_home_cn VARCHAR(255),
  team_away_en VARCHAR(255),
  team_away_cn VARCHAR(255),
  match_time TIMESTAMP WITH TIME ZONE,
  handicap JSONB,
  totals JSONB,
  moneyline JSONB,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 第三方赔率索引
CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_source ON thirdparty_matches(source);
CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_status ON thirdparty_matches(status);
CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_match_time ON thirdparty_matches(match_time);
CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_league_en ON thirdparty_matches(league_en);
CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_updated_at ON thirdparty_matches(updated_at);

COMMENT ON TABLE thirdparty_matches IS '第三方赔率数据表';
COMMENT ON COLUMN thirdparty_matches.id IS '赛事唯一标识符';
COMMENT ON COLUMN thirdparty_matches.source IS '数据源：isports, oddsapi';
COMMENT ON COLUMN thirdparty_matches.status IS '赛事状态：live(进行中), upcoming(未开始)';
COMMENT ON COLUMN thirdparty_matches.league_en IS '联赛英文名';
COMMENT ON COLUMN thirdparty_matches.league_cn IS '联赛中文名';
COMMENT ON COLUMN thirdparty_matches.team_home_en IS '主队英文名';
COMMENT ON COLUMN thirdparty_matches.team_home_cn IS '主队中文名';
COMMENT ON COLUMN thirdparty_matches.team_away_en IS '客队英文名';
COMMENT ON COLUMN thirdparty_matches.team_away_cn IS '客队中文名';
COMMENT ON COLUMN thirdparty_matches.match_time IS '比赛时间（GMT-4）';
COMMENT ON COLUMN thirdparty_matches.handicap IS '让球盘口数据（JSON格式，支持多盘口）';
COMMENT ON COLUMN thirdparty_matches.totals IS '大小球盘口数据（JSON格式，支持多盘口）';
COMMENT ON COLUMN thirdparty_matches.moneyline IS '独赢盘口数据（JSON格式）';
COMMENT ON COLUMN thirdparty_matches.raw_data IS '原始数据（JSON格式）';
COMMENT ON COLUMN thirdparty_matches.created_at IS '创建时间';
COMMENT ON COLUMN thirdparty_matches.updated_at IS '更新时间';

-- ============================================
-- 示例数据
-- ============================================

-- 球队映射示例
-- INSERT INTO team_mappings (id, isports_en, isports_cn, crown_cn, verified) VALUES
-- ('550e8400-e29b-41d4-a716-446655440000', 'Manchester United', '曼联', '曼联', true),
-- ('550e8400-e29b-41d4-a716-446655440001', 'Liverpool', '利物浦', '利物浦', true);

-- 联赛映射示例
-- INSERT INTO league_mappings (id, isports_en, isports_cn, crown_cn, verified) VALUES
-- ('660e8400-e29b-41d4-a716-446655440000', 'English Premier League', '英格兰超级联赛', '英超', true),
-- ('660e8400-e29b-41d4-a716-446655440001', 'Spanish La Liga', '西班牙甲级联赛', '西甲', true);

-- ============================================
-- 数据清理（可选）
-- ============================================

-- 删除 7 天前的旧赛事数据
-- DELETE FROM crown_matches WHERE match_time < NOW() - INTERVAL '7 days';
-- DELETE FROM thirdparty_matches WHERE match_time < NOW() - INTERVAL '7 days';

-- ============================================
-- 查询示例
-- ============================================

-- 查询所有球队映射
-- SELECT * FROM team_mappings ORDER BY created_at DESC;

-- 查询所有联赛映射
-- SELECT * FROM league_mappings ORDER BY created_at DESC;

-- 查询今日皇冠赛事
-- SELECT * FROM crown_matches WHERE show_type = 'today' ORDER BY match_time ASC;

-- 查询滚球赛事
-- SELECT * FROM crown_matches WHERE show_type = 'live' ORDER BY match_time ASC;

-- 查询第三方进行中的赛事
-- SELECT * FROM thirdparty_matches WHERE status = 'live' ORDER BY match_time ASC;

-- 统计各类型赛事数量
-- SELECT show_type, COUNT(*) as count FROM crown_matches GROUP BY show_type;

-- 统计各数据源赛事数量
-- SELECT source, COUNT(*) as count FROM thirdparty_matches GROUP BY source;

