import { LLMRoleBase } from './base.js'
import type { LLMRole } from '../../types/index.js'
import type { ChatMessage, ChatCompletionResult, OpenAIToolDef, StreamToolCallDelta } from '../providers/base.js'
import type { ToolContext } from '../../types/index.js'
import { executeTool } from '../../tools/index.js'
import { broadcast } from '../../ws/server.js'
import type { AgentStreamPayload, ToolCallPayload } from '../../types/index.js'

const MAX_TOOL_ROUNDS = 10

interface InlineToolCallParseResult {
  content: string
  toolCalls: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

interface StreamRoundResult {
  result: ChatCompletionResult
  streamedContent: boolean
  receivedAnyEvent: boolean
}

type ToolCallAccumulator = NonNullable<ChatCompletionResult['tool_calls']>[number]

function decodeXmlEntity(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function coerceInlineValue(value: string): unknown {
  const decoded = decodeXmlEntity(value)
  if (decoded === 'true') return true
  if (decoded === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(decoded)) return Number(decoded)
  return decoded
}

function normalizeInlineToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...args }

  if ('file_path' in normalized && !('path' in normalized)) {
    normalized.path = normalized.file_path
    delete normalized.file_path
  }

  if (toolName === 'file_list' && 'max_depth' in normalized && !('depth' in normalized)) {
    normalized.depth = normalized.max_depth
    delete normalized.max_depth
  }

  if (toolName === 'file_list' && 'maxDepth' in normalized && !('depth' in normalized)) {
    normalized.depth = normalized.maxDepth
    delete normalized.maxDepth
  }

  // file_list 没有 recursive/max_entries 参数；模型用 XML 风格工具标签时常会带上，忽略即可。
  if (toolName === 'file_list') {
    delete normalized.recursive
    delete normalized.max_entries
    delete normalized.maxEntries
  }

  return normalized
}

function parseInlineToolCalls(content: string, tools: OpenAIToolDef[], round: number): InlineToolCallParseResult {
  const toolNames = new Set(tools.map((tool) => tool.function.name))
  const toolCalls: InlineToolCallParseResult['toolCalls'] = []
  let cleaned = content
  const tagPattern = /<([a-zA-Z_][\w-]*)\b([^<>]*?)\/>/g

  cleaned = cleaned.replace(tagPattern, (fullMatch, rawName: string, rawAttrs: string) => {
    if (!toolNames.has(rawName)) return fullMatch

    const args: Record<string, unknown> = {}
    const attrPattern = /([a-zA-Z_][\w-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = attrPattern.exec(rawAttrs)) !== null) {
      const key = attrMatch[1]
      const value = attrMatch[3] ?? attrMatch[4] ?? ''
      args[key] = coerceInlineValue(value)
    }

    toolCalls.push({
      id: `inline-${Date.now()}-${round}-${toolCalls.length}`,
      type: 'function',
      function: {
        name: rawName,
        arguments: JSON.stringify(normalizeInlineToolArgs(rawName, args)),
      },
    })

    return ''
  })

  return { content: cleaned.trim(), toolCalls }
}

