/**
 * 联赛名称映射管理器
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LeagueMapping, LeagueMappingData } from '../types/league-mapping';
import logger from './logger';
import { LeagueMappingRepository } from '../repositories/LeagueMappingRepository';

export class LeagueMappingManager {
  private mappingFilePath: string;
  private mappings: Map<string, LeagueMapping> = new Map();
  private repository: LeagueMappingRepository;
  private useDatabase: boolean;
  private cacheLoaded: boolean = false;
  private cacheLoadPromise: Promise<void> | null = null;

  constructor(mappingFilePath?: string, useDatabase: boolean = true) {
    this.mappingFilePath = mappingFilePath || path.join(process.cwd(), 'data', 'league-mapping.json');
    this.useDatabase = useDatabase;
    this.repository = new LeagueMappingRepository();
    this.loadMappings();
  }

  /**
   * 确保缓存已加载
   */
  private async ensureCacheLoaded(): Promise<void> {
    if (this.cacheLoaded) {
      return;
    }

    // 如果正在加载，等待加载完成
    if (this.cacheLoadPromise) {
      return this.cacheLoadPromise;
    }

    // 开始加载
    this.cacheLoadPromise = (async () => {
      try {
        if (this.useDatabase) {
          const mappings = await this.repository.findAll();
          this.mappings.clear();
          mappings.forEach(m => this.mappings.set(m.id, m));
          logger.info(`[LeagueMappingManager] 从数据库加载 ${mappings.length} 条映射到缓存`);
        }
        this.cacheLoaded = true;
      } catch (error: any) {
        logger.error('[LeagueMappingManager] 加载缓存失败:', error.message);
        throw error;
      } finally {
        this.cacheLoadPromise = null;
      }
    })();

    return this.cacheLoadPromise;
  }

  /**
   * 加载映射数据
   */
  private async loadMappings(): Promise<void> {
    try {
      if (this.useDatabase) {
        const mappings = await this.repository.findAll();
        this.mappings.clear();
        mappings.forEach(mapping => {
          this.mappings.set(mapping.id, mapping);
        });
        logger.info(`[LeagueMappingManager] 从数据库加载 ${this.mappings.size} 条联赛映射`);
      } else {
        if (!fs.existsSync(this.mappingFilePath)) {
          logger.warn(`[LeagueMappingManager] 映射文件不存在: ${this.mappingFilePath}`);
          this.saveMappings();
          return;
        }

        const data = fs.readFileSync(this.mappingFilePath, 'utf-8');
        const mappingData: LeagueMappingData = JSON.parse(data);

        this.mappings.clear();
        mappingData.mappings.forEach(mapping => {
          this.mappings.set(mapping.id, mapping);
        });

        logger.info(`[LeagueMappingManager] 从文件加载 ${this.mappings.size} 条联赛映射`);
      }
    } catch (error: any) {
      logger.error('[LeagueMappingManager] 加载映射失败:', error.message);
    }
  }

  /**
   * 保存映射数据
   */
  private async saveMappings(): Promise<void> {
    try {
      if (!this.useDatabase) {
        const mappingData: LeagueMappingData = {
          mappings: Array.from(this.mappings.values()),
        };

        const dir = path.dirname(this.mappingFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(this.mappingFilePath, JSON.stringify(mappingData, null, 2), 'utf-8');
        logger.info(`[LeagueMappingManager] 保存 ${this.mappings.size} 条联赛映射到文件`);
      }
    } catch (error: any) {
      logger.error('[LeagueMappingManager] 保存映射失败:', error.message);
    }
  }

  /**
   * 获取所有映射
   */
  async getAllMappings(): Promise<LeagueMapping[]> {
    if (this.useDatabase) {
      return await this.repository.findAll();
    }
    return Array.from(this.mappings.values());
  }

  /**
   * 根据 ID 获取映射
   */
  async getMappingById(id: string): Promise<LeagueMapping | undefined> {
    if (this.useDatabase) {
      const mapping = await this.repository.findById(id);
      return mapping || undefined;
    }
    return this.mappings.get(id);
  }

  /**
   * 根据 iSports 英文名查找映射
   */
  findByISportsEn(isportsEn: string): LeagueMapping | undefined {
    return Array.from(this.mappings.values()).find(
      m => m.isports_en.toLowerCase() === isportsEn.toLowerCase()
    );
  }

  /**
   * 根据 iSports 中文名查找映射
   */
  findByISportsCn(isportsCn: string): LeagueMapping | undefined {
    return Array.from(this.mappings.values()).find(
      m => m.isports_cn.toLowerCase() === isportsCn.toLowerCase()
    );
  }

  /**
   * 根据皇冠中文名查找映射
   */
  findByCrownCn(crownCn: string): LeagueMapping | undefined {
    return Array.from(this.mappings.values()).find(
      m => m.crown_cn.toLowerCase() === crownCn.toLowerCase()
    );
  }

  /**
   * 创建新映射
   */
  async createMapping(mapping: Omit<LeagueMapping, 'id' | 'created_at' | 'updated_at'>): Promise<LeagueMapping> {
    const newMapping: LeagueMapping = {
      ...mapping,
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.useDatabase) {
      const created = await this.repository.create(newMapping);
      this.mappings.set(created.id, created);
      logger.info(`[LeagueMappingManager] 创建映射到数据库: ${created.id}`);
      return created;
    } else {
      this.mappings.set(newMapping.id, newMapping);
      await this.saveMappings();
      logger.info(`[LeagueMappingManager] 创建映射到文件: ${newMapping.id}`);
      return newMapping;
    }
  }

  /**
   * 更新映射
   */
  async updateMapping(id: string, updates: Partial<Omit<LeagueMapping, 'id' | 'created_at'>>): Promise<LeagueMapping | null> {
    if (this.useDatabase) {
      const updated = await this.repository.update(id, updates);
      if (updated) {
        this.mappings.set(id, updated);
        logger.info(`[LeagueMappingManager] 更新映射到数据库: ${id}`);
      } else {
        logger.warn(`[LeagueMappingManager] 映射不存在: ${id}`);
      }
      return updated;
    } else {
      const existing = this.mappings.get(id);
      if (!existing) {
        logger.warn(`[LeagueMappingManager] 映射不存在: ${id}`);
        return null;
      }

      const updated: LeagueMapping = {
        ...existing,
        ...updates,
        id: existing.id,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
      };

      this.mappings.set(id, updated);
      await this.saveMappings();

      logger.info(`[LeagueMappingManager] 更新映射到文件: ${id}`);
      return updated;
    }
  }

  /**
   * 删除映射
   */
  async deleteMapping(id: string): Promise<boolean> {
    if (this.useDatabase) {
      const deleted = await this.repository.delete(id);
      if (deleted) {
        this.mappings.delete(id);
        logger.info(`[LeagueMappingManager] 从数据库删除映射: ${id}`);
      } else {
        logger.warn(`[LeagueMappingManager] 映射不存在: ${id}`);
      }
      return deleted;
    } else {
      const deleted = this.mappings.delete(id);
      if (deleted) {
        await this.saveMappings();
        logger.info(`[LeagueMappingManager] 从文件删除映射: ${id}`);
      } else {
        logger.warn(`[LeagueMappingManager] 映射不存在: ${id}`);
      }
      return deleted;
    }
  }

  /**
   * 批量导入映射
   */
  async importMappings(mappings: Omit<LeagueMapping, 'id' | 'created_at' | 'updated_at'>[]): Promise<LeagueMapping[]> {
    const imported: LeagueMapping[] = [];

    if (this.useDatabase) {
      const fullMappings: LeagueMapping[] = mappings.map(m => ({
        ...m,
        id: uuidv4(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await this.repository.createBatch(fullMappings);
      fullMappings.forEach(m => this.mappings.set(m.id, m));
      logger.info(`[LeagueMappingManager] 批量导入 ${fullMappings.length} 条联赛映射到数据库`);
      return fullMappings;
    } else {
      for (const mapping of mappings) {
        const newMapping = await this.createMapping(mapping);
        imported.push(newMapping);
      }

      logger.info(`[LeagueMappingManager] 批量导入 ${imported.length} 条联赛映射到文件`);
      return imported;
    }
  }

  /**
   * 验证映射
   */
  async verifyMapping(id: string): Promise<LeagueMapping | null> {
    return this.updateMapping(id, { verified: true });
  }

  /**
   * 搜索映射
   */
  async searchMappings(query: string): Promise<LeagueMapping[]> {
    if (this.useDatabase) {
      return await this.repository.search(query);
    } else {
      const lowerQuery = query.toLowerCase();
      return Array.from(this.mappings.values()).filter(mapping => {
        return (
          mapping.isports_en.toLowerCase().includes(lowerQuery) ||
          mapping.isports_cn.toLowerCase().includes(lowerQuery) ||
          mapping.crown_cn.toLowerCase().includes(lowerQuery)
        );
      });
    }
  }

  /**
   * 按验证状态筛选
   */
  async filterByVerified(verified: boolean): Promise<LeagueMapping[]> {
    if (this.useDatabase) {
      return await this.repository.findByVerified(verified);
    } else {
      return Array.from(this.mappings.values()).filter(mapping => mapping.verified === verified);
    }
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    verified: number;
    unverified: number;
  }> {
    if (this.useDatabase) {
      return await this.repository.getStatistics();
    } else {
      const all = Array.from(this.mappings.values());
      return {
        total: all.length,
        verified: all.filter(m => m.verified).length,
        unverified: all.filter(m => !m.verified).length,
      };
    }
  }

  /**
   * 重新加载映射
   */
  async reload(): Promise<void> {
    await this.loadMappings();
  }

  /**
   * 根据 iSports 名称查找映射
   */
  async findMappingByISportsName(isportsEn: string, isportsCn: string): Promise<LeagueMapping | null> {
    if (this.useDatabase) {
      // 确保缓存已加载
      await this.ensureCacheLoaded();
      // 从缓存查找
      return Array.from(this.mappings.values()).find(m =>
        m.isports_en === isportsEn || m.isports_cn === isportsCn
      ) || null;
    } else {
      // 从内存查找
      return Array.from(this.mappings.values()).find(m =>
        m.isports_en === isportsEn || m.isports_cn === isportsCn
      ) || null;
    }
  }

  /**
   * 清除缓存（在数据更新后调用）
   */
  clearCache(): void {
    this.cacheLoaded = false;
    logger.info('[LeagueMappingManager] 缓存已清除');
  }
}

