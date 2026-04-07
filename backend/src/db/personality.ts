import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'
import type { PersonalityDimension } from '../types/index.js'
import { BUILTIN_DIMENSIONS } from '../types/index.js'

interface DimensionRow {
  id: string
  brain_id: string
  name: string
  description: string
  value: number
  is_builtin: number
  sort_order: number
}

function rowToDimension(row: DimensionRow): PersonalityDimension {
  return {
    id: row.id,
    brainId: row.brain_id,
    name: row.name,
    description: row.description,
    value: row.value,
    isBuiltin: row.is_builtin === 1,
    sortOrder: row.sort_order,
  }
}

export function getAllDimensions(): PersonalityDimension[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM personality_dimensions ORDER BY sort_order ASC').all() as DimensionRow[]
  return rows.map(rowToDimension)
}

export function getDimensionsByBrainId(brainId: string): PersonalityDimension[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM personality_dimensions WHERE brain_id = ? ORDER BY sort_order ASC').all(brainId) as DimensionRow[]
  return rows.map(rowToDimension)
}

export function getDimensionById(id: string): PersonalityDimension | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM personality_dimensions WHERE id = ?').get(id) as DimensionRow | undefined
  return row ? rowToDimension(row) : null
}

export function createDimension(
  dim: Omit<PersonalityDimension, 'id'>
): PersonalityDimension {
  const db = getDb()
  const id = uuidv4()

  db.prepare(`
    INSERT INTO personality_dimensions (id, brain_id, name, description, value, is_builtin, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, dim.brainId, dim.name, dim.description, dim.value, dim.isBuiltin ? 1 : 0, dim.sortOrder)

  return { id, ...dim }
}

export function updateDimension(
  id: string,
  updates: Partial<Pick<PersonalityDimension, 'name' | 'description' | 'value' | 'sortOrder'>>
): PersonalityDimension | null {
  const existing = getDimensionById(id)
  if (!existing) return null

  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
  if (updates.value !== undefined) { fields.push('value = ?'); values.push(updates.value) }
  if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder) }

  if (fields.length === 0) return existing

  values.push(id)
  db.prepare(`UPDATE personality_dimensions SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getDimensionById(id)
}

export function deleteDimension(id: string): boolean {
  const db = getDb()
  return db.prepare('DELETE FROM personality_dimensions WHERE id = ?').run(id).changes > 0
}

/** 为指定大脑初始化内置维度 */
export function initBuiltinDimensionsForBrain(brainId: string): void {
  const db = getDb()
  const insertStmt = db.prepare(`
    INSERT INTO personality_dimensions (id, brain_id, name, description, value, is_builtin, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    for (const dim of BUILTIN_DIMENSIONS) {
      insertStmt.run(uuidv4(), brainId, dim.name, dim.description, dim.value, dim.isBuiltin ? 1 : 0, dim.sortOrder)
    }
  })()
}

/** 旧的全局初始化（兼容迁移） */
export function initBuiltinDimensions(): void {
  const db = getDb()
  const { count } = db.prepare('SELECT COUNT(*) as count FROM personality_dimensions').get() as { count: number }
  if (count > 0) return

  // 如果没有任何维度，说明是全新数据库，不需要在这里初始化
  // 维度会在创建大脑时初始化
}

export function getMaxDimensions(): number {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'max_dimensions'").get() as { value: string } | undefined
  return row ? parseInt(row.value, 10) : 10
}

export function setMaxDimensions(max: number): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('max_dimensions', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(max))
}
