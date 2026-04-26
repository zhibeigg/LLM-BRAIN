import { AgentRole } from '../roles/agent.js'
import { broadcast } from '../../ws/server.js'
import { buildOpenAITools } from '../../tools/index.js'
import { getRoleConfig } from '../../db/llm-config.js'
import type { AgentStreamPayload, PersonalityDimension } from '../../types/index.js'

/**
 * Agent 执行编排器
 * 职责：Agent 任务的执行和流式输出
 */
export class AgentOrchestrator {
  private buildPersonalityPrompt(dimensions: PersonalityDimension[]): string {
    if (dimensions.length === 0) return '你是一个中性的助手。'
    const traits = dimensions.map(d => {
      const level = d.value < 0.3 ? '低' : d.value < 0.7 ? '中等' : '高'
      return `${d.name}：${level}（${d.value.toFixed(2)}）`
    })
    return `你的性格特征：\n${traits.join('\n')}\n\n请根据这些性格特征调整你的回答风格和深度。`
  }

  /**
   * 执行 Agent 任务
   * @param taskPrompt 任务提示
   * @param dimensions 个性维度
   * @param memoryContext 记忆上下文
   * @param enabledTools 启用的工具列表
   * @param brainId 脑图ID
   * @param projectPath 项目路径
   * @returns Agent 执行结果
   */
  async execute(
    taskPrompt: string,
    dimensions: PersonalityDimension[],
    memoryContext: string,
    enabledTools: string[],
    brainId: string,
    projectPath?: string
  ): Promise<string> {
    const agentConfig = getRoleConfig('agent')
    if (!agentConfig) {
      const msg = '请先在设置中为 Agent 角色配置 LLM 模型'
      broadcast('error', { message: msg })
      return msg
    }

    const personalityPrompt = this.buildPersonalityPrompt(dimensions)
    const agentInput = `任务：${taskPrompt}\n\n参考记忆：\n${memoryContext}`

    let agentResult = ''
    const openaiTools = buildOpenAITools(enabledTools)
    const agentStartTime = Date.now()
    const agentModel = agentConfig.model

    if (openaiTools.length > 0) {
      const agent = new AgentRole(personalityPrompt)
      agentResult = await agent.executeWithTools(agentInput, openaiTools, { brainId, projectPath })
      broadcast('agent_stream', {
        chunk: '',
        done: true,
        trace: { model: agentModel, prompt: agentInput, rawResponse: agentResult, latencyMs: Date.now() - agentStartTime },
      } satisfies AgentStreamPayload)
    } else {
      const agent = new AgentRole(personalityPrompt)
      for await (const chunk of agent.chatStream(agentInput)) {
        agentResult += chunk.content
        const streamPayload: AgentStreamPayload = { chunk: chunk.content, done: chunk.done }
        if (chunk.done) {
          streamPayload.trace = { model: agentModel, prompt: agentInput, rawResponse: agentResult, latencyMs: Date.now() - agentStartTime }
        }
        broadcast('agent_stream', streamPayload)
      }
    }

    return agentResult
  }
}
