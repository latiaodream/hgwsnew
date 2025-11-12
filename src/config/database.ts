/**
 * PostgreSQL 数据库配置
 */

import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

// 数据库配置
const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'hgwss',
  user: process.env.DB_USER || 'hgwss',
  password: process.env.DB_PASSWORD || 'JG3KN46JGXWN4CbJ',
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000, // 空闲连接超时时间
  connectionTimeoutMillis: 2000, // 连接超时时间
};

// 创建连接池
export const pool = new Pool(dbConfig);

// 监听连接池事件
pool.on('connect', () => {
  logger.info('[Database] 新的数据库连接已建立');
});

pool.on('error', (err) => {
  logger.error('[Database] 数据库连接池错误:', err);
});

// 测试数据库连接
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('[Database] 数据库连接成功:', result.rows[0]);
    return true;
  } catch (error: any) {
    logger.error('[Database] 数据库连接失败:', error.message);
    return false;
  }
}

// 初始化数据库表
export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 创建球队映射表
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_mappings (
        id UUID PRIMARY KEY,
        isports_en VARCHAR(255) NOT NULL,
        isports_cn VARCHAR(255) NOT NULL,
        crown_cn VARCHAR(255) NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建球队映射索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_team_mappings_isports_en ON team_mappings(isports_en)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_team_mappings_isports_cn ON team_mappings(isports_cn)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_team_mappings_crown_cn ON team_mappings(crown_cn)
    `);

    // 创建联赛映射表
    await client.query(`
      CREATE TABLE IF NOT EXISTS league_mappings (
        id UUID PRIMARY KEY,
        isports_en VARCHAR(255) NOT NULL,
        isports_cn VARCHAR(255) NOT NULL,
        crown_cn VARCHAR(255) NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建联赛映射索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_league_mappings_isports_en ON league_mappings(isports_en)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_league_mappings_isports_cn ON league_mappings(isports_cn)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_league_mappings_crown_cn ON league_mappings(crown_cn)
    `);

    // 创建皇冠赛事表
    await client.query(`
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
      )
    `);

    // 创建皇冠赛事索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_crown_matches_show_type ON crown_matches(show_type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_crown_matches_match_time ON crown_matches(match_time)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_crown_matches_league ON crown_matches(league)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_crown_matches_updated_at ON crown_matches(updated_at)
    `);

    // 创建第三方赔率表
    await client.query(`
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
      )
    `);

    // 创建第三方赔率索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_source ON thirdparty_matches(source)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_status ON thirdparty_matches(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_match_time ON thirdparty_matches(match_time)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_league_en ON thirdparty_matches(league_en)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thirdparty_matches_updated_at ON thirdparty_matches(updated_at)
    `);

    await client.query('COMMIT');
    logger.info('[Database] 数据库表初始化成功');
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('[Database] 数据库表初始化失败:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// 关闭数据库连接池
export async function closeDatabase(): Promise<void> {
  await pool.end();
  logger.info('[Database] 数据库连接池已关闭');
}

