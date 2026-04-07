import type { ChatMessage, ChatCompletionResult, StreamChunk } from '../providers/base.js'
import type { LLMRole } from '../../types/index.js'
import { getRoleConfig } from '../../db/llm-config.js'
import { getAdapter } from '../providers/index.js'

export abstract class LLMRoleBase {
  abstract readonly role: LLMRole
  abstract readonly systemPrompt: string
  readonly jsonMode: boolean = false

  async chat(userMessage: string, context?: ChatMessage[]): Promise<ChatCompletionResult> {
    const config = getRoleConfig(this.role)
    if (!config) throw new Error(`角色 ${this.role} 未配置 LLM`)

    const adapter = getAdapter(config.providerId, config.model)
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...(context ?? []),
      { role: 'user', content: userMessage },
    ]

    return adapter.chat({
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      responseFormat: this.jsonMode ? 'json' : undefined,
    })
  }

  async *chatStream(userMessage: string, context?: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const config = getRoleConfig(this.role)
    if (!config) throw new Error(`角色 ${this.role} 未配置 LLM`)

    const adapter = getAdapter(config.providerId, config.model)
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...(context ?? []),
      { role: 'user', content: userMessage },
    ]

    yield* adapter.chatStream({
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      stream: true,
    })
  }
}
