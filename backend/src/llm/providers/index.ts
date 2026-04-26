import type { LLMProviderAdapter } from './base.js'
import { AnthropicAdapter } from './anthropic-adapter.js'
import { OpenAIAdapter } from './openai-adapter.js'
import { getProviderById } from '../../db/llm-config.js'
import { getRoleConfig } from '../../db/llm-config.js'
import type { LLMRole } from '../../types/index.js'

export type { ChatMessage, ChatCompletionOptions, ChatCompletionResult, StreamChunk, LLMProviderAdapter } from './base.js'

const adapterCache = new Map<string, LLMProviderAdapter>()

export function getAdapter(providerId: string, model?: string): LLMProviderAdapter {
  const provider = getProviderById(providerId)
  if (!provider) {
    throw new Error(`LLM 提供商 ${providerId} 不存在`)
  }

  const useModel = model ?? provider.models[0]
  if (!useModel) {
    throw new Error(`LLM 提供商 ${provider.name} 没有配置模型`)
  }

  const cacheKey = `${provider.providerType}:${provider.apiMode}:${providerId}:${useModel}`
  const cached = adapterCache.get(cacheKey)
  if (cached) return cached

  const adapter = provider.providerType === 'anthropic'
    ? new AnthropicAdapter(provider.baseUrl, provider.apiKey, useModel)
    : new OpenAIAdapter(provider.baseUrl, provider.apiKey, useModel, provider.apiMode)
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
