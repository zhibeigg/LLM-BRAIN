import type { ExecutionMode, PersonalityDimension, DifficultyPersonalityMapping, MemoryNode } from '../../types/index.js'
import type { OpenAIToolDef } from '../providers/base.js'
import { broadcast } from '../../ws/server.js'
import { randomUUID } from 'crypto'
import { LeaderRole } from '../roles/leader.js'
import { getEdgesBySourceId, updateEdge } from '../../db/edges.js'
import { getNodeById } from '../../db/nodes.js'
import { getDimensionsByBrainId } from '../../db/personality.js'
import { getMappings } from '../../db/difficulty-mapping.js'
import { computePerceivedDifficulty } from '../../core/difficulty/engine.js'
import type { LeaderStepPayload, LeaderDecisionPayload, StepConfirmPayload, LLMTrace } from '../../types/index.js'

/**
 * 路径难度调整器
 * 职责：根据执行结果调整路径上边的难度
 */
function buildLeaderDecisionTool(validEdgeIds: string[]): OpenAIToolDef {
  return {
    type: 'function',
    function: {
      name: 'choose_leader_path',
      description: '选择 Leader 在记忆图中的下一步路径，或在记忆已足够时停止。必须只从候选 edgeId 中选择。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            type: 'string',
            enum: ['continue', 'stop'],
            description: '继续沿候选边前进，或停止路径收集。',
          },
          edgeId: {
            type: ['string', 'null'],
            enum: [...validEdgeIds, null],
            description: 'action 为 continue 时必须是候选边 ID；action 为 stop 时必须为 null。',
          },
          reason: {
            type: 'string',
            description: '一句话说明选择理由。',
          },
          thinking: {
            type: 'string',
            description: '简短分析当前节点、候选路径和任务相关性。',
          },
        },
        required: ['action', 'edgeId', 'reason', 'thinking'],
      },
    },
  }
}

export class DifficultyAdjuster {
  /**
   * 调整路径难度
   * @param pathNodeIds 路径节点ID列表
   * @param success 是否成功（成功降低难度，失败提高难度）
   */
  adjustPathDifficulty(pathNodeIds: string[], success: boolean): void {
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const edges = getEdgesBySourceId(pathNodeIds[i])
      const edge = edges.find(e => e.targetId === pathNodeIds[i + 1])
      if (edge) {
        const factor = success ? 0.95 : 1.1
        updateEdge(edge.id, { baseDifficulty: Math.max(0.05, Math.min(1.0, edge.baseDifficulty * factor)) })
      }
    }
  }
}

/**
 * Leader 决策编排器
 * 职责：路径选择决策循环
 */
export class LeaderOrchestrator {
  private leader = new LeaderRole()

