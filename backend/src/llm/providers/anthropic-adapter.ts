import type { LLMProviderAdapter, ChatCompletionOptions, ChatCompletionResult, ChatMessage, OpenAIToolDef, StreamChunk } from './base.js'

type AnthropicTextBlock = { type: 'text'; text: string }
type AnthropicToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown }
type AnthropicToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string }
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export class AnthropicAdapter implements LLMProviderAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.model = model
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const body = this.buildMessagesBody(options)

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Anthropic API 错误 (${res.status}): ${err.substring(0, 500)}`)
    }

    const data = await res.json() as Record<string, unknown>
    return this.parseMessageResult(data)
  }

  async *chatStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    const body = this.buildMessagesBody(options)
    body.stream = true

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Anthropic stream 错误 (${res.status}): ${err.substring(0, 500)}`)
    }

    yield* this.parseSSE(res, (parsed) => {
      if (parsed.type === 'content_block_delta') {
        const delta = parsed.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          return { content: delta.text, done: false }
        }
      }
      if (parsed.type === 'message_stop') return { content: '', done: true }
      return null
    })
  }

  private buildMessagesBody(options: ChatCompletionOptions): Record<string, unknown> {
    const systemParts: string[] = []
    const messages: AnthropicMessage[] = []

    for (const message of options.messages) {
      if (message.role === 'system') {
        systemParts.push(message.content)
        continue
      }
      const converted = this.toAnthropicMessage(message)
      if (converted) messages.push(converted)
    }

    if (options.responseFormat === 'json') {
      systemParts.push('请只返回有效 JSON，不要包含 Markdown 代码块或额外解释。')
    }

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      messages,
    }
    if (systemParts.length > 0) body.system = systemParts.join('\n')
    if (options.temperature != null) body.temperature = options.temperature
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => this.toAnthropicTool(tool))
      if (options.tool_choice === 'none') body.tool_choice = { type: 'none' }
    }

    return body
  }

  private toAnthropicMessage(message: ChatMessage): AnthropicMessage | null {
    if (message.role === 'tool') {
      if (!message.tool_call_id) return null
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: message.content,
        }],
      }
    }

    if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
      const content: AnthropicContentBlock[] = []
      if (message.content) content.push({ type: 'text', text: message.content })
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: this.parseToolArguments(toolCall.function.arguments),
        })
      }
      return { role: 'assistant', content }
    }

    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content || ' ',
    }
  }

  private toAnthropicTool(tool: OpenAIToolDef) {
    return {
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }
  }

  private parseToolArguments(args: string): unknown {
    try {
      return JSON.parse(args)
    } catch {
      return {}
    }
  }

  private parseMessageResult(data: Record<string, unknown>): ChatCompletionResult {
    const contentBlocks = data.content as Array<Record<string, unknown>> | undefined
    let content = ''
    const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []

    for (const block of contentBlocks ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') {
        content += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id as string,
          type: 'function',
          function: {
            name: block.name as string,
            arguments: JSON.stringify(block.input ?? {}),
          },
        })
      }
    }

    return {
      content,
      model: this.model,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? (() => {
        const usage = data.usage as Record<string, number>
        const promptTokens = usage.input_tokens ?? 0
        const completionTokens = usage.output_tokens ?? 0
        return {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        }
      })() : undefined,
    }
  }

  private async *parseSSE(
    res: Response,
    extract: (parsed: Record<string, unknown>) => StreamChunk | null,
  ): AsyncGenerator<StreamChunk> {
    const reader = res.body?.getReader()
    if (!reader) throw new Error('无法获取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        try {
          const parsed = JSON.parse(trimmed.slice(5).trim())
          const chunk = extract(parsed)
          if (chunk) yield chunk
        } catch {
          // 跳过无法解析的事件
        }
      }
    }
  }
}
