import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'
import type { LLMApiMode, LLMProvider, LLMProviderType, LLMRole, LLMRoleConfig } from '../types/index.js'

interface ProviderRow {
  id: string
  name: string
  provider_type?: string
  api_mode?: string
  base_url: string
  api_key: string
  models: string
}

interface RoleConfigRow {
  role: string
  provider_id: string
  model: string
  temperature: number
  max_tokens: number
}

function normalizeProviderType(value: string | undefined): LLMProviderType {
  return value === 'anthropic' ? 'anthropic' : 'openai'
}

function normalizeApiMode(value: string | undefined, providerType: LLMProviderType): LLMApiMode {
  if (providerType === 'anthropic') return 'anthropic-messages'
  if (value === 'openai-chat' || value === 'openai-responses') return value
  return 'auto'
}

function rowToProvider(row: ProviderRow): LLMProvider {
  const providerType = normalizeProviderType(row.provider_type)
  return {
    id: row.id,
    name: row.name,
    providerType,
    apiMode: normalizeApiMode(row.api_mode, providerType),
    baseUrl: row.base_url,
    apiKey: row.api_key,
    models: JSON.parse(row.models) as string[],
  }
}

function rowToRoleConfig(row: RoleConfigRow): LLMRoleConfig {
  return {
    role: row.role as LLMRole,
    providerId: row.provider_id,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
  }
}

// ===== Providers =====

export function getAllProviders(): LLMProvider[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM llm_providers')
  const rows = stmt.all() as ProviderRow[]
  return rows.map(rowToProvider)
}

export function getProviderById(id: string): LLMProvider | null {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM llm_providers WHERE id = ?')
  const row = stmt.get(id) as ProviderRow | undefined
  return row ? rowToProvider(row) : null
}

export function createProvider(
  provider: Omit<LLMProvider, 'id'>
): LLMProvider {
  const db = getDb()
  const id = uuidv4()

  const stmt = db.prepare(`
    INSERT INTO llm_providers (id, name, provider_type, api_mode, base_url, api_key, models)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    provider.name,
    provider.providerType,
    provider.apiMode,
    provider.baseUrl,
    provider.apiKey,
    JSON.stringify(provider.models),
  )

  return { id, ...provider }
}

export function updateProvider(
  id: string,
  updates: Partial<Omit<LLMProvider, 'id'>>
): LLMProvider | null {
  const existing = getProviderById(id)
  if (!existing) return null

  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.providerType !== undefined) {
    fields.push('provider_type = ?')
    values.push(updates.providerType)
  }
  if (updates.apiMode !== undefined) {
    fields.push('api_mode = ?')
    values.push(updates.apiMode)
  }
  if (updates.baseUrl !== undefined) {
    fields.push('base_url = ?')
    values.push(updates.baseUrl)
  }
  if (updates.apiKey !== undefined) {
    fields.push('api_key = ?')
    values.push(updates.apiKey)
  }
  if (updates.models !== undefined) {
    fields.push('models = ?')
    values.push(JSON.stringify(updates.models))
  }

  if (fields.length === 0) return existing

  values.push(id)

  const stmt = db.prepare(`UPDATE llm_providers SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getProviderById(id)
}

export function deleteProvider(id: string): boolean {
  const db = getDb()
  const stmt = db.prepare('DELETE FROM llm_providers WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}

// ===== Role Configs =====

export function getRoleConfig(role: LLMRole): LLMRoleConfig | null {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM llm_role_configs WHERE role = ?')
  const row = stmt.get(role) as RoleConfigRow | undefined
  return row ? rowToRoleConfig(row) : null
}

export function getAllRoleConfigs(): LLMRoleConfig[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM llm_role_configs')
  const rows = stmt.all() as RoleConfigRow[]
  return rows.map(rowToRoleConfig)
}

export function setRoleConfig(config: LLMRoleConfig): void {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO llm_role_configs (role, provider_id, model, temperature, max_tokens)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(role) DO UPDATE SET
      provider_id = excluded.provider_id,
      model = excluded.model,
      temperature = excluded.temperature,
      max_tokens = excluded.max_tokens
  `)

  stmt.run(config.role, config.providerId, config.model, config.temperature, config.maxTokens)
}
