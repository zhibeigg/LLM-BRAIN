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
  tool_choice?: 'auto' | 'none'
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

export interface LLMProviderAdapter {
  chat(options: ChatCompletionOptions): Promise<ChatCompletionResult>
  chatStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk>
}