  /**
   * 执行 Leader 决策循环
   * @param taskPrompt 任务提示
   * @param brainId 脑图ID
   * @param dimensions 个性维度
   * @param mappings 难度映射
   * @param mode 执行模式
   * @param waitForApproval 等待审批的回调函数
   * @returns 路径决策结果
   */
  async executeDecisionLoop(
    taskPrompt: string,
    brainId: string,
    dimensions: PersonalityDimension[],
    mappings: DifficultyPersonalityMapping[],
    mode: ExecutionMode,
    waitForApproval: (requestId: string, description: string) => Promise<boolean>
  ): Promise<{
    visitedPath: string[]
    collectedMemories: MemoryNode[]
    totalSteps: number
  }> {
    const allNodes = (await import('../../db/nodes.js')).getNodesByBrainId(brainId)
    let startNode = allNodes.find(n => n.type === 'personality')
    if (!startNode && allNodes.length > 0) startNode = allNodes[0]
    if (!startNode) throw new Error('图谱中没有任何节点')

    const visitedPath: string[] = []
    const collectedMemories: MemoryNode[] = []
    let currentNode = startNode
    let totalSteps = 0
    const MAX_STEPS = 50

    while (totalSteps < MAX_STEPS) {
      visitedPath.push(currentNode.id)
      collectedMemories.push(currentNode)
      totalSteps++

      const outEdges = getEdgesBySourceId(currentNode.id)
      if (outEdges.length === 0) {
        broadcast('leader_step', {
          currentNodeId: currentNode.id,
          candidates: [],
          thinking: '',
        } satisfies LeaderStepPayload)
        broadcast('leader_decision', {
          chosenEdgeId: null,
          reason: '当前节点没有出边，自动停止',
          totalSteps,
        } satisfies LeaderDecisionPayload)
        break
      }

      const candidates = outEdges.map(edge => {
        const perceived = computePerceivedDifficulty(edge, dimensions, mappings)
        const targetNode = getNodeById(edge.targetId)
        return { edge, perceivedDifficulty: perceived, targetNode }
      })

      const candidatesPayload = candidates.map(c => ({
        edgeId: c.edge.id,
        targetNodeId: c.edge.targetId,
        targetNodeTitle: c.targetNode?.title || '未知',
        perceivedDifficulty: c.perceivedDifficulty,
        difficultyTypes: c.edge.difficultyTypes,
      }))

      const leaderInput = JSON.stringify({
        task: taskPrompt,
        currentNode: { id: currentNode.id, title: currentNode.title, content: currentNode.content.substring(0, 200), type: currentNode.type },
        candidates: candidates.map(c => ({
          edgeId: c.edge.id,
          targetNodeId: c.edge.targetId,
          targetTitle: c.targetNode?.title || '未知',
          targetContentPreview: c.targetNode?.content?.substring(0, 100) || '',
          perceivedDifficulty: c.perceivedDifficulty,
          difficultyTypes: c.edge.difficultyTypes,
          usageCount: c.edge.usageCount,
        })),
        visitedNodes: visitedPath,
        totalSteps,
        personality: dimensions.map(d => ({ name: d.name, value: d.value, description: d.description })),
      })

      const startTime = Date.now()
      const leaderTool = buildLeaderDecisionTool(candidates.map(c => c.edge.id))
      const leaderResult = await this.leader.chat(
        leaderInput,
        undefined,
        [leaderTool],
        { type: 'function', function: { name: 'choose_leader_path' } }
      )
      const latencyMs = Date.now() - startTime
      let decision: { action: string; edgeId: string | null; reason: string; thinking: string }

      const parseLeaderDecision = (raw: unknown): typeof decision => {
        const obj = raw as Record<string, unknown>

        // 检测是否是有效的决策 JSON（必须有 action 或 edgeId）
        const hasAction = 'action' in obj
        const hasEdgeId = 'edgeId' in obj || 'selectedEdgeId' in obj || 'edge_id' in obj || 'chosenEdgeId' in obj

        if (!hasAction && !hasEdgeId) {
          // LLM 返回了无关内容（如对话回复），视为无效，默认 continue 选第一个未访问的候选
          const unvisited = candidates.filter(c => !visitedPath.includes(c.edge.targetId))
          const fallback = unvisited[0] ?? candidates[0]
          return {
            action: fallback ? 'continue' : 'stop',
            edgeId: fallback?.edge.id ?? null,
            reason: 'Leader 未返回有效决策，自动选择',
            thinking: JSON.stringify(raw),
          }
        }

        let edgeId = (obj.edgeId ?? obj.selectedEdgeId ?? obj.edge_id ?? obj.chosenEdgeId ?? obj.recommendedEdgeId ?? null) as string | null
        if (!edgeId) {
          const candidateEdgeIds = new Set(candidates.map(c => c.edge.id))
          for (const val of Object.values(obj)) {
            if (typeof val === 'string' && candidateEdgeIds.has(val)) { edgeId = val; break }
          }
        }
        const action = (obj.action as string) ?? (edgeId ? 'continue' : 'stop')
        const reason = (obj.reason ?? obj.reasoning ?? obj.explanation ?? '') as string
        const thinking = (obj.thinking ?? obj.thought ?? obj.analysis ?? '') as string
        return { action, edgeId, reason, thinking }
      }

      const parseDecisionText = (content: string): typeof decision | null => {
        try {
          return parseLeaderDecision(JSON.parse(content))
        } catch {
          const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
          if (!jsonMatch) return null
          try { return parseLeaderDecision(JSON.parse(jsonMatch[0])) }
          catch { return null }
        }
      }

      const leaderToolCall = leaderResult.tool_calls?.find(tc => tc.function.name === 'choose_leader_path')
      if (leaderToolCall) {
        try {
          decision = parseLeaderDecision(JSON.parse(leaderToolCall.function.arguments))
        } catch {
          const fallback = candidates.find(c => !visitedPath.includes(c.edge.targetId)) ?? candidates[0]
          decision = {
            action: fallback ? 'continue' : 'stop',
            edgeId: fallback?.edge.id ?? null,
            reason: 'Leader 工具参数解析失败，自动选择路径',
            thinking: leaderToolCall.function.arguments,
          }
        }
      } else {
        const textDecision = parseDecisionText(leaderResult.content)
        if (textDecision) {
          decision = textDecision
        } else {
          const jsonRetryPrompt = `${leaderInput}\n\n你的上一次输出没有调用决策工具。现在必须只返回一个 JSON 对象，不要解释、不要 markdown。格式：{"action":"continue或stop","edgeId":"候选edgeId或null","reason":"一句话理由","thinking":"简短分析"}`
          const retryResult = await this.leader.chat(jsonRetryPrompt)
          const retryDecision = parseDecisionText(retryResult.content)
          if (retryDecision) {
            decision = retryDecision
            leaderResult.content = retryResult.content
            leaderResult.model = retryResult.model ?? leaderResult.model
            leaderResult.usage = retryResult.usage ?? leaderResult.usage
          } else {
            const fallback = candidates.find(c => !visitedPath.includes(c.edge.targetId)) ?? candidates[0]
            decision = {
              action: fallback ? 'continue' : 'stop',
              edgeId: fallback?.edge.id ?? null,
              reason: 'Leader 未返回可解析决策，自动选择路径',
              thinking: `${leaderResult.content}\n\nJSON重试：${retryResult.content}`,
            }
          }
        }
      }

      const validEdgeIds = new Set(candidates.map(c => c.edge.id))
      if (decision.action === 'stop') {
        decision.edgeId = null
      } else if (!decision.edgeId || !validEdgeIds.has(decision.edgeId)) {
        const fallback = candidates.find(c => !visitedPath.includes(c.edge.targetId)) ?? candidates[0]
        decision = {
          action: fallback ? 'continue' : 'stop',
          edgeId: fallback?.edge.id ?? null,
          reason: 'Leader 决策边无效，自动选择有效候选路径',
          thinking: decision.thinking,
        }
      }

      // 构建溯源信息
      const leaderTrace: LLMTrace = {
        model: leaderResult.model,
        prompt: leaderInput,
        rawResponse: leaderToolCall?.function.arguments ?? leaderResult.content,
        latencyMs,
        ...(leaderResult.usage ? { tokenUsage: { prompt: leaderResult.usage.promptTokens, completion: leaderResult.usage.completionTokens } } : {}),
      }

      // 先发 leader_step（带完整 candidates + thinking + trace），再发 leader_decision
      broadcast('leader_step', {
        currentNodeId: currentNode.id,
        candidates: candidatesPayload,
        thinking: decision.thinking || '',
        trace: leaderTrace,
      } satisfies LeaderStepPayload)

      broadcast('leader_decision', {
        chosenEdgeId: decision.edgeId,
        reason: decision.reason,
        totalSteps,
      } satisfies LeaderDecisionPayload)

      // supervised 模式：每步决策后等待确认
      if (mode === 'supervised' && decision.edgeId) {
        const requestId = `step-${randomUUID()}`
        broadcast('step_confirm', {
          stepId: requestId,
          type: 'leader_decision',
          description: `Leader 选择路径 → ${candidates.find(c => c.edge.id === decision.edgeId)?.targetNode?.title || '未知'}`,
        } satisfies StepConfirmPayload)

        const approved = await waitForApproval(requestId, `Leader 选择路径 → ${candidates.find(c => c.edge.id === decision.edgeId)?.targetNode?.title || '未知'}`)
        if (!approved) {
          broadcast('leader_decision', { chosenEdgeId: null, reason: '用户拒绝了此路径选择', totalSteps } satisfies LeaderDecisionPayload)
          break
        }
      }

      if (decision.action === 'stop' || !decision.edgeId) break

      const chosenCandidate = candidates.find(c => c.edge.id === decision.edgeId)
      if (!chosenCandidate || !chosenCandidate.targetNode) break

      updateEdge(chosenCandidate.edge.id, { usageCount: chosenCandidate.edge.usageCount + 1, lastUsedAt: Date.now() })
      currentNode = chosenCandidate.targetNode
    }

    return { visitedPath, collectedMemories, totalSteps }
  }
}
