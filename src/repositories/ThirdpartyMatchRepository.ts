/**
 * 第三方赔率数据库操作
 */

import { pool } from '../config/database';
import { logger } from '../utils/logger';

export interface ThirdpartyMatch {
  id: string;
  source: string;
  status?: string;
  league_en?: string;
  league_cn?: string;
  team_home_en?: string;
  team_home_cn?: string;
  team_away_en?: string;
  team_away_cn?: string;
  match_time?: string;
  handicap?: any;
  totals?: any;
  moneyline?: any;
  raw_data?: any;
  created_at?: string;
  updated_at?: string;
}

export class ThirdpartyMatchRepository {
  /**
   * 获取所有赛事
   */
  async findAll(source?: string, status?: string): Promise<ThirdpartyMatch[]> {
    try {
      let query = 'SELECT * FROM thirdparty_matches WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (source) {
        query += ` AND source = $${paramIndex++}`;
        params.push(source);
      }

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      query += ' ORDER BY match_time ASC';

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error: any) {
      logger.error('[ThirdpartyMatchRepository] 获取所有赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据 ID 获取赛事
   */
  async findById(id: string): Promise<ThirdpartyMatch | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM thirdparty_matches WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error: any) {
      logger.error('[ThirdpartyMatchRepository] 根据 ID 获取赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建或更新赛事
   */
  async upsert(match: ThirdpartyMatch): Promise<ThirdpartyMatch> {
    try {
      const result = await pool.query(
        `INSERT INTO thirdparty_matches (
          id, source, status, league_en, league_cn,
          team_home_en, team_home_cn, team_away_en, team_away_cn,
          match_time, handicap, totals, moneyline, raw_data,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          source = EXCLUDED.source,
          status = EXCLUDED.status,
          league_en = EXCLUDED.league_en,
          league_cn = EXCLUDED.league_cn,
          team_home_en = EXCLUDED.team_home_en,
          team_home_cn = EXCLUDED.team_home_cn,
          team_away_en = EXCLUDED.team_away_en,
          team_away_cn = EXCLUDED.team_away_cn,
          match_time = EXCLUDED.match_time,
          handicap = EXCLUDED.handicap,
          totals = EXCLUDED.totals,
          moneyline = EXCLUDED.moneyline,
          raw_data = EXCLUDED.raw_data,
          updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [
          match.id,
          match.source,
          match.status,
          match.league_en,
          match.league_cn,
          match.team_home_en,
          match.team_home_cn,
          match.team_away_en,
          match.team_away_cn,
          match.match_time,
          JSON.stringify(match.handicap),
          JSON.stringify(match.totals),
          JSON.stringify(match.moneyline),
          JSON.stringify(match.raw_data),
          match.created_at || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
      return result.rows[0];
    } catch (error: any) {
      logger.error('[ThirdpartyMatchRepository] 创建或更新赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量创建或更新赛事
   */
  async upsertBatch(matches: ThirdpartyMatch[]): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let count = 0;
      for (const match of matches) {
        await client.query(
          `INSERT INTO thirdparty_matches (
            id, source, status, league_en, league_cn,
            team_home_en, team_home_cn, team_away_en, team_away_cn,
            match_time, handicap, totals, moneyline, raw_data,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            source = EXCLUDED.source,
            status = EXCLUDED.status,
            league_en = EXCLUDED.league_en,
            league_cn = EXCLUDED.league_cn,
            team_home_en = EXCLUDED.team_home_en,
            team_home_cn = EXCLUDED.team_home_cn,
            team_away_en = EXCLUDED.team_away_en,
            team_away_cn = EXCLUDED.team_away_cn,
            match_time = EXCLUDED.match_time,
            handicap = EXCLUDED.handicap,
            totals = EXCLUDED.totals,
            moneyline = EXCLUDED.moneyline,
            raw_data = EXCLUDED.raw_data,
            updated_at = EXCLUDED.updated_at`,
          [
            match.id,
            match.source,
            match.status,
            match.league_en,
            match.league_cn,
            match.team_home_en,
            match.team_home_cn,
            match.team_away_en,
            match.team_away_cn,
            match.match_time,
            JSON.stringify(match.handicap),
            JSON.stringify(match.totals),
            JSON.stringify(match.moneyline),
            JSON.stringify(match.raw_data),
            match.created_at || new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
        count++;
      }

      await client.query('COMMIT');
      return count;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('[ThirdpartyMatchRepository] 批量创建或更新赛事失败:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 删除旧赛事（超过指定天数）
   */
  async deleteOldMatches(days: number): Promise<number> {
    try {
      const result = await pool.query(
        `DELETE FROM thirdparty_matches 
         WHERE match_time < NOW() - INTERVAL '${days} days'`
      );
      return result.rowCount || 0;
    } catch (error: any) {
      logger.error('[ThirdpartyMatchRepository] 删除旧赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    isports: number;
    oddsapi: number;
    live: number;
    upcoming: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE source = 'isports') as isports,
           COUNT(*) FILTER (WHERE source = 'oddsapi') as oddsapi,
           COUNT(*) FILTER (WHERE status = 'live') as live,
           COUNT(*) FILTER (WHERE status = 'upcoming') as upcoming
         FROM thirdparty_matches`
      );
      return {
        total: parseInt(result.rows[0].total),
        isports: parseInt(result.rows[0].isports),
        oddsapi: parseInt(result.rows[0].oddsapi),
        live: parseInt(result.rows[0].live),
        upcoming: parseInt(result.rows[0].upcoming),
      };
    } catch (error: any) {
      logger.error('[ThirdpartyMatchRepository] 获取统计信息失败:', error.message);
      throw error;
    }
  }
}

