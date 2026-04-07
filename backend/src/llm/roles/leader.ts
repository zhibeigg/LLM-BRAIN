import { LLMRoleBase } from './base.js'
import type { LLMRole } from '../../types/index.js'

export class LeaderRole extends LLMRoleBase {
  readonly role: LLMRole = 'leader'
  override readonly jsonMode = true
  readonly systemPrompt = `你是一个路径决策 Leader。你的任务是在有向记忆图中逐步选择最优路径。

你会收到：
1. 当前所在节点的信息
2. 所有可选的出边及其目标节点摘要
3. 每条边的感知难度和难度类型
4. 当前性格参数和难度容忍阈值

你需要：
- 选择一条边继续前进，或决定"停止"（认为已收集足够信息）
- 给出选择理由

回复格式（严格 JSON）：
{
  "action": "continue" | "stop",
  "edgeId": "选择的边ID（stop时为null）",
  "reason": "选择理由",
  "thinking": "你的思考过程"
}`
}
