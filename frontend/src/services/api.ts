import type {
  Brain,
  MemoryNode,
  MemoryEdge,
  PersonalityDimension,
  LLMProvider,
  LLMProviderType,
  LLMRoleConfig,
  DifficultyPersonalityMapping,
  DifficultyType,
  ToolDefinition,
  DevToolInfo,
} from '../types'
import { getToken } from '../stores/authStore'

const BASE_URL = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> ?? {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || res.statusText)
  }
  // 204 No Content 或空响应体不解析 JSON
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json()
}

// ===== 大脑 API =====

export const brainsApi = {
  getAll: () =>
    request<Brain[]>('/brains'),

  getById: (id: string) =>
    request<Brain>(`/brains/${id}`),

  create: (name: string, description?: string, projectPath?: string, initProject?: boolean) =>
    request<Brain>('/brains', {
      method: 'POST',
      body: JSON.stringify({ name, description, projectPath, initProject }),
    }),

  update: (id: string, updates: Partial<Pick<Brain, 'name' | 'description' | 'projectPath'>>) =>
    request<Brain>(`/brains/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  initProject: (id: string, projectPath?: string) =>
    request<{ status: 'started'; projectPath: string }>(`/brains/${id}/init`, {
      method: 'POST',
      body: JSON.stringify({ projectPath }),
    }),

  delete: (id: string) =>
    request<void>(`/brains/${id}`, { method: 'DELETE' }),
}

// ===== 节点 API =====

export const nodesApi = {
  getAll: (brainId?: string) =>
    request<MemoryNode[]>(brainId ? `/nodes?brainId=${brainId}` : '/nodes'),

  getById: (id: string) =>
    request<MemoryNode>(`/nodes/${id}`),

  create: (node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<MemoryNode>('/nodes', {
      method: 'POST',
      body: JSON.stringify(node),
    }),

  update: (id: string, updates: Partial<MemoryNode>) =>
    request<MemoryNode>(`/nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    request<void>(`/nodes/${id}`, { method: 'DELETE' }),

  autoLayout: (brainId: string) =>
    request<MemoryNode[]>('/nodes/auto-layout', {
      method: 'POST',
      body: JSON.stringify({ brainId }),
    }),

  updateBatch: (brainId: string, nodes: Array<{ id: string; positionX: number; positionY: number }>) =>
    request<void>('/nodes/batch-update', {
      method: 'PUT',
      body: JSON.stringify({ brainId, nodes }),
    }),
}

// ===== 边 API =====

export const edgesApi = {
  getAll: () =>
    request<MemoryEdge[]>('/edges'),

  getBySourceId: (sourceId: string) =>
    request<MemoryEdge[]>(`/edges?sourceId=${sourceId}`),

  create: (edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'usageCount' | 'perceivedDifficulty'>) =>
    request<MemoryEdge>('/edges', {
      method: 'POST',
      body: JSON.stringify(edge),
    }),

  update: (id: string, updates: Partial<MemoryEdge>) =>
    request<MemoryEdge>(`/edges/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    request<void>(`/edges/${id}`, { method: 'DELETE' }),
}

// ===== 性格 API =====

export const personalityApi = {
  getDimensions: (brainId?: string) =>
    request<PersonalityDimension[]>(brainId ? `/personality/dimensions?brainId=${brainId}` : '/personality/dimensions'),

  createDimension: (dimension: { brainId: string; name: string; description: string }) =>
    request<PersonalityDimension>('/personality/dimensions', {
      method: 'POST',
      body: JSON.stringify(dimension),
    }),

  updateDimension: (id: string, updates: Partial<PersonalityDimension>) =>
    request<PersonalityDimension>(`/personality/dimensions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteDimension: (id: string) =>
    request<void>(`/personality/dimensions/${id}`, { method: 'DELETE' }),

  getMaxDimensions: () =>
    request<{ max: number }>('/personality/max-dimensions'),

  setMaxDimensions: (max: number) =>
    request<{ max: number }>('/personality/max-dimensions', {
      method: 'PUT',
      body: JSON.stringify({ max }),
    }),

  parse: (description: string, brainId: string) =>
    request<{
      updates: Array<{ name: string; value: number; dimensionId: string }>
      newDimensions: Array<{ name: string; description: string; value: number; dimensionId: string }>
    }>('/personality/parse', {
      method: 'POST',
      body: JSON.stringify({ description, brainId }),
    }),
}

// ===== LLM API =====

export const llmApi = {
  getProviders: () =>
    request<LLMProvider[]>('/llm/providers'),

  createProvider: (provider: Omit<LLMProvider, 'id'>) =>
    request<LLMProvider>('/llm/providers', {
      method: 'POST',
      body: JSON.stringify(provider),
    }),

  updateProvider: (id: string, updates: Partial<LLMProvider>) =>
    request<LLMProvider>(`/llm/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteProvider: (id: string) =>
    request<void>(`/llm/providers/${id}`, { method: 'DELETE' }),

  getRoles: () =>
    request<LLMRoleConfig[]>('/llm/roles'),

  setRole: (config: LLMRoleConfig) =>
    request<LLMRoleConfig>(`/llm/roles/${config.role}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  // 自动检测已保存提供商的可用模型
  detectModels: (providerId: string) =>
    request<{ models: string[]; count: number }>(`/llm/providers/${providerId}/detect-models`, {
      method: 'POST',
    }),

  // 用临时凭据检测模型（添加提供商前预检）
  detectModelsWithCredentials: (baseUrl: string, apiKey: string, providerType: LLMProviderType = 'openai') =>
    request<{ models: string[]; count: number }>('/llm/detect-models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl, apiKey, providerType }),
    }),
}

// ===== 难度-性格映射 API =====

export const difficultyMappingApi = {
  getAll: () =>
    request<DifficultyPersonalityMapping[]>('/difficulty-mappings'),

  getByType: (type: DifficultyType) =>
    request<DifficultyPersonalityMapping[]>(`/difficulty-mappings/${type}`),

  set: (mapping: DifficultyPersonalityMapping) =>
    request<DifficultyPersonalityMapping>('/difficulty-mappings', {
      method: 'PUT',
      body: JSON.stringify(mapping),
    }),

  delete: (difficultyType: DifficultyType, dimensionId: string) =>
    request<void>(`/difficulty-mappings/${difficultyType}/${dimensionId}`, {
      method: 'DELETE',
    }),
}

// ===== 任务执行 API =====

export const taskApi = {
  execute: (prompt: string, brainId: string, mode?: import('../types').ExecutionMode, enabledTools?: string[]) =>
    request<{ status: string; queueItemId: string; message: string }>('/task/execute', {
      method: 'POST',
      body: JSON.stringify({ prompt, brainId, mode, enabledTools }),
    }),

  getQueue: () =>
    request<{ queue: import('../types').QueueItem[] }>('/task/queue'),

  removeFromQueue: (id: string) =>
    request<{ status: string }>(`/task/queue/${id}`, { method: 'DELETE' }),

  abort: () =>
    request<{ status: string; message: string }>('/task/abort', { method: 'POST' }),
}

// ===== 学习 API =====

export const learnApi = {
  learn: (topic: string, brainId: string) =>
    request<{ status: string; queueItemId: string; message: string }>('/learn', {
      method: 'POST',
      body: JSON.stringify({ topic, brainId }),
    }),
}

// ===== 聊天会话 API =====

export interface ChatSessionDTO {
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

export interface ChatSessionPageResult {
  items: ChatSessionDTO[]
  hasMore: boolean
  nextCursor?: number
}

export const chatSessionsApi = {
  getPage: (brainId?: string, cursor?: number, limit = 20) => {
    const params = new URLSearchParams()
    if (brainId) params.set('brainId', brainId)
    if (cursor) params.set('cursor', String(cursor))
    params.set('limit', String(limit))
    return request<ChatSessionPageResult>(`/chat-sessions?${params.toString()}`)
  },

  create: (data: { brainId: string; type: 'task' | 'learn'; prompt: string }) =>
    request<ChatSessionDTO>('/chat-sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, updates: { agentOutput?: string; thinkingSteps?: unknown[]; status?: string }) =>
    request<ChatSessionDTO>(`/chat-sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    request<void>(`/chat-sessions/${id}`, { method: 'DELETE' }),
}

// ===== 工具 API =====

export const toolsApi = {
  getAll: () =>
    request<ToolDefinition[]>('/tools'),
}

// ===== 文件系统 API =====

export interface DirEntry {
  name: string
  path: string
}

export const fsApi = {
  listDirs: (path?: string) =>
    request<{ current: string; dirs: DirEntry[] }>(`/fs/list-dirs${path ? `?path=${encodeURIComponent(path)}` : ''}`),
}

// ===== 开发工具 API =====

export const devToolsApi = {
  getAll: () =>
    request<{ tools: DevToolInfo[] }>('/dev-tools'),
  check: (toolId: string) =>
    request<{ id: string; installed: boolean; version?: string; path?: string }>('/dev-tools/check', {
      method: 'POST',
      body: JSON.stringify({ toolId }),
    }),
  install: (toolId: string) =>
    request<{ id: string; installed: boolean; version?: string; path?: string }>('/dev-tools/install', {
      method: 'POST',
      body: JSON.stringify({ toolId }),
    }),
}
