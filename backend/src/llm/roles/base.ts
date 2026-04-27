import type { ChatMessage, ChatCompletionResult, StreamChunk, OpenAIToolDef } from '../providers/base.js'
import type { LLMRole } from '../../types/index.js'
import { getRoleConfig } from '../../db/llm-config.js'
import { getAdapter } from '../providers/index.js'

export abstract class LLMRoleBase {
  abstract readonly role: LLMRole
  abstract readonly systemPrompt: string
  readonly jsonMode: boolean = false

  async chat(
    userMessage: string,
    context?: ChatMessage[],
    tools?: OpenAIToolDef[],
    toolChoice?: Parameters<import('../providers/base.js').LLMProviderAdapter['chat']>[0]['tool_choice'],
  ): Promise<ChatCompletionResult> {
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
      responseFormat: this.jsonMode && (!tools || tools.length === 0) ? 'json' : undefined,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: toolChoice,
    })

  }

  /** 带完整消息列表的 chat（用于工具调用循环） */
  async chatWithMessages(
    messages: ChatMessage[],
    tools?: OpenAIToolDef[],
    toolChoice?: Parameters<import('../providers/base.js').LLMProviderAdapter['chat']>[0]['tool_choice'],
  ): Promise<ChatCompletionResult> {
    const config = getRoleConfig(this.role)
    if (!config) throw new Error(`角色 ${this.role} 未配置 LLM`)

    const adapter = getAdapter(config.providerId, config.model)
    console.log(`[LLMBase] chatWithMessages: role=${this.role}, model=${config.model}, tools=${tools?.length ?? 0}, messages=${messages.length}`)
    const result = await adapter.chat({
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: toolChoice,
    })
    console.log(`[LLMBase] chatWithMessages result: content=${result.content?.length ?? 0}, tool_calls=${result.tool_calls?.length ?? 0}`)
    return result
  }

  async *chatStream(userMessage: string, context?: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...(context ?? []),
      { role: 'user', content: userMessage },
    ]

    yield* this.chatStreamWithMessages(messages)
  }

  /** 带完整消息列表的流式 chat（可选携带工具定义，用于 Agent 真流式工具调用循环） */
  async *chatStreamWithMessages(
    messages: ChatMessage[],
    tools?: OpenAIToolDef[],
    toolChoice?: Parameters<import('../providers/base.js').LLMProviderAdapter['chat']>[0]['tool_choice'],
  ): AsyncGenerator<StreamChunk> {
    const config = getRoleConfig(this.role)
    if (!config) throw new Error(`角色 ${this.role} 未配置 LLM`)

    const adapter = getAdapter(config.providerId, config.model)
    yield* adapter.chatStream({
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      stream: true,
      responseFormat: this.jsonMode && (!tools || tools.length === 0) ? 'json' : undefined,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: toolChoice,
    })
  }
}
