import type { LLMApiMode } from '../../types/index.js'
import type { LLMProviderAdapter, ChatCompletionOptions, ChatCompletionResult, StreamChunk } from './base.js'

export class OpenAIAdapter implements LLMProviderAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string
  private apiMode: LLMApiMode

  constructor(baseUrl: string, apiKey: string, model: string, apiMode: LLMApiMode = 'auto') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.model = model
    this.apiMode = apiMode
  }

  private get useResponsesApi(): boolean {
    if (this.apiMode === 'openai-responses') return true
    if (this.apiMode === 'openai-chat') return false

    const model = this.model.toLowerCase()
    return model.includes('codex') || model.startsWith('gpt-5') || /^o\d/.test(model)
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }

  private toChatToolChoice(toolChoice: ChatCompletionOptions['tool_choice']) {
    if (!toolChoice || toolChoice === 'auto' || toolChoice === 'none' || toolChoice === 'required') return toolChoice
    if ('function' in toolChoice) return toolChoice
    return { type: 'function', function: { name: toolChoice.name } }
  }

  private toResponsesToolChoice(toolChoice: ChatCompletionOptions['tool_choice']) {
    if (!toolChoice || toolChoice === 'auto' || toolChoice === 'none' || toolChoice === 'required') return toolChoice
    // 部分 Responses 兼容服务只接受字符串 tool_choice。
    // Leader 只传一个工具，因此 required 等价于强制调用该工具。
    return 'required'
  }

  // ==================== 统一入口 ====================

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    return this.useResponsesApi ? this.chatResponses(options) : this.chatStandard(options)
  }

  async *chatStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    yield* this.useResponsesApi ? this.streamResponses(options) : this.streamStandard(options)
  }

  // ==================== 标准 Chat Completions ====================

  private async chatStandard(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: options.messages,
      stream: false,
    }
    if (options.temperature != null) body.temperature = options.temperature
    if (options.maxTokens != null) body.max_tokens = options.maxTokens
    if (options.responseFormat === 'json') body.response_format = { type: 'json_object' }
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
      body.tool_choice = this.toChatToolChoice(options.tool_choice) ?? 'auto'
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`LLM API 错误 (${res.status}): ${err.substring(0, 500)}`)
    }

    const text = await res.text()
    if (!text) {
      let content = ''
      for await (const chunk of this.streamStandard(options)) content += chunk.content
      if (!content) throw new Error(`LLM 返回空响应 (model: ${this.model})`)
      return { content }
    }

    const data = JSON.parse(text)
    const choice = data.choices?.[0]
    if (!choice) throw new Error(`LLM 返回无 choices (model: ${this.model})`)

    const result: ChatCompletionResult = {
      content: choice.message?.content ?? '',
      model: this.model,
      tool_calls: choice.message?.tool_calls ?? undefined,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }

    if (!result.content && !result.tool_calls) {
      result.content = await this.collectStreamContent(() => this.streamStandard(options))
    }

    return result
  }

  private async *streamStandard(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: options.messages,
      stream: true,
    }
    if (options.temperature != null) body.temperature = options.temperature
    if (options.maxTokens != null) body.max_tokens = options.maxTokens
    if (options.responseFormat === 'json') body.response_format = { type: 'json_object' }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`LLM stream 错误 (${res.status}): ${err.substring(0, 500)}`)
    }

    yield* this.parseSSE(res, (parsed) => {
      const choices = parsed.choices as Array<Record<string, unknown>> | undefined
      const choice = choices?.[0]
      if (!choice) return null
      const delta = choice.delta as Record<string, unknown> | undefined
      const content = (delta?.content as string) ?? ''
      const done = choice.finish_reason != null
      return (content || done) ? { content, done } : null
    })
  }

  // ==================== Responses API ====================

  private buildResponsesInput(options: ChatCompletionOptions) {
    const instructions = options.messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n')

    const input: Array<Record<string, unknown>> = []

    for (const m of options.messages) {
      if (m.role === 'system') continue

      if (m.role === 'tool' && m.tool_call_id) {
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id,
          output: m.content,
        })
      } else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        if (m.content) input.push({ role: 'assistant', content: m.content })
        for (const tc of m.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })
        }
      } else {
        input.push({ role: m.role, content: m.content })
      }
    }

    if (options.responseFormat === 'json') {
      const hasJsonInInput = input.some((m) => typeof m.content === 'string' && m.content.toLowerCase().includes('json'))
      if (!hasJsonInInput) input.push({ role: 'user', content: '请以 JSON 格式回复。' })
    }

    const body: Record<string, unknown> = {
      model: this.model,
      input,
      store: false,
    }
    if (instructions) body.instructions = instructions
    if (options.maxTokens != null) body.max_output_tokens = options.maxTokens
    if (options.responseFormat === 'json') body.text = { format: { type: 'json_object' } }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }))
      body.tool_choice = this.toResponsesToolChoice(options.tool_choice) ?? 'auto'
    }

    return body
  }

  private async chatResponses(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const body = this.buildResponsesInput(options)

    const res = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Responses API 错误 (${res.status}): ${err.substring(0, 500)}`)
    }

    const data = await res.json() as Record<string, unknown>
    const result = this.parseResponsesResult(data)

    if (!result.content && !result.tool_calls) {
      result.content = await this.collectStreamContent(() => this.streamResponses(options))
    }

    return result
  }

  private parseResponsesResult(data: Record<string, unknown>): ChatCompletionResult {
    const output = data.output as Array<Record<string, unknown>> | undefined
    let content = typeof data.output_text === 'string' ? data.output_text : ''
    const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []

    if (output) {
      for (const item of output) {
        if (item.type === 'message') {
          const contentArr = item.content as Array<Record<string, unknown>> | undefined
          if (contentArr) {
            for (const part of contentArr) {
              if (part.type === 'output_text' && typeof part.text === 'string' && !content.includes(part.text)) {
                content += part.text
              }
            }
          }
        } else if (item.type === 'function_call') {
          toolCalls.push({
            id: (item.call_id ?? item.id) as string,
            type: 'function',
            function: {
              name: item.name as string,
              arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
            },
          })
        }
      }
    }

    return {
      content,
      model: this.model,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? (() => {
        const usage = data.usage as Record<string, number>
        const promptTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0
        const completionTokens = usage.output_tokens ?? usage.completion_tokens ?? 0
        return {
          promptTokens,
          completionTokens,
          totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
        }
      })() : undefined,
    }
  }

  private async *streamResponses(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    const body = this.buildResponsesInput(options)
    body.stream = true

    const res = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Responses stream 错误 (${res.status}): ${err.substring(0, 500)}`)
    }

    yield* this.parseSSE(res, (parsed) => {
      if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
        return { content: parsed.delta, done: false }
      }
      if (parsed.type === 'response.completed') return { content: '', done: true }
      return null
    })
  }

  private async collectStreamContent(createStream: () => AsyncGenerator<StreamChunk>): Promise<string> {
    let content = ''
    for await (const chunk of createStream()) {
      content += chunk.content
    }
    return content
  }

  // ==================== SSE 解析器 ====================

  private async *parseSSE(
    res: Response,
    extract: (parsed: Record<string, unknown>) => StreamChunk | null,
  ): AsyncGenerator<StreamChunk> {
    const reader = res.body?.getReader()
    if (!reader) throw new Error('无法获取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done: readerDone, value } = await reader.read()
      if (readerDone) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const jsonStr = trimmed.slice(5).trim()
        if (jsonStr === '[DONE]') return

        try {
          const parsed = JSON.parse(jsonStr)
          const chunk = extract(parsed)
          if (chunk) yield chunk
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  }
}
