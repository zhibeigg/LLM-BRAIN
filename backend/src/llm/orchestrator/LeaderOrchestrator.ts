import type { ExecutionMode, PersonalityDimension, DifficultyPersonalityMapping, MemoryNode } from '../../types/index.js'
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
      const leaderResult = await this.leader.chat(leaderInput)
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

      try {
        decision = parseLeaderDecision(JSON.parse(leaderResult.content))
      } catch {
        const cleaned = leaderResult.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
        if (jsonMatch) {
          try { decision = parseLeaderDecision(JSON.parse(jsonMatch[0])) }
          catch {
            // JSON 解析彻底失败，fallback：选第一个未访问的候选
            const fallback = candidates.find(c => !visitedPath.includes(c.edge.targetId)) ?? candidates[0]
            decision = {
              action: fallback ? 'continue' : 'stop',
              edgeId: fallback?.edge.id ?? null,
              reason: 'Leader 返回格式错误，自动选择路径',
              thinking: leaderResult.content,
            }
          }
        } else {
          const fallback = candidates.find(c => !visitedPath.includes(c.edge.targetId)) ?? candidates[0]
          decision = {
            action: fallback ? 'continue' : 'stop',
            edgeId: fallback?.edge.id ?? null,
            reason: 'Leader 返回非 JSON，自动选择路径',
            thinking: leaderResult.content,
          }
        }
      }

      // 构建溯源信息
      const leaderTrace: LLMTrace = {
        model: leaderResult.model,
        prompt: leaderInput,
        rawResponse: leaderResult.content,
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
