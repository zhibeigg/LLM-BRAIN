import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'

export interface ChatSessionRow {
  id: string
  user_id: string
  brain_id: string
  type: string
  prompt: string
  agent_output: string
  thinking_steps: string
  status: string
  created_at: number
  updated_at: number
}

export interface ChatSession {
  id: string
  userId: string
  brainId: string
  type: 'task' | 'learn'
  prompt: string
  agentOutput: string
  thinkingSteps: unknown[]
  status: 'running' | 'success' | 'error'
  createdAt: number
  updatedAt: number
}

function rowToSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    userId: row.user_id,
    brainId: row.brain_id,
    type: row.type as ChatSession['type'],
    prompt: row.prompt,
    agentOutput: row.agent_output,
    thinkingSteps: JSON.parse(row.thinking_steps),
    status: row.status as ChatSession['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getSessionsByUser(userId: string, brainId?: string, limit = 50): ChatSession[] {
  const db = getDb()
  if (brainId) {
    const rows = db.prepare(
      'SELECT * FROM chat_sessions WHERE user_id = ? AND brain_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, brainId, limit) as ChatSessionRow[]
    return rows.map(rowToSession)
  }
  const rows = db.prepare(
    'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit) as ChatSessionRow[]
  return rows.map(rowToSession)
}

export interface PaginatedSessions {
  items: ChatSession[]
  hasMore: boolean
  nextCursor?: number
}

export function getSessionsByUserPaginated(
  userId: string,
  brainId?: string,
  cursor?: number,
  limit = 20,
): PaginatedSessions {
  const db = getDb()
  const fetchLimit = limit + 1 // 多取一条判断 hasMore

  let rows: ChatSessionRow[]
  if (brainId && cursor) {
    rows = db.prepare(
      'SELECT * FROM chat_sessions WHERE user_id = ? AND brain_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, brainId, cursor, fetchLimit) as ChatSessionRow[]
  } else if (brainId) {
    rows = db.prepare(
      'SELECT * FROM chat_sessions WHERE user_id = ? AND brain_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, brainId, fetchLimit) as ChatSessionRow[]
  } else if (cursor) {
    rows = db.prepare(
      'SELECT * FROM chat_sessions WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, cursor, fetchLimit) as ChatSessionRow[]
  } else {
    rows = db.prepare(
      'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, fetchLimit) as ChatSessionRow[]
  }

  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map(rowToSession)
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : undefined

  return { items, hasMore, nextCursor }
}

export function getSessionById(id: string, userId: string): ChatSession | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?'
  ).get(id, userId) as ChatSessionRow | undefined
  return row ? rowToSession(row) : null
}

export function createSession(data: {
  userId: string
  brainId: string
  type: 'task' | 'learn'
  prompt: string
}): ChatSession {
  const db = getDb()
  const id = uuidv4()
  const now = Date.now()

  db.prepare(`
    INSERT INTO chat_sessions (id, user_id, brain_id, type, prompt, agent_output, thinking_steps, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', '[]', 'running', ?, ?)
  `).run(id, data.userId, data.brainId, data.type, data.prompt, now, now)

  return {
    id,
    userId: data.userId,
    brainId: data.brainId,
    type: data.type,
    prompt: data.prompt,
    agentOutput: '',
    thinkingSteps: [],
    status: 'running',
    createdAt: now,
    updatedAt: now,
  }
}

export function updateSession(id: string, userId: string, updates: {
  agentOutput?: string
  thinkingSteps?: unknown[]
  status?: 'running' | 'success' | 'error'
}): ChatSession | null {
  const db = getDb()
  const now = Date.now()
  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (updates.agentOutput !== undefined) {
    sets.push('agent_output = ?')
    values.push(updates.agentOutput)
  }
  if (updates.thinkingSteps !== undefined) {
    sets.push('thinking_steps = ?')
    values.push(JSON.stringify(updates.thinkingSteps))
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }

  values.push(id, userId)
  db.prepare(`UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)

  return getSessionById(id, userId)
}

export function deleteSession(id: string, userId: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?').run(id, userId)
  return result.changes > 0
}
