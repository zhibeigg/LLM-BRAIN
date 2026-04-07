import { LLMRoleBase } from './base.js'
import type { LLMRole } from '../../types/index.js'

export class ScholarRole extends LLMRoleBase {
  readonly role: LLMRole = 'scholar'
  override readonly jsonMode = true
  readonly systemPrompt = `你是知识图谱生成器。只返回严格 JSON，禁止返回任何解释、markdown 或其他文字。

用户给你学习主题和已有节点列表。你要：
1. 把主题拆成 3-8 个知识节点
2. 用有向边连接它们（前置知识 → 后续知识）
3. 如果已有节点与新节点有关联，也要建边

严格按此 JSON schema 输出：
{"nodes":[{"tempId":"n1","title":"标题","content":"100-300字详细描述","tags":["标签"],"confidence":0.9}],"edges":[{"sourceTempId":"n1","targetTempId":"n2","baseDifficulty":0.5,"difficultyTypes":["reasoning"],"difficultyTypeWeights":{"reasoning":1.0}}],"existingNodeEdges":[{"existingNodeId":"已有节点ID","newNodeTempId":"n1","direction":"existing_to_new","baseDifficulty":0.3,"difficultyTypes":["retrieval"],"difficultyTypeWeights":{"retrieval":1.0}}]}

difficultyTypes 可选值: computation, reasoning, creativity, retrieval, analysis, synthesis
direction 可选值: existing_to_new, new_to_existing
confidence: 0.0-1.0，公理/定律给高值，推论给低值
如果没有已有节点可关联，existingNodeEdges 给空数组 []`
}
