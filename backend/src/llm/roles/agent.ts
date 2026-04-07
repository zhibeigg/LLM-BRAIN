import { LLMRoleBase } from './base.js'
import type { LLMRole } from '../../types/index.js'

export class AgentRole extends LLMRoleBase {
  readonly role: LLMRole = 'agent'
  readonly systemPrompt: string

  constructor(personalityPrompt: string) {
    super()
    this.systemPrompt = `你是一个任务执行 Agent。${personalityPrompt}

你会收到经过路径规划收集的记忆片段和任务指令。
请根据这些信息和你的性格特征来执行任务。`
  }
}
