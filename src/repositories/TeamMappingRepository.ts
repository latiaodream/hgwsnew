/**
 * 球队映射数据库操作
 */

import { pool } from '../config/database';
import { TeamMapping } from '../types/mapping';
import { logger } from '../utils/logger';

export class TeamMappingRepository {
  /**
   * 获取所有球队映射
   */
  async findAll(): Promise<TeamMapping[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM team_mappings ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 获取所有映射失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据 ID 获取球队映射
   */
  async findById(id: string): Promise<TeamMapping | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM team_mappings WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 根据 ID 获取映射失败:', error.message);
      throw error;
    }
  }

  /**
   * 搜索球队映射
   */
  async search(query: string): Promise<TeamMapping[]> {
    try {
      const searchPattern = `%${query}%`;
      const result = await pool.query(
        `SELECT * FROM team_mappings 
         WHERE isports_en ILIKE $1 
            OR isports_cn ILIKE $1 
            OR crown_cn ILIKE $1
         ORDER BY created_at DESC`,
        [searchPattern]
      );
      return result.rows;
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 搜索映射失败:', error.message);
      throw error;
    }
  }

  /**
   * 按验证状态筛选
   */
  async findByVerified(verified: boolean): Promise<TeamMapping[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM team_mappings WHERE verified = $1 ORDER BY created_at DESC',
        [verified]
      );
      return result.rows;
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 按验证状态筛选失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建球队映射
   */
  async create(mapping: TeamMapping): Promise<TeamMapping> {
    try {
      const result = await pool.query(
        `INSERT INTO team_mappings (id, isports_en, isports_cn, crown_cn, verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          mapping.id,
          mapping.isports_en,
          mapping.isports_cn,
          mapping.crown_cn,
          mapping.verified,
          mapping.created_at,
          mapping.updated_at,
        ]
      );
      return result.rows[0];
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 创建映射失败:', error.message);
      throw error;
    }
  }

  /**
   * 更新球队映射
   */
  async update(id: string, mapping: Partial<TeamMapping>): Promise<TeamMapping | null> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (mapping.isports_en !== undefined) {
        fields.push(`isports_en = $${paramIndex++}`);
        values.push(mapping.isports_en);
      }
      if (mapping.isports_cn !== undefined) {
        fields.push(`isports_cn = $${paramIndex++}`);
        values.push(mapping.isports_cn);
      }
      if (mapping.crown_cn !== undefined) {
        fields.push(`crown_cn = $${paramIndex++}`);
        values.push(mapping.crown_cn);
      }
      if (mapping.verified !== undefined) {
        fields.push(`verified = $${paramIndex++}`);
        values.push(mapping.verified);
      }

      fields.push(`updated_at = $${paramIndex++}`);
      values.push(new Date().toISOString());

      values.push(id);

      const result = await pool.query(
        `UPDATE team_mappings SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return result.rows[0] || null;
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 更新映射失败:', error.message);
      throw error;
    }
  }

  /**
   * 删除球队映射
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'DELETE FROM team_mappings WHERE id = $1',
        [id]
      );
      return (result.rowCount || 0) > 0;
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 删除映射失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量创建球队映射
   */
  async createBatch(mappings: TeamMapping[]): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let count = 0;
      for (const mapping of mappings) {
        await client.query(
          `INSERT INTO team_mappings (id, isports_en, isports_cn, crown_cn, verified, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             isports_en = EXCLUDED.isports_en,
             isports_cn = EXCLUDED.isports_cn,
             crown_cn = EXCLUDED.crown_cn,
             verified = EXCLUDED.verified,
             updated_at = EXCLUDED.updated_at`,
          [
            mapping.id,
            mapping.isports_en,
            mapping.isports_cn,
            mapping.crown_cn,
            mapping.verified,
            mapping.created_at,
            mapping.updated_at,
          ]
        );
        count++;
      }

      await client.query('COMMIT');
      return count;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('[TeamMappingRepository] 批量创建映射失败:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{ total: number; verified: number; unverified: number }> {
    try {
      const result = await pool.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE verified = true) as verified,
           COUNT(*) FILTER (WHERE verified = false) as unverified
         FROM team_mappings`
      );
      return {
        total: parseInt(result.rows[0].total),
        verified: parseInt(result.rows[0].verified),
        unverified: parseInt(result.rows[0].unverified),
      };
    } catch (error: any) {
      logger.error('[TeamMappingRepository] 获取统计信息失败:', error.message);
      throw error;
    }
  }
}

