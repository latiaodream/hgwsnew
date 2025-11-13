import { pool } from '../config/database';
import { logger } from '../utils/logger';

export interface MatchHistory {
  id?: string;
  match_id: string;
  source: 'crown' | 'isports';
  snapshot_date: string; // YYYY-MM-DD
  data: any;
  created_at?: string;
}

export class MatchHistoryRepository {
  async insert(history: MatchHistory): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO match_history (match_id, source, snapshot_date, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (match_id, source, snapshot_date)
         DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [history.match_id, history.source, history.snapshot_date, JSON.stringify(history.data)]
      );
    } catch (error: any) {
      logger.error('[MatchHistoryRepository] 插入历史记录失败:', error.message);
      throw error;
    }
  }

  async bulkInsert(records: MatchHistory[]): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const history of records) {
        await client.query(
          `INSERT INTO match_history (match_id, source, snapshot_date, data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (match_id, source, snapshot_date)
           DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
          [history.match_id, history.source, history.snapshot_date, JSON.stringify(history.data)]
        );
      }
      await client.query('COMMIT');
      return records.length;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('[MatchHistoryRepository] 批量插入历史记录失败:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}
