import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'
import type { MemoryNode, NodeType } from '../types/index.js'

interface NodeRow {
  id: string
  brain_id: string
  type: string
  title: string
  content: string
  tags: string
  confidence: number
  source_path_id: string | null
  personality_label: string | null
  position_x: number
  position_y: number
  created_at: number
  updated_at: number
}

function rowToNode(row: NodeRow): MemoryNode {
  return {
    id: row.id,
    brainId: row.brain_id,
    type: row.type as NodeType,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags),
    confidence: row.confidence,
    sourcePathId: row.source_path_id ?? undefined,
    personalityLabel: row.personality_label ?? undefined,
    positionX: row.position_x,
    positionY: row.position_y,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getAllNodes(): MemoryNode[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM nodes').all() as NodeRow[]
  return rows.map(rowToNode)
}

export function getNodesByBrainId(brainId: string): MemoryNode[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM nodes WHERE brain_id = ?').all(brainId) as NodeRow[]
  return rows.map(rowToNode)
}

export function getNodeById(id: string): MemoryNode | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined
  return row ? rowToNode(row) : null
}

export function getNodesByType(type: NodeType): MemoryNode[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM nodes WHERE type = ?').all(type) as NodeRow[]
  return rows.map(rowToNode)
}

export function createNode(
  node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>
): MemoryNode {
  const db = getDb()
  const id = uuidv4()
  const now = Date.now()

  const stmt = db.prepare(`
    INSERT INTO nodes (id, brain_id, type, title, content, tags, confidence, source_path_id, personality_label, position_x, position_y, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    node.brainId,
    node.type,
    node.title,
    node.content,
    JSON.stringify(node.tags),
    node.confidence,
    node.sourcePathId ?? null,
    node.personalityLabel ?? null,
    node.positionX,
    node.positionY,
    now,
    now,
  )

  return {
    id,
    ...node,
    createdAt: now,
    updatedAt: now,
  }
}

export function updateNode(
  id: string,
  updates: Partial<Pick<MemoryNode, 'title' | 'content' | 'tags' | 'confidence' | 'positionX' | 'positionY'>>
): MemoryNode | null {
  const existing = getNodeById(id)
  if (!existing) return null

  const db = getDb()
  const now = Date.now()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined) {
    fields.push('title = ?')
    values.push(updates.title)
  }
  if (updates.content !== undefined) {
    fields.push('content = ?')
    values.push(updates.content)
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?')
    values.push(JSON.stringify(updates.tags))
  }
  if (updates.confidence !== undefined) {
    fields.push('confidence = ?')
    values.push(updates.confidence)
  }
  if (updates.positionX !== undefined) {
    fields.push('position_x = ?')
    values.push(updates.positionX)
  }
  if (updates.positionY !== undefined) {
    fields.push('position_y = ?')
    values.push(updates.positionY)
  }

  if (fields.length === 0) return existing

  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  const stmt = db.prepare(`UPDATE nodes SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getNodeById(id)
}

export function deleteNode(id: string): boolean {
  const db = getDb()
  const stmt = db.prepare('DELETE FROM nodes WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}
