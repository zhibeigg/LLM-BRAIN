import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDb } from './database.js'

export interface UserRow {
  id: string
  username: string
  password_hash: string
  created_at: number
}

export interface User {
  id: string
  username: string
  createdAt: number
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  }
}

export function findUserByUsername(username: string): UserRow | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
  return row ?? null
}

export function findUserById(id: string): User | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? rowToUser(row) : null
}

export async function createUser(username: string, password: string): Promise<User> {
  const db = getDb()
  const id = uuidv4()
  const now = Date.now()
  const passwordHash = await bcrypt.hash(password, 10)

  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, username, passwordHash, now)

  return { id, username, createdAt: now }
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
