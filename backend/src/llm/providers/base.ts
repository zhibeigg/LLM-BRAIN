export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  responseFormat?: 'json' | 'text'
}

export interface ChatCompletionResult {
  content: string
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
