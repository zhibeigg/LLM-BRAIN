export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

export interface OpenAIToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatCompletionOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  responseFormat?: 'json' | 'text'
  tools?: OpenAIToolDef[]
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } } | { type: 'function'; name: string }
}

export interface ChatCompletionResult {
  content: string
  model?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface StreamChunk {
  content: string
  done: boolean
}

/** 重试配置 */
export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries: number
  /** 初始退避时间 ms（默认 1000） */
  initialDelayMs: number
  /** 最大退避时间 ms（默认 30000） */
  maxDelayMs: number
  /** 非流式请求超时 ms（默认 60000） */
  timeoutMs: number
  /** 流式请求超时 ms（默认 120000） */
  streamTimeoutMs: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  timeoutMs: 60_000,
  streamTimeoutMs: 120_000,
}

/** 判断 HTTP 状态码是否可重试 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

/** 指数退避 + 抖动 */
export function computeBackoff(attempt: number, config: RetryConfig): number {
  const delay = Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs)
  // 加 ±25% 抖动避免雷群效应
  const jitter = delay * (0.75 + Math.random() * 0.5)
  return Math.round(jitter)
}

export interface LLMProviderAdapter {
  chat(options: ChatCompletionOptions): Promise<ChatCompletionResult>
  chatStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk>
}
