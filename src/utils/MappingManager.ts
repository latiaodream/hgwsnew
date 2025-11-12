/**
 * 球队名称映射管理器
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TeamMapping, TeamMappingData } from '../types/mapping';
import logger from './logger';
import { TeamMappingRepository } from '../repositories/TeamMappingRepository';

export class MappingManager {
  private mappingFilePath: string;
  private mappings: Map<string, TeamMapping> = new Map();
  private repository: TeamMappingRepository;
  private useDatabase: boolean;
  private cacheLoaded: boolean = false;
  private cacheLoadPromise: Promise<void> | null = null;

  constructor(mappingFilePath?: string, useDatabase: boolean = true) {
    this.mappingFilePath = mappingFilePath || path.join(process.cwd(), 'data', 'team-mapping.json');
    this.useDatabase = useDatabase;
    this.repository = new TeamMappingRepository();
    this.loadMappings();
  }

  /**
   * 加载映射数据
   */
  private loadMappings(): void {
    try {
      if (!fs.existsSync(this.mappingFilePath)) {
        logger.warn(`[MappingManager] 映射文件不存在: ${this.mappingFilePath}`);
        this.saveMappings();
        return;
      }

      const data = fs.readFileSync(this.mappingFilePath, 'utf-8');
      const mappingData: TeamMappingData = JSON.parse(data);

      this.mappings.clear();
      mappingData.mappings.forEach(mapping => {
        this.mappings.set(mapping.id, mapping);
      });

      logger.info(`[MappingManager] 加载 ${this.mappings.size} 条映射`);
    } catch (error: any) {
      logger.error('[MappingManager] 加载映射失败:', error.message);
    }
  }

  /**
   * 保存映射数据
   */
  private async saveMappings(): Promise<void> {
    try {
      if (!this.useDatabase) {
        // 保存到 JSON 文件
        const mappingData: TeamMappingData = {
          mappings: Array.from(this.mappings.values()),
        };

        const dir = path.dirname(this.mappingFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(this.mappingFilePath, JSON.stringify(mappingData, null, 2), 'utf-8');
        logger.info(`[MappingManager] 保存 ${this.mappings.size} 条映射到文件`);
      }
      // 如果使用数据库，不需要手动保存，因为每个操作都会直接写入数据库
    } catch (error: any) {
      logger.error('[MappingManager] 保存映射失败:', error.message);
    }
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
          logger.info(`[MappingManager] 从数据库加载 ${mappings.length} 条映射到缓存`);
        }
        this.cacheLoaded = true;
      } catch (error: any) {
        logger.error('[MappingManager] 加载缓存失败:', error.message);
        throw error;
      } finally {
        this.cacheLoadPromise = null;
      }
    })();

    return this.cacheLoadPromise;
  }

  /**
   * 获取所有映射
   */
  async getAllMappings(): Promise<TeamMapping[]> {
    if (this.useDatabase) {
      await this.ensureCacheLoaded();
    }
    return Array.from(this.mappings.values());
  }

  /**
   * 根据 ID 获取映射
   */
  async getMappingById(id: string): Promise<TeamMapping | undefined> {
    if (this.useDatabase) {
      const mapping = await this.repository.findById(id);
      return mapping || undefined;
    }
    return this.mappings.get(id);
  }

  /**
   * 创建新映射
   */
  async createMapping(mapping: Omit<TeamMapping, 'id' | 'created_at' | 'updated_at'>): Promise<TeamMapping> {
    const newMapping: TeamMapping = {
      ...mapping,
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.useDatabase) {
      const created = await this.repository.create(newMapping);
      this.mappings.set(created.id, created);
      logger.info(`[MappingManager] 创建映射到数据库: ${created.id}`);
      return created;
    } else {
      this.mappings.set(newMapping.id, newMapping);
      await this.saveMappings();
      logger.info(`[MappingManager] 创建映射到文件: ${newMapping.id}`);
      return newMapping;
    }
  }

  /**
   * 更新映射
   */
  async updateMapping(id: string, updates: Partial<Omit<TeamMapping, 'id' | 'created_at'>>): Promise<TeamMapping | null> {
    if (this.useDatabase) {
      const updated = await this.repository.update(id, updates);
      if (updated) {
        this.mappings.set(id, updated);
        logger.info(`[MappingManager] 更新映射到数据库: ${id}`);
      } else {
        logger.warn(`[MappingManager] 映射不存在: ${id}`);
      }
      return updated;
    } else {
      const existing = this.mappings.get(id);
      if (!existing) {
        logger.warn(`[MappingManager] 映射不存在: ${id}`);
        return null;
      }

      const updated: TeamMapping = {
        ...existing,
        ...updates,
        id: existing.id,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
      };

      this.mappings.set(id, updated);
      await this.saveMappings();

      logger.info(`[MappingManager] 更新映射到文件: ${id}`);
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
        logger.info(`[MappingManager] 从数据库删除映射: ${id}`);
      } else {
        logger.warn(`[MappingManager] 映射不存在: ${id}`);
      }
      return deleted;
    } else {
      const deleted = this.mappings.delete(id);
      if (deleted) {
        await this.saveMappings();
        logger.info(`[MappingManager] 从文件删除映射: ${id}`);
      } else {
        logger.warn(`[MappingManager] 映射不存在: ${id}`);
      }
      return deleted;
    }
  }

  /**
   * 批量删除映射
   */
  async batchDelete(ids: string[]): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    if (this.useDatabase) {
      // 使用数据库批量删除
      for (const id of ids) {
        try {
          const result = await this.repository.delete(id);
          if (result) {
            this.mappings.delete(id);
            deleted++;
          } else {
            failed++;
          }
        } catch (error: any) {
          logger.error(`[MappingManager] 删除映射失败 ${id}:`, error.message);
          failed++;
        }
      }

      // 清除缓存
      this.clearCache();

      logger.info(`[MappingManager] 批量删除完成: 成功 ${deleted}, 失败 ${failed}`);
    } else {
      // 文件模式批量删除
      for (const id of ids) {
        if (this.mappings.delete(id)) {
          deleted++;
        } else {
          failed++;
        }
      }
      await this.saveMappings();
      logger.info(`[MappingManager] 批量删除完成（文件）: 成功 ${deleted}, 失败 ${failed}`);
    }

    return { deleted, failed };
  }

  /**
   * 批量导入映射
   */
  async importMappings(mappings: Omit<TeamMapping, 'id' | 'created_at' | 'updated_at'>[]): Promise<TeamMapping[]> {
    const imported: TeamMapping[] = [];

    if (this.useDatabase) {
      const fullMappings: TeamMapping[] = mappings.map(m => ({
        ...m,
        id: uuidv4(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await this.repository.createBatch(fullMappings);
      fullMappings.forEach(m => this.mappings.set(m.id, m));

      // 清除缓存，强制下次查询时重新加载
      this.clearCache();

      logger.info(`[MappingManager] 批量导入 ${fullMappings.length} 条映射到数据库`);
      return fullMappings;
    } else {
      for (const mapping of mappings) {
        const newMapping = await this.createMapping(mapping);
        imported.push(newMapping);
      }

      logger.info(`[MappingManager] 批量导入 ${imported.length} 条映射到文件`);
      return imported;
    }
  }

  /**
   * 验证映射
   */
  async verifyMapping(id: string): Promise<TeamMapping | null> {
    return this.updateMapping(id, { verified: true });
  }

  /**
   * 搜索映射
   */
  async searchMappings(query: string): Promise<TeamMapping[]> {
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
  async filterByVerified(verified: boolean): Promise<TeamMapping[]> {
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
  async findMappingByISportsName(isportsEn: string, isportsCn: string): Promise<TeamMapping | null> {
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
    logger.info('[MappingManager] 缓存已清除');
  }
}

