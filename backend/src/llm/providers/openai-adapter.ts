import type { LLMApiMode } from '../../types/index.js'
import type { LLMProviderAdapter, ChatCompletionOptions, ChatCompletionResult, StreamChunk, StreamToolCallDelta, RetryConfig } from './base.js'
import { DEFAULT_RETRY_CONFIG, isRetryableStatus, computeBackoff } from './base.js'

export class OpenAIAdapter implements LLMProviderAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string
  private apiMode: LLMApiMode
  private retryConfig: RetryConfig

  constructor(baseUrl: string, apiKey: string, model: string, apiMode: LLMApiMode = 'auto', retryConfig?: Partial<RetryConfig>) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.model = model
    this.apiMode = apiMode
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig }
  }

  private get useResponsesApi(): boolean {
    if (this.apiMode === 'openai-responses' || this.apiMode === 'openai-codex') return true
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

    const res = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

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
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
      body.tool_choice = this.toChatToolChoice(options.tool_choice) ?? 'auto'
    }

    const res = await this.fetchStreamWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    yield* this.parseSSE(res, (parsed) => {
      const choices = parsed.choices as Array<Record<string, unknown>> | undefined
      const choice = choices?.[0]
      if (!choice) return null
      const delta = choice.delta as Record<string, unknown> | undefined
      const content = (delta?.content as string) ?? ''
      const done = choice.finish_reason != null
      const rawToolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined
      const toolCalls = rawToolCalls?.map((tc): StreamToolCallDelta => {
        const fn = tc.function as Record<string, unknown> | undefined
        return {
          index: typeof tc.index === 'number' ? tc.index : 0,
          id: typeof tc.id === 'string' ? tc.id : undefined,
          type: tc.type === 'function' ? 'function' : undefined,
          function: fn ? {
            name: typeof fn.name === 'string' ? fn.name : undefined,
            arguments: typeof fn.arguments === 'string' ? fn.arguments : undefined,
          } : undefined,
        }
      })
      return (content || done || (toolCalls && toolCalls.length > 0)) ? { content, done, tool_calls: toolCalls } : null
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
    console.log(`[${this.apiMode === 'openai-codex' ? 'OpenAI-Codex' : 'OpenAI-Responses'}] POST ${this.baseUrl}/responses, tools=${(body.tools as unknown[])?.length ?? 0}, model=${this.model}`)

    const res = await this.fetchWithRetry(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    const data = await res.json() as Record<string, unknown>
    // 调试：打印完整响应（仅当有工具时）
    if ((body.tools as unknown[])?.length > 0) {
      console.log(`[OpenAI-Responses] FULL RESPONSE:`, JSON.stringify(data).slice(0, 2000))
    }
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

    console.log(`[OpenAI-Responses] parseResult: output items=${output?.length ?? 0}, output_text=${content.length} chars, status=${data.status}`)
    if (output) {
      for (const item of output) {
        console.log(`[OpenAI-Responses]   item type=${item.type}, id=${item.id ?? item.call_id ?? '?'}`)
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

    const res = await this.fetchStreamWithTimeout(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    yield* this.parseSSE(res, (parsed) => {
      if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
        return { content: parsed.delta, done: false }
      }

      if (parsed.type === 'response.output_item.added') {
        const item = parsed.item as Record<string, unknown> | undefined
        if (item?.type === 'function_call') {
          return {
            content: '',
            done: false,
            tool_calls: [{
              index: typeof parsed.output_index === 'number' ? parsed.output_index : 0,
              id: typeof item.call_id === 'string' ? item.call_id : typeof item.id === 'string' ? item.id : undefined,
              type: 'function',
              function: {
                name: typeof item.name === 'string' ? item.name : undefined,
                arguments: typeof item.arguments === 'string' ? item.arguments : undefined,
              },
            }],
          }
        }
      }

      if (parsed.type === 'response.function_call_arguments.delta' && typeof parsed.delta === 'string') {
        return {
          content: '',
          done: false,
          tool_calls: [{
            index: typeof parsed.output_index === 'number' ? parsed.output_index : 0,
            id: typeof parsed.call_id === 'string' ? parsed.call_id : typeof parsed.item_id === 'string' ? parsed.item_id : undefined,
            type: 'function',
            function: { arguments: parsed.delta },
          }],
        }
      }

      if (parsed.type === 'response.output_item.done') {
        const item = parsed.item as Record<string, unknown> | undefined
        if (item?.type === 'function_call') {
          return {
            content: '',
            done: false,
            tool_calls: [{
              index: typeof parsed.output_index === 'number' ? parsed.output_index : 0,
              id: typeof item.call_id === 'string' ? item.call_id : typeof item.id === 'string' ? item.id : undefined,
              type: 'function',
              function: {
                name: typeof item.name === 'string' ? item.name : undefined,
                arguments: typeof item.arguments === 'string' ? item.arguments : undefined,
              },
            }],
          }
        }
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

  // ==================== 带重试和超时的 fetch ====================

  /**
   * 带超时的 fetch
   */
  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      return res
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`LLM 请求超时 (${timeoutMs}ms, model: ${this.model})`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 带重试的非流式请求
   */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const { maxRetries, timeoutMs } = this.retryConfig
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.fetchWithTimeout(url, init, timeoutMs)

        if (res.ok) return res

        // 可重试的状态码
        if (isRetryableStatus(res.status) && attempt < maxRetries) {
          // 429 时尝试读取 Retry-After
          let delay = computeBackoff(attempt, this.retryConfig)
          const retryAfter = res.headers.get('Retry-After')
          if (retryAfter) {
            const retryMs = parseInt(retryAfter, 10) * 1000
            if (!isNaN(retryMs) && retryMs > 0) delay = Math.min(retryMs, this.retryConfig.maxDelayMs)
          }

          console.warn(`[LLM] ${res.status} 重试 ${attempt + 1}/${maxRetries}，等待 ${delay}ms (model: ${this.model})`)
          await new Promise(r => setTimeout(r, delay))
          continue
        }

        // 不可重试的错误，直接抛出
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(`LLM API 错误 (${res.status}): ${errText.substring(0, 500)}`)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))

        // 网络错误（非 HTTP 错误）也可重试
        if (attempt < maxRetries && !(lastError.message.includes('LLM API 错误'))) {
          const delay = computeBackoff(attempt, this.retryConfig)
          console.warn(`[LLM] 网络错误重试 ${attempt + 1}/${maxRetries}，等待 ${delay}ms: ${lastError.message}`)
          await new Promise(r => setTimeout(r, delay))
          continue
        }

        throw lastError
      }
    }

    throw lastError ?? new Error('LLM 请求失败')
  }

  /**
   * 带超时的流式请求（不重试，因为流式请求可能已经部分消费）
   */
  private async fetchStreamWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const res = await this.fetchWithTimeout(url, init, this.retryConfig.streamTimeoutMs)
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`LLM stream 错误 (${res.status}): ${err.substring(0, 500)}`)
    }
    return res
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
