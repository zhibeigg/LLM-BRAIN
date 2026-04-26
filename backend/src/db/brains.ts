import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'
import { createNode } from './nodes.js'
import { initBuiltinDimensionsForBrain } from './personality.js'
import { initDefaultMappingsForBrain } from './difficulty-mapping.js'
import type { Brain } from '../types/index.js'

interface BrainRow {
  id: string
  user_id: string
  name: string
  description: string
  project_path: string
  created_at: number
  updated_at: number
}

function rowToBrain(row: BrainRow): Brain {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    projectPath: row.project_path ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getAllBrains(userId?: string): Brain[] {
  const db = getDb()
  if (userId) {
    const rows = db.prepare('SELECT * FROM brains WHERE user_id = ? ORDER BY created_at DESC').all(userId) as BrainRow[]
    return rows.map(rowToBrain)
  }
  const rows = db.prepare('SELECT * FROM brains ORDER BY created_at DESC').all() as BrainRow[]
  return rows.map(rowToBrain)
}

export function getBrainById(id: string): Brain | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM brains WHERE id = ?').get(id) as BrainRow | undefined
  return row ? rowToBrain(row) : null
}

export function createBrain(name: string, description: string = '', userId: string = '', projectPath: string = ''): Brain {
  const db = getDb()
  const id = uuidv4()
  const now = Date.now()

  db.prepare('INSERT INTO brains (id, user_id, name, description, project_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, name, description, projectPath, now, now)

  // 初始化内置性格维度
  initBuiltinDimensionsForBrain(id)

  // 初始化默认难度-性格映射
  initDefaultMappingsForBrain(id)

  // 创建入口性格节点（原点）
  createNode({
    brainId: id,
    type: 'personality',
    title: `${name} 的性格`,
    content: '这是大脑的入口性格节点，所有路径从这里开始。',
    tags: ['入口', '性格'],
    confidence: 1.0,
    positionX: 0,
    positionY: 0,
  })

  return { id, userId, name, description, projectPath, createdAt: now, updatedAt: now }
}

export function updateBrain(id: string, updates: Partial<Pick<Brain, 'name' | 'description' | 'projectPath'>>): Brain | null {
  const existing = getBrainById(id)
  if (!existing) return null

  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    fields.push('description = ?')
    values.push(updates.description)
  }
  if (updates.projectPath !== undefined) {
    fields.push('project_path = ?')
    values.push(updates.projectPath)
  }

  if (fields.length === 0) return existing

  fields.push('updated_at = ?')
  values.push(Date.now())
  values.push(id)

  db.prepare(`UPDATE brains SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getBrainById(id)
}

export function deleteBrain(id: string): boolean {
  const db = getDb()
  // 手动级联删除（SQLite ALTER TABLE 不支持外键约束）
  db.transaction(() => {
    // 先删除该大脑的边（通过节点关联）
    db.prepare(`DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE brain_id = ?)`).run(id)
    // 删除难度映射（通过维度关联）
    db.prepare(`DELETE FROM difficulty_personality_mapping WHERE dimension_id IN (SELECT id FROM personality_dimensions WHERE brain_id = ?)`).run(id)
    // 删除性格维度
    db.prepare('DELETE FROM personality_dimensions WHERE brain_id = ?').run(id)
    // 删除节点
    db.prepare('DELETE FROM nodes WHERE brain_id = ?').run(id)
    // 删除执行历史
    db.prepare('DELETE FROM execution_history WHERE brain_id = ?').run(id)
    // 删除大脑本身
    db.prepare('DELETE FROM brains WHERE id = ?').run(id)
  })()
  return true
}
