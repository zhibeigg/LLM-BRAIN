import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'
import type { ExecutionHistory, ExecutionStatus } from '../types/index.js'

interface HistoryRow {
  id: string
  task_prompt: string
  path_taken: string
  result: string | null
  status: string
  boss_feedback: string | null
  retry_count: number
  created_at: number
}

function rowToHistory(row: HistoryRow): ExecutionHistory {
  return {
    id: row.id,
    taskPrompt: row.task_prompt,
    pathTaken: JSON.parse(row.path_taken) as string[],
    result: row.result ?? undefined,
    status: row.status as ExecutionStatus,
    bossFeedback: row.boss_feedback ?? undefined,
    retryCount: row.retry_count,
    createdAt: row.created_at,
  }
}

export function getRecentHistory(limit: number): ExecutionHistory[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM execution_history ORDER BY created_at DESC LIMIT ?')
  const rows = stmt.all(limit) as HistoryRow[]
  return rows.map(rowToHistory)
}

export function createHistory(
  history: Omit<ExecutionHistory, 'id' | 'createdAt'>
): ExecutionHistory {
  const db = getDb()
  const id = uuidv4()
  const now = Date.now()

  const stmt = db.prepare(`
    INSERT INTO execution_history (id, task_prompt, path_taken, result, status, boss_feedback, retry_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    history.taskPrompt,
    JSON.stringify(history.pathTaken),
    history.result ?? null,
    history.status,
    history.bossFeedback ?? null,
    history.retryCount,
    now,
  )

  return {
    id,
    ...history,
    createdAt: now,
  }
}

export function getHistoryByTaskPrompt(prompt: string): ExecutionHistory[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM execution_history WHERE task_prompt = ? ORDER BY created_at DESC')
  const rows = stmt.all(prompt) as HistoryRow[]
  return rows.map(rowToHistory)
}
