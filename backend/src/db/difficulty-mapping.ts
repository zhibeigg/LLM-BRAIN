import { getDb } from './database.js'
import type { DifficultyPersonalityMapping, DifficultyType } from '../types/index.js'

interface MappingRow {
  difficulty_type: string
  dimension_id: string
  direction: number
  weight: number
}

function rowToMapping(row: MappingRow): DifficultyPersonalityMapping {
  return {
    difficultyType: row.difficulty_type as DifficultyType,
    dimensionId: row.dimension_id,
    direction: row.direction,
    weight: row.weight,
  }
}

export function getMappings(): DifficultyPersonalityMapping[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM difficulty_personality_mapping')
  const rows = stmt.all() as MappingRow[]
  return rows.map(rowToMapping)
}

export function getMappingsByType(difficultyType: DifficultyType): DifficultyPersonalityMapping[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM difficulty_personality_mapping WHERE difficulty_type = ?')
  const rows = stmt.all(difficultyType) as MappingRow[]
  return rows.map(rowToMapping)
}

export function setMapping(mapping: DifficultyPersonalityMapping): void {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO difficulty_personality_mapping (difficulty_type, dimension_id, direction, weight)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(difficulty_type, dimension_id) DO UPDATE SET
      direction = excluded.direction,
      weight = excluded.weight
  `)

  stmt.run(mapping.difficultyType, mapping.dimensionId, mapping.direction, mapping.weight)
}

export function deleteMapping(difficultyType: DifficultyType, dimensionId: string): boolean {
  const db = getDb()
  const stmt = db.prepare('DELETE FROM difficulty_personality_mapping WHERE difficulty_type = ? AND dimension_id = ?')
  const result = stmt.run(difficultyType, dimensionId)
  return result.changes > 0
}

export function initDefaultMappings(): void {
  // 旧的全局初始化，兼容迁移。新大脑使用 initDefaultMappingsForBrain
  const db = getDb()
  const { count } = db.prepare('SELECT COUNT(*) as count FROM difficulty_personality_mapping').get() as { count: number }
  if (count > 0) return
}

/** 为指定大脑初始化默认难度-性格映射 */
export function initDefaultMappingsForBrain(brainId: string): void {
  const db = getDb()

  const dimStmt = db.prepare('SELECT id FROM personality_dimensions WHERE brain_id = ? AND name = ?')
  const getDimId = (name: string): string | null => {
    const row = dimStmt.get(brainId, name) as { id: string } | undefined
    return row?.id ?? null
  }

  const diligenceId = getDimId('勤快度')
  const explorationId = getDimId('探索度')
  const rigorId = getDimId('严谨度')

  if (!diligenceId || !explorationId || !rigorId) return

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO difficulty_personality_mapping (difficulty_type, dimension_id, direction, weight)
    VALUES (?, ?, ?, ?)
  `)

  db.transaction(() => {
    insertStmt.run('computation', diligenceId, -1, 1.0)
    insertStmt.run('reasoning', diligenceId, -1, 0.7)
    insertStmt.run('reasoning', rigorId, -1, 0.5)
    insertStmt.run('creativity', explorationId, -1, 1.0)
    insertStmt.run('retrieval', rigorId, -1, 0.8)
    insertStmt.run('analysis', diligenceId, -1, 0.6)
    insertStmt.run('analysis', rigorId, -1, 0.6)
    insertStmt.run('synthesis', explorationId, -1, 0.7)
    insertStmt.run('synthesis', diligenceId, -1, 0.5)
  })()
}
