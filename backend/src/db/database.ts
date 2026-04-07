import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getDbPath(): string {
  const dataDir = path.join(__dirname, '..', '..', 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, 'llm-brain.db')
}

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath())
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initTables(db)
    migrateAddBrainId(db)
    migrateAddUserId(db)
    migrateAddProjectPath(db)
  }
  return db
}

function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brains (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '' REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      project_path TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      brain_id TEXT NOT NULL DEFAULT '' REFERENCES brains(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('personality', 'memory')),
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.5,
      source_path_id TEXT,
      personality_label TEXT,
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      base_difficulty REAL NOT NULL DEFAULT 0.5,
      difficulty_types TEXT NOT NULL DEFAULT '[]',
      difficulty_type_weights TEXT NOT NULL DEFAULT '{}',
      usage_count INTEGER DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personality_dimensions (
      id TEXT PRIMARY KEY,
      brain_id TEXT NOT NULL DEFAULT '' REFERENCES brains(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      value REAL NOT NULL DEFAULT 0.5,
      is_builtin INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      models TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS llm_role_configs (
      role TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES llm_providers(id),
      model TEXT NOT NULL,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 4096
    );

    CREATE TABLE IF NOT EXISTS execution_history (
      id TEXT PRIMARY KEY,
      brain_id TEXT NOT NULL DEFAULT '',
      task_prompt TEXT NOT NULL,
      path_taken TEXT NOT NULL DEFAULT '[]',
      result TEXT,
      status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'loop_detected')),
      boss_feedback TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS difficulty_personality_mapping (
      difficulty_type TEXT NOT NULL,
      dimension_id TEXT NOT NULL REFERENCES personality_dimensions(id) ON DELETE CASCADE,
      direction REAL NOT NULL DEFAULT -1,
      weight REAL NOT NULL DEFAULT 1.0,
      PRIMARY KEY (difficulty_type, dimension_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brain_id TEXT NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('task', 'learn')),
      prompt TEXT NOT NULL,
      agent_output TEXT DEFAULT '',
      thinking_steps TEXT DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
}

/** 迁移：为旧数据库添加 brain_id 列，并创建默认大脑 */
function migrateAddBrainId(db: Database.Database): void {
  // 检查 nodes 表是否已有 brain_id 列
  const columns = db.prepare("PRAGMA table_info(nodes)").all() as Array<{ name: string }>
  const hasBrainId = columns.some(c => c.name === 'brain_id')
  if (hasBrainId) return

  // 旧数据库，需要迁移
  const now = Date.now()
  const defaultBrainId = uuidv4()

  db.transaction(() => {
    // 创建默认大脑
    db.prepare(`INSERT INTO brains (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(defaultBrainId, '默认大脑', '自动迁移创建的默认大脑', now, now)

    // 给 nodes 表加 brain_id 列
    db.exec(`ALTER TABLE nodes ADD COLUMN brain_id TEXT NOT NULL DEFAULT ''`)
    db.prepare(`UPDATE nodes SET brain_id = ?`).run(defaultBrainId)

    // 给 personality_dimensions 表加 brain_id 列
    db.exec(`ALTER TABLE personality_dimensions ADD COLUMN brain_id TEXT NOT NULL DEFAULT ''`)
    db.prepare(`UPDATE personality_dimensions SET brain_id = ?`).run(defaultBrainId)

    // 给 execution_history 表加 brain_id 列
    db.exec(`ALTER TABLE execution_history ADD COLUMN brain_id TEXT NOT NULL DEFAULT ''`)
    db.prepare(`UPDATE execution_history SET brain_id = ?`).run(defaultBrainId)
  })()

  console.log(`数据库迁移完成：已创建默认大脑 ${defaultBrainId}，旧数据已关联`)
}

/** 迁移：为 brains 表添加 user_id 列 */
function migrateAddUserId(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(brains)").all() as Array<{ name: string }>
  const hasUserId = columns.some(c => c.name === 'user_id')
  if (hasUserId) return

  db.exec(`ALTER TABLE brains ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`)
  console.log('数据库迁移完成：brains 表已添加 user_id 列')
}

/** 迁移：为 brains 表添加 project_path 列 */
function migrateAddProjectPath(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(brains)").all() as Array<{ name: string }>
  if (columns.some(c => c.name === 'project_path')) return

  db.exec(`ALTER TABLE brains ADD COLUMN project_path TEXT DEFAULT ''`)
  console.log('数据库迁移完成：brains 表已添加 project_path 列')
}

export function closeDb(): void {
  if (db) {
    db.close()
  }
}
