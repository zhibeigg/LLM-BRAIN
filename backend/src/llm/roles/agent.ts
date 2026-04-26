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
6. 每次操作后验证结果，确保修改正确`
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

      // 如果没有 tool_calls，说明进入最终回答阶段；改用流式请求重新生成最终回答
      if (!result.tool_calls || result.tool_calls.length === 0) {
        let content = ''
        for await (const chunk of this.chatStreamWithMessages(messages)) {
          content += chunk.content
          broadcast('agent_stream', { chunk: chunk.content, done: chunk.done } satisfies AgentStreamPayload)
        }
        return content || result.content
      }

      // 有 tool_calls 且有中间思考内容时，推送给前端
      if (result.content) {
        broadcast('agent_stream', { chunk: result.content, done: false } satisfies AgentStreamPayload)
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
      broadcast('agent_stream', { chunk: chunk.content, done: chunk.done } satisfies AgentStreamPayload)
    }
    return finalContent
  }
}
