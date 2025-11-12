/**
 * 皇冠赛事数据库操作
 */

import { pool } from '../config/database';
import { logger } from '../utils/logger';

export interface CrownMatch {
  gid: string;
  show_type: string;
  league?: string;
  team_home?: string;
  team_away?: string;
  match_time?: string;
  handicap?: number;
  handicap_home?: number;
  handicap_away?: number;
  over_under?: number;
  over?: number;
  under?: number;
  home_win?: number;
  draw?: number;
  away_win?: number;
  strong?: string;
  more?: string;
  raw_data?: any;
  created_at?: string;
  updated_at?: string;
}

export class CrownMatchRepository {
  /**
   * 获取所有赛事
   */
  async findAll(showType?: string): Promise<CrownMatch[]> {
    try {
      let query = 'SELECT * FROM crown_matches';
      const params: any[] = [];

      if (showType) {
        query += ' WHERE show_type = $1';
        params.push(showType);
      }

      query += ' ORDER BY match_time ASC';

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error: any) {
      logger.error('[CrownMatchRepository] 获取所有赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据 GID 获取赛事
   */
  async findByGid(gid: string): Promise<CrownMatch | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM crown_matches WHERE gid = $1',
        [gid]
      );
      return result.rows[0] || null;
    } catch (error: any) {
      logger.error('[CrownMatchRepository] 根据 GID 获取赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建或更新赛事
   */
  async upsert(match: CrownMatch): Promise<CrownMatch> {
    try {
      const result = await pool.query(
        `INSERT INTO crown_matches (
          gid, show_type, league, team_home, team_away, match_time,
          handicap, handicap_home, handicap_away,
          over_under, over, under,
          home_win, draw, away_win,
          strong, more, raw_data, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (gid) DO UPDATE SET
          show_type = EXCLUDED.show_type,
          league = EXCLUDED.league,
          team_home = EXCLUDED.team_home,
          team_away = EXCLUDED.team_away,
          match_time = EXCLUDED.match_time,
          handicap = EXCLUDED.handicap,
          handicap_home = EXCLUDED.handicap_home,
          handicap_away = EXCLUDED.handicap_away,
          over_under = EXCLUDED.over_under,
          over = EXCLUDED.over,
          under = EXCLUDED.under,
          home_win = EXCLUDED.home_win,
          draw = EXCLUDED.draw,
          away_win = EXCLUDED.away_win,
          strong = EXCLUDED.strong,
          more = EXCLUDED.more,
          raw_data = EXCLUDED.raw_data,
          updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [
          match.gid,
          match.show_type,
          match.league,
          match.team_home,
          match.team_away,
          match.match_time,
          match.handicap,
          match.handicap_home,
          match.handicap_away,
          match.over_under,
          match.over,
          match.under,
          match.home_win,
          match.draw,
          match.away_win,
          match.strong,
          match.more,
          JSON.stringify(match.raw_data),
          match.created_at || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
      return result.rows[0];
    } catch (error: any) {
      logger.error('[CrownMatchRepository] 创建或更新赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量创建或更新赛事
   */
  async upsertBatch(matches: CrownMatch[]): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let count = 0;
      for (const match of matches) {
        await client.query(
          `INSERT INTO crown_matches (
            gid, show_type, league, team_home, team_away, match_time,
            handicap, handicap_home, handicap_away,
            over_under, over, under,
            home_win, draw, away_win,
            strong, more, raw_data, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (gid) DO UPDATE SET
            show_type = EXCLUDED.show_type,
            league = EXCLUDED.league,
            team_home = EXCLUDED.team_home,
            team_away = EXCLUDED.team_away,
            match_time = EXCLUDED.match_time,
            handicap = EXCLUDED.handicap,
            handicap_home = EXCLUDED.handicap_home,
            handicap_away = EXCLUDED.handicap_away,
            over_under = EXCLUDED.over_under,
            over = EXCLUDED.over,
            under = EXCLUDED.under,
            home_win = EXCLUDED.home_win,
            draw = EXCLUDED.draw,
            away_win = EXCLUDED.away_win,
            strong = EXCLUDED.strong,
            more = EXCLUDED.more,
            raw_data = EXCLUDED.raw_data,
            updated_at = EXCLUDED.updated_at`,
          [
            match.gid,
            match.show_type,
            match.league,
            match.team_home,
            match.team_away,
            match.match_time,
            match.handicap,
            match.handicap_home,
            match.handicap_away,
            match.over_under,
            match.over,
            match.under,
            match.home_win,
            match.draw,
            match.away_win,
            match.strong,
            match.more,
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
      logger.error('[CrownMatchRepository] 批量创建或更新赛事失败:', error.message);
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
        `DELETE FROM crown_matches 
         WHERE match_time < NOW() - INTERVAL '${days} days'`
      );
      return result.rowCount || 0;
    } catch (error: any) {
      logger.error('[CrownMatchRepository] 删除旧赛事失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    live: number;
    today: number;
    early: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE show_type = 'live') as live,
           COUNT(*) FILTER (WHERE show_type = 'today') as today,
           COUNT(*) FILTER (WHERE show_type = 'early') as early
         FROM crown_matches`
      );
      return {
        total: parseInt(result.rows[0].total),
        live: parseInt(result.rows[0].live),
        today: parseInt(result.rows[0].today),
        early: parseInt(result.rows[0].early),
      };
    } catch (error: any) {
      logger.error('[CrownMatchRepository] 获取统计信息失败:', error.message);
      throw error;
    }
  }
}

