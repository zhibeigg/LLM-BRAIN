import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'
import type { MemoryEdge, DifficultyType } from '../types/index.js'

interface EdgeRow {
  id: string
  source_id: string
  target_id: string
  base_difficulty: number
  difficulty_types: string
  difficulty_type_weights: string
  usage_count: number
  last_used_at: number | null
  created_at: number
}

function rowToEdge(row: EdgeRow): MemoryEdge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    baseDifficulty: row.base_difficulty,
    difficultyTypes: JSON.parse(row.difficulty_types) as DifficultyType[],
    difficultyTypeWeights: JSON.parse(row.difficulty_type_weights) as Record<string, number>,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at ?? undefined,
    createdAt: row.created_at,
  }
}

/**
 * 原子递增边的使用计数
 * 使用 SQL UPDATE 语句直接递增，避免读后写模式导致的并发问题
 */
export function incrementUsageCount(edgeId: string): boolean {
  const db = getDb()
  const stmt = db.prepare('UPDATE edges SET usage_count = usage_count + 1 WHERE id = ?')
  const result = stmt.run(edgeId)
  return result.changes > 0
}

/**
 * 批量更新边信息
 * 使用数据库事务保证原子性，所有更新要么全部成功，要么全部回滚
 */
export function batchUpdateEdges(
  updates: Array<{ id: string; usageCount?: number; lastUsedAt?: number }>
): { success: boolean; updatedCount: number; errors: string[] } {
  const db = getDb()
  const errors: string[] = []
  let updatedCount = 0

  const transaction = db.transaction(() => {
    for (const update of updates) {
      try {
        const fields: string[] = []
        const values: unknown[] = []

        if (update.usageCount !== undefined) {
          fields.push('usage_count = ?')
          values.push(update.usageCount)
        }
        if (update.lastUsedAt !== undefined) {
          fields.push('last_used_at = ?')
          values.push(update.lastUsedAt)
        }

        if (fields.length === 0) {
          errors.push(`Edge ${update.id}: 没有需要更新的字段`)
          continue
        }

        values.push(update.id)
        const stmt = db.prepare(`UPDATE edges SET ${fields.join(', ')} WHERE id = ?`)
        const result = stmt.run(...values)

        if (result.changes > 0) {
          updatedCount++
        } else {
          errors.push(`Edge ${update.id}: 未找到或未更新`)
        }
      } catch (err) {
        errors.push(`Edge ${update.id}: ${err instanceof Error ? err.message : String(err)}`)
        throw err // 事务中抛出错误会自动回滚
      }
    }
  })

  try {
    transaction()
    return { success: errors.length === 0, updatedCount, errors }
  } catch {
    return { success: false, updatedCount, errors }
  }
}

export function getAllEdges(): MemoryEdge[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM edges')
  const rows = stmt.all() as EdgeRow[]
  return rows.map(rowToEdge)
}

export function getEdgeById(id: string): MemoryEdge | null {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM edges WHERE id = ?')
  const row = stmt.get(id) as EdgeRow | undefined
  return row ? rowToEdge(row) : null
}

/**
 * 根据源节点ID获取所有边
 * 使用索引提示优化查询性能
 */
export function getEdgesBySourceId(sourceId: string): MemoryEdge[] {
  const db = getDb()
  // 使用 INDEXED BY 提示明确指定使用 source_id 索引
  const stmt = db.prepare('SELECT * FROM edges INDEXED BY idx_edges_source_id WHERE source_id = ?')
  const rows = stmt.all(sourceId) as EdgeRow[]
  return rows.map(rowToEdge)
}

/**
 * 根据目标节点ID获取所有边
 * 使用索引提示优化查询性能
 */
export function getEdgesByTargetId(targetId: string): MemoryEdge[] {
  const db = getDb()
  // 使用 INDEXED BY 提示明确指定使用 target_id 索引
  const stmt = db.prepare('SELECT * FROM edges INDEXED BY idx_edges_target_id WHERE target_id = ?')
  const rows = stmt.all(targetId) as EdgeRow[]
  return rows.map(rowToEdge)
}

export function createEdge(
  edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'usageCount' | 'perceivedDifficulty'>
): MemoryEdge {
  const db = getDb()
  const id = uuidv4()
  const now = Date.now()

  const stmt = db.prepare(`
    INSERT INTO edges (id, source_id, target_id, base_difficulty, difficulty_types, difficulty_type_weights, usage_count, last_used_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    edge.sourceId,
    edge.targetId,
    edge.baseDifficulty,
    JSON.stringify(edge.difficultyTypes),
    JSON.stringify(edge.difficultyTypeWeights),
    0,
    edge.lastUsedAt ?? null,
    now,
  )

  return {
    id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    baseDifficulty: edge.baseDifficulty,
    difficultyTypes: edge.difficultyTypes,
    difficultyTypeWeights: edge.difficultyTypeWeights,
    usageCount: 0,
    lastUsedAt: edge.lastUsedAt,
    createdAt: now,
  }
}

/**
 * 更新边信息
 * 使用动态字段更新，避免读后写模式
 */
export function updateEdge(
  id: string,
  updates: Partial<Pick<MemoryEdge, 'baseDifficulty' | 'difficultyTypes' | 'difficultyTypeWeights' | 'usageCount' | 'lastUsedAt'>>
): MemoryEdge | null {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.baseDifficulty !== undefined) {
    fields.push('base_difficulty = ?')
    values.push(updates.baseDifficulty)
  }
  if (updates.difficultyTypes !== undefined) {
    fields.push('difficulty_types = ?')
    values.push(JSON.stringify(updates.difficultyTypes))
  }
  if (updates.difficultyTypeWeights !== undefined) {
    fields.push('difficulty_type_weights = ?')
    values.push(JSON.stringify(updates.difficultyTypeWeights))
  }
  if (updates.usageCount !== undefined) {
    fields.push('usage_count = ?')
    values.push(updates.usageCount)
  }
  if (updates.lastUsedAt !== undefined) {
    fields.push('last_used_at = ?')
    values.push(updates.lastUsedAt)
  }

  if (fields.length === 0) {
    return getEdgeById(id)
  }

  values.push(id)

  const stmt = db.prepare(`UPDATE edges SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getEdgeById(id)
}

export function deleteEdge(id: string): boolean {
  const db = getDb()
  const stmt = db.prepare('DELETE FROM edges WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}
