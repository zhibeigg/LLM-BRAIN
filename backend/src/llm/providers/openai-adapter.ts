import type { LLMProviderAdapter, ChatCompletionOptions, ChatCompletionResult, StreamChunk } from './base.js'

export class OpenAIAdapter implements LLMProviderAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
    this.model = model
  }

  private get isCodex(): boolean {
    return this.model.includes('codex')
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }

  // ==================== 统一入口 ====================

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    return this.isCodex ? this.chatCodex(options) : this.chatStandard(options)
  }

  async *chatStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    yield* this.isCodex ? this.streamCodex(options) : this.streamStandard(options)
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
      body.tool_choice = options.tool_choice ?? 'auto'
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`LLM API 错误 (${res.status}): ${err.substring(0, 300)}`)
    }

    const text = await res.text()
    if (!text) {
      // 回退到流式拼接
      let content = ''
      for await (const chunk of this.streamStandard(options)) content += chunk.content
      if (!content) throw new Error(`LLM 返回空响应 (model: ${this.model})`)
      return { content }
    }

    const data = JSON.parse(text)
    const choice = data.choices?.[0]
    if (!choice) throw new Error(`LLM 返回无 choices (model: ${this.model})`)

    return {
      content: choice.message?.content ?? '',
      model: this.model,
      tool_calls: choice.message?.tool_calls ?? undefined,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }
  }

  private async *streamStandard(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: options.messages,
      stream: true,
    }
    if (options.temperature != null) body.temperature = options.temperature
    if (options.maxTokens != null) body.max_tokens = options.maxTokens

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`LLM stream 错误 (${res.status}): ${err.substring(0, 300)}`)
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

  // ==================== Codex Responses API ====================

  private buildResponsesInput(options: ChatCompletionOptions) {
    // 将 chat messages 转换为 responses API 的 input 格式
    let instructions = options.messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n')

    const input: Array<Record<string, unknown>> = []

    for (const m of options.messages) {
      if (m.role === 'system') continue

      if (m.role === 'tool' && m.tool_call_id) {
        // 工具结果消息
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id,
          output: m.content,
        })
      } else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        // assistant 消息中包含 tool_calls → 转为 function_call items
        if (m.content) {
          input.push({ role: 'assistant', content: m.content })
        }
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

    // Codex 要求 input 中包含 "json" 才能使用 json_object 格式
    if (options.responseFormat === 'json') {
      const hasJsonInInput = input.some((m) => typeof m.content === 'string' && m.content.toLowerCase().includes('json'))
      if (!hasJsonInInput) {
        input.push({ role: 'user', content: '请以 JSON 格式回复。' })
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      input,
      reasoning: { effort: 'high' },
    }
    if (instructions) body.instructions = instructions
    if (options.maxTokens != null) body.max_output_tokens = options.maxTokens
    if (options.responseFormat === 'json') body.text = { format: { type: 'json_object' } }

    // Responses API 的 tools 格式
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }))
    }

    return body
  }

  private async chatCodex(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const body = this.buildResponsesInput(options)

    const res = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Codex API 错误 (${res.status}): ${err.substring(0, 300)}`)
    }

    const data = await res.json() as Record<string, unknown>
    const output = data.output as Array<Record<string, unknown>> | undefined

    // 调试日志：查看 Responses API 返回的 output 结构
    if (options.tools && options.tools.length > 0) {
      console.log('[Codex tools] output types:', output?.map(o => o.type))
    }

    // 提取文本内容
    let content = ''
    const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []

    if (output) {
      for (const item of output) {
        if (item.type === 'message') {
          const contentArr = item.content as Array<Record<string, unknown>> | undefined
          if (contentArr) {
            for (const part of contentArr) {
              if (part.type === 'output_text' && typeof part.text === 'string') {
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
              arguments: item.arguments as string,
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
        const u = data.usage as Record<string, number>
        return {
          promptTokens: u.input_tokens ?? u.prompt_tokens ?? 0,
          completionTokens: u.output_tokens ?? u.completion_tokens ?? 0,
          totalTokens: u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
        }
      })() : undefined,
    }
  }

  private extractResponsesContent(data: Record<string, unknown>): string {
    const output = data.output as Array<Record<string, unknown>> | undefined
    if (!output) return ''

    for (const item of output) {
      if (item.type === 'message') {
        const contentArr = item.content as Array<Record<string, unknown>> | undefined
        if (!contentArr) continue
        for (const part of contentArr) {
          if (part.type === 'output_text' && typeof part.text === 'string') {
            return part.text
          }
        }
      }
    }
    return ''
  }

  private async *streamCodex(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    const body = this.buildResponsesInput(options)
    body.stream = true

    const res = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Codex stream 错误 (${res.status}): ${err.substring(0, 300)}`)
    }

    yield* this.parseSSE(res, (parsed) => {
      // response.output_text.delta 事件
      if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
        return { content: parsed.delta, done: false }
      }
      // response.completed 事件
      if (parsed.type === 'response.completed') {
        return { content: '', done: true }
      }
      return null
    })
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
