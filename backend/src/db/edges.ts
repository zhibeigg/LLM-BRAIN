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

export function getEdgesBySourceId(sourceId: string): MemoryEdge[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM edges WHERE source_id = ?')
  const rows = stmt.all(sourceId) as EdgeRow[]
  return rows.map(rowToEdge)
}

export function getEdgesByTargetId(targetId: string): MemoryEdge[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM edges WHERE target_id = ?')
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

export function updateEdge(
  id: string,
  updates: Partial<Pick<MemoryEdge, 'baseDifficulty' | 'difficultyTypes' | 'difficultyTypeWeights' | 'usageCount' | 'lastUsedAt'>>
): MemoryEdge | null {
  const existing = getEdgeById(id)
  if (!existing) return null

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

  if (fields.length === 0) return existing

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
