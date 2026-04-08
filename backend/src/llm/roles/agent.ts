import { LLMRoleBase } from './base.js'
import type { LLMRole } from '../../types/index.js'
import type { ChatMessage, OpenAIToolDef } from '../providers/base.js'
import type { ToolContext } from '../../types/index.js'
import { executeTool } from '../../tools/index.js'
import { broadcast } from '../../ws/server.js'
import type { AgentStreamPayload, ToolCallPayload } from '../../types/index.js'

const MAX_TOOL_ROUNDS = 10

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
- 需要执行命令 → 使用 terminal
不要编造搜索结果或计算结果，必须通过工具获取真实数据。`
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

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await this.chatWithMessages(messages, tools)

      // 如果没有 tool_calls，直接返回文本
      if (!result.tool_calls || result.tool_calls.length === 0) {
        const content = result.content
        // 流式推送最终结果
        broadcast('agent_stream', { chunk: content, done: true } satisfies AgentStreamPayload)
        return content
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

    // 超过最大轮次，做最后一次不带工具的调用
    const finalResult = await this.chatWithMessages(messages)
    broadcast('agent_stream', { chunk: finalResult.content, done: true } satisfies AgentStreamPayload)
    return finalResult.content
  }
}
