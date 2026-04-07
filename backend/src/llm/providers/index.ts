import type { LLMProviderAdapter } from './base.js'
import { OpenAIAdapter } from './openai-adapter.js'
import { getProviderById } from '../../db/llm-config.js'
import { getRoleConfig } from '../../db/llm-config.js'
import type { LLMRole } from '../../types/index.js'

export type { ChatMessage, ChatCompletionOptions, ChatCompletionResult, StreamChunk, LLMProviderAdapter } from './base.js'

const adapterCache = new Map<string, LLMProviderAdapter>()

export function getAdapter(providerId: string, model?: string): LLMProviderAdapter {
  const cacheKey = `${providerId}:${model ?? ''}`
  const cached = adapterCache.get(cacheKey)
  if (cached) return cached

  const provider = getProviderById(providerId)
  if (!provider) {
    throw new Error(`LLM 提供商 ${providerId} 不存在`)
  }

  const useModel = model ?? provider.models[0]
  if (!useModel) {
    throw new Error(`LLM 提供商 ${provider.name} 没有配置模型`)
  }

  // 目前所有提供商都使用 OpenAI 兼容接口
  const adapter = new OpenAIAdapter(provider.baseUrl, provider.apiKey, useModel)
  adapterCache.set(cacheKey, adapter)
  return adapter
}

export function getAdapterForRole(role: LLMRole): LLMProviderAdapter {
  const config = getRoleConfig(role)
  if (!config) {
    throw new Error(`角色 ${role} 未配置 LLM`)
  }
  return getAdapter(config.providerId, config.model)
}

export function clearAdapterCache(): void {
  adapterCache.clear()
}