function mergeToolCallDelta(
  callsByIndex: Map<number, ToolCallAccumulator>,
  delta: StreamToolCallDelta,
  round: number,
): void {
  const index = Number.isFinite(delta.index) ? delta.index : callsByIndex.size
  let call = callsByIndex.get(index)
  if (!call) {
    call = {
      id: delta.id || `stream-${Date.now()}-${round}-${index}`,
      type: 'function',
      function: { name: '', arguments: '' },
    }
    callsByIndex.set(index, call)
  }

  if (delta.id) call.id = delta.id
  if (delta.type === 'function') call.type = 'function'
  if (delta.function?.name) {
    const name = delta.function.name
    if (!call.function.name || name === call.function.name || name.startsWith(call.function.name)) {
      call.function.name = name
    } else {
      call.function.name += name
    }
  }
  if (delta.function?.arguments) {
    const args = delta.function.arguments
    if (args.startsWith('{') && call.function.arguments && args.length >= call.function.arguments.length) {
      call.function.arguments = args
    } else {
      call.function.arguments += args
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function broadcastAgentChunk(content: string): Promise<boolean> {
  const text = content.replace(/\r\n/g, '\n')
  if (!text) return false

  // 有些 OpenAI 兼容网关会把多个 token 合并成一个较大的 SSE chunk。
  // 这里把大块拆成更小的 UI chunk，避免前端“整坨突然出现”。
  const chunkSize = 6
  const baseDelay = text.length > chunkSize ? 12 : 0
  for (let i = 0; i < text.length; i += chunkSize) {
    broadcast('agent_stream', { chunk: text.slice(i, i + chunkSize), done: false } satisfies AgentStreamPayload)
    if (baseDelay > 0 && i + chunkSize < text.length) {
      await delay(baseDelay)
    }
  }
  return true
}

async function broadcastAgentText(content: string, done = false): Promise<void> {
  const text = content.replace(/\r\n/g, '\n')
  // 非流式兜底时的小块 + 随机抖动延迟，模拟真实 LLM token 流式输出的节奏
  const chunkSize = 4
  const baseDelay = 35
  for (let i = 0; i < text.length; i += chunkSize) {
    broadcast('agent_stream', { chunk: text.slice(i, i + chunkSize), done: false } satisfies AgentStreamPayload)
    // 在基础延迟上添加 ±40% 的随机抖动，避免机械感
    const jitter = baseDelay * (0.6 + Math.random() * 0.8)
    await delay(Math.round(jitter))
  }
  if (done) {
    broadcast('agent_stream', { chunk: '', done: true } satisfies AgentStreamPayload)
  }
}

export class AgentRole extends LLMRoleBase {
  readonly role: LLMRole = 'agent'
  readonly systemPrompt: string

  constructor(personalityPrompt: string) {
    super()
    this.systemPrompt = `你是一个任务执行 Agent。${personalityPrompt}

你会收到经过路径规划收集的记忆片段和任务指令。
请根据这些信息和你的性格特征来执行任务。

重要：你有可用的工具。当任务涉及以下场景时，你必须优先调用工具而不是凭记忆回答：
- 需要最新信息或实时数据 → 使用 web_search 搜索
- 需要数学计算 → 使用 calculator
- 需要读取网页内容 → 使用 url_reader
- 需要执行代码 → 使用 code_executor
- 需要读取项目文件 → 使用 file_read（支持行范围）
- 需要创建或覆盖文件 → 使用 file_write
- 需要精确修改文件中的某段文本 → 使用 file_edit（字符串替换）
- 需要在项目中搜索代码 → 使用 file_search（支持正则，优先使用 ripgrep）
- 需要按文件名模式查找文件 → 使用 file_glob
- 需要查看目录结构 → 使用 file_list
- 需要执行 shell 命令（编译、测试、git 等） → 使用 terminal

工具使用原则：
1. 先用 file_list 或 file_glob 了解项目结构，再用 file_read 读取具体文件
2. 修改文件优先用 file_edit（精确替换），只有创建新文件时才用 file_write
3. 用 file_search 搜索代码比 terminal 执行 grep 更快更安全
4. terminal 可以执行任意 shell 命令，适合编译、测试、git 操作等
5. 不要编造搜索结果或计算结果，必须通过工具获取真实数据
6. 每次操作后验证结果，确保修改正确
7. 必须使用平台提供的结构化工具调用，不要把 <file_list .../>、<terminal .../> 这类 XML/HTML 标签当作正文输出。

关键：当用户给你一个涉及代码或文件的任务时，你必须主动调用工具去执行，而不是只给出文字建议或代码片段。你有完整的文件系统访问权限，请直接操作。`
  }

  private async streamChatRound(
    messages: ChatMessage[],
    tools: OpenAIToolDef[],
    round: number,
  ): Promise<StreamRoundResult> {
    const callsByIndex = new Map<number, ToolCallAccumulator>()
    let content = ''
    let streamedContent = false
    let receivedAnyEvent = false

    for await (const chunk of this.chatStreamWithMessages(messages, tools)) {
      receivedAnyEvent = true
      content += chunk.content
      if (await broadcastAgentChunk(chunk.content)) {
        streamedContent = true
      }
      for (const toolDelta of chunk.tool_calls ?? []) {
        mergeToolCallDelta(callsByIndex, toolDelta, round)
      }
    }

    const toolCalls = [...callsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => call)
      .filter((call) => call.function.name.trim().length > 0)

    return {
      result: {
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      streamedContent,
      receivedAnyEvent,
    }
  }

  /**
   * 带工具调用循环的执行方法。
   * 如果 LLM 返回 tool_calls，自动执行工具并将结果反馈给 LLM，
   * 循环直到 LLM 返回纯文本内容。
   */
  async executeWithTools(
    userMessage: string,
    tools: OpenAIToolDef[],
    toolCtx: ToolContext,
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userMessage },
    ]

    console.log(`[Agent] executeWithTools: ${tools.length} tools enabled, projectPath=${toolCtx.projectPath ?? '(none)'}`)
    console.log(`[Agent] tool names: ${tools.map(t => t.function.name).join(', ')}`)

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[Agent] round ${round}: streaming chatWithMessages with ${tools.length} tools`)
      let result: ChatCompletionResult
      let contentWasStreamed = false // 标记是否已通过流式 API 实时广播过内容

      try {
        const streamedRound = await this.streamChatRound(messages, tools, round)
        result = streamedRound.result
        contentWasStreamed = streamedRound.streamedContent
        console.log(`[Agent] round ${round}: streamed content=${result.content?.length ?? 0} chars, tool_calls=${result.tool_calls?.length ?? 0}`)

        // Responses API 或某些兼容网关可能不完整支持工具流事件；此时回退到非流式以保证工具调用不丢失。
        if (!streamedRound.receivedAnyEvent || (!result.content && (!result.tool_calls || result.tool_calls.length === 0))) {
          console.log(`[Agent] round ${round}: stream yielded no usable data, fallback to non-stream chat`)
          result = await this.chatWithMessages(messages, tools)
          contentWasStreamed = false
          console.log(`[Agent] round ${round}: fallback content=${result.content?.length ?? 0} chars, tool_calls=${result.tool_calls?.length ?? 0}`)
        }
      } catch (err) {
        console.warn(`[Agent] round ${round}: streaming with tools failed, fallback to non-stream chat: ${err instanceof Error ? err.message : String(err)}`)
        result = await this.chatWithMessages(messages, tools)
        contentWasStreamed = false
        console.log(`[Agent] round ${round}: fallback content=${result.content?.length ?? 0} chars, tool_calls=${result.tool_calls?.length ?? 0}`)
      }

      // 部分 OpenAI 兼容模型不会返回标准 tool_calls，而是把工具调用写成
      // <file_list path="." /> / <terminal command="..." /> 这类文本。
      // 将其兜底转换成真实 tool_call，避免前端只看到原始标签且工具没有执行。
      if ((!result.tool_calls || result.tool_calls.length === 0) && result.content) {
        const parsedInline = parseInlineToolCalls(result.content, tools, round)
        if (parsedInline.toolCalls.length > 0) {
          result.content = parsedInline.content
          result.tool_calls = parsedInline.toolCalls
          console.log(`[Agent] round ${round}: parsed ${parsedInline.toolCalls.length} inline XML-style tool calls`)
        }
      }

      // 如果没有 tool_calls，说明进入最终回答阶段。
      if (!result.tool_calls || result.tool_calls.length === 0) {
        console.log(`[Agent] round ${round}: no tool_calls, using final content`)
        if (result.content) {
          if (!contentWasStreamed) {
            await broadcastAgentText(result.content, true)
          } else {
            broadcast('agent_stream', { chunk: '', done: true } satisfies AgentStreamPayload)
          }
        } else {
          broadcast('agent_stream', { chunk: '', done: true } satisfies AgentStreamPayload)
        }
        return result.content
      }

      // 有 tool_calls 且有中间思考内容时：如果不是实时流出来的，则兜底按小块推送给前端。
      if (result.content && !contentWasStreamed) {
        await broadcastAgentText(result.content)
      }

      // 有 tool_calls：将 assistant 消息（含 tool_calls）加入上下文
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.tool_calls,
      })

      // 逐个执行工具
      for (const tc of result.tool_calls) {
        const startTime = Date.now()

        broadcast('tool_call', {
          callId: tc.id,
          toolName: tc.function.name,
          arguments: tc.function.arguments,
          phase: 'start',
        } satisfies ToolCallPayload)

        const toolResult = await executeTool(tc.function.name, tc.function.arguments, toolCtx)

        const output = toolResult.success
          ? toolResult.output
          : `错误: ${toolResult.error}`

        broadcast('tool_call', {
          callId: tc.id,
          toolName: tc.function.name,
          arguments: tc.function.arguments,
          phase: 'end',
          result: output,
          success: toolResult.success,
          durationMs: Date.now() - startTime,
        } satisfies ToolCallPayload)

        // 将工具结果作为 tool 消息加入上下文
        messages.push({
          role: 'tool',
          content: output,
          tool_call_id: tc.id,
        })
      }
    }

    // 超过最大轮次，做最后一次不带工具的流式调用
    let finalContent = ''
    for await (const chunk of this.chatStreamWithMessages(messages)) {
      finalContent += chunk.content
      await broadcastAgentChunk(chunk.content)
      if (chunk.done) {
        broadcast('agent_stream', { chunk: '', done: true } satisfies AgentStreamPayload)
      }
    }
    return finalContent
  }
}
