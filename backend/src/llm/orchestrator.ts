import { LeaderRole } from './roles/leader.js'
import { BossRole } from './roles/boss.js'
import { AgentRole } from './roles/agent.js'
import { getNodesByBrainId, getNodeById } from '../db/nodes.js'
import { getEdgesBySourceId, updateEdge } from '../db/edges.js'
import { getDimensionsByBrainId } from '../db/personality.js'
import { getMappings } from '../db/difficulty-mapping.js'
import { createHistory, getHistoryByTaskPrompt } from '../db/execution-history.js'
import { computePerceivedDifficulty, computeToleranceThreshold } from '../core/difficulty/engine.js'
import { autoExtractNodes } from '../core/extraction/engine.js'
import { broadcast } from '../ws/server.js'
import type {
  MemoryNode, PersonalityDimension,
  DifficultyPersonalityMapping, LeaderStepPayload,
  LeaderDecisionPayload, AgentStreamPayload, BossVerdictPayload,
} from '../types/index.js'

const MAX_RETRIES = 3

export class Orchestrator {
  private leader = new LeaderRole()
  private boss = new BossRole()
  private isRunning = false
  private retryCount = 0

  async executeTask(taskPrompt: string, brainId: string): Promise<string> {
    if (this.isRunning) throw new Error('已有任务在执行中')
    this.isRunning = true
    this.retryCount = 0
    return this._executeTaskInner(taskPrompt, brainId)
  }

  private async _executeTaskInner(taskPrompt: string, brainId: string): Promise<string> {
    try {
      // 1. 加载性格和映射
      const dimensions = getDimensionsByBrainId(brainId)
      const mappings = getMappings()
      const threshold = computeToleranceThreshold(dimensions)

      // 2. 找到性格节点作为起点（如果没有，用第一个记忆节点）
      const allNodes = getNodesByBrainId(brainId)
      let startNode = allNodes.find(n => n.type === 'personality')
      if (!startNode && allNodes.length > 0) startNode = allNodes[0]
      if (!startNode) throw new Error('图谱中没有任何节点')

      // 3. Leader 逐步决策循环
      const visitedPath: string[] = []
      const collectedMemories: MemoryNode[] = []
      let currentNode = startNode
      let totalSteps = 0
      const MAX_STEPS = 50 // 防止无限循环

      while (totalSteps < MAX_STEPS) {
        visitedPath.push(currentNode.id)
        collectedMemories.push(currentNode)
        totalSteps++

        // 获取当前节点的出边
        const outEdges = getEdgesBySourceId(currentNode.id)
        if (outEdges.length === 0) {
          // 没有出边，自动停止
          broadcast('leader_decision', {
            chosenEdgeId: null,
            reason: '当前节点没有出边，自动停止',
            totalSteps,
          } satisfies LeaderDecisionPayload)
          break
        }

        // 计算每条边的感知难度
        const candidates = outEdges.map(edge => {
          const perceived = computePerceivedDifficulty(edge, dimensions, mappings)
          const targetNode = getNodeById(edge.targetId)
          return {
            edge,
            perceivedDifficulty: perceived,
            targetNode,
            filtered: perceived > threshold,
          }
        })

        // 广播 Leader 步骤信息
        broadcast('leader_step', {
          currentNodeId: currentNode.id,
          candidates: candidates.map(c => ({
            edgeId: c.edge.id,
            targetNodeId: c.edge.targetId,
            targetNodeTitle: c.targetNode?.title || '未知',
            perceivedDifficulty: c.perceivedDifficulty,
            difficultyTypes: c.edge.difficultyTypes,
            filtered: c.filtered,
          })),
          thinking: '',
        } satisfies LeaderStepPayload)

        // 构建 Leader 的输入
        const leaderInput = JSON.stringify({
          task: taskPrompt,
          currentNode: {
            id: currentNode.id,
            title: currentNode.title,
            content: currentNode.content.substring(0, 200),
            type: currentNode.type,
          },
          candidates: candidates.map(c => ({
            edgeId: c.edge.id,
            targetNodeId: c.edge.targetId,
            targetTitle: c.targetNode?.title || '未知',
            targetContentPreview: c.targetNode?.content?.substring(0, 100) || '',
            perceivedDifficulty: c.perceivedDifficulty,
            difficultyTypes: c.edge.difficultyTypes,
            filtered: c.filtered,
          })),
          toleranceThreshold: threshold,
          visitedNodes: visitedPath,
          totalSteps,
          personalityDescription: dimensions.map(d => `${d.name}: ${d.value.toFixed(2)}`).join(', '),
        })

        // 调用 Leader LLM
        const leaderResult = await this.leader.chat(leaderInput)
        let decision: { action: string; edgeId: string | null; reason: string; thinking: string }

        const parseLeaderDecision = (raw: unknown): typeof decision => {
          const obj = raw as Record<string, unknown>
          // 优先匹配已知字段名
          let edgeId = (obj.edgeId ?? obj.selectedEdgeId ?? obj.edge_id ?? obj.chosenEdgeId ?? obj.recommendedEdgeId ?? null) as string | null
          // 兜底：在所有字段中找 UUID 格式的值，匹配候选边 ID
          if (!edgeId) {
            const candidateEdgeIds = new Set(candidates.map(c => c.edge.id))
            for (const val of Object.values(obj)) {
              if (typeof val === 'string' && candidateEdgeIds.has(val)) {
                edgeId = val
                break
              }
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
          // 尝试提取 JSON：去掉 markdown 代码块
          const cleaned = leaderResult.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
          if (jsonMatch) {
            try {
              decision = parseLeaderDecision(JSON.parse(jsonMatch[0]))
            } catch {
              decision = { action: 'stop', edgeId: null, reason: 'Leader 返回格式错误，自动停止', thinking: leaderResult.content }
            }
          } else {
            decision = { action: 'stop', edgeId: null, reason: 'Leader 返回格式错误，自动停止', thinking: leaderResult.content }
          }
        }

        // 广播 Leader 决策
        broadcast('leader_decision', {
          chosenEdgeId: decision.edgeId,
          reason: decision.reason,
          totalSteps,
        } satisfies LeaderDecisionPayload)

        // 更新 leader_step 的 thinking
        broadcast('leader_step', {
          currentNodeId: currentNode.id,
          candidates: [],
          thinking: decision.thinking || '',
        } satisfies LeaderStepPayload)

        if (decision.action === 'stop' || !decision.edgeId) {
          break
        }

        // 找到选中的边和目标节点
        const chosenCandidate = candidates.find(c => c.edge.id === decision.edgeId)
        if (!chosenCandidate || !chosenCandidate.targetNode) {
          break
        }

        // 更新边的使用统计
        updateEdge(chosenCandidate.edge.id, {
          usageCount: chosenCandidate.edge.usageCount + 1,
          lastUsedAt: Date.now(),
        })

        currentNode = chosenCandidate.targetNode
      }

      // 4. 拼接记忆，生成 Agent prompt
      const personalityPrompt = buildPersonalityPrompt(dimensions)
      const memoryContext = collectedMemories
        .map(n => `[${n.title}]: ${n.content}`)
        .join('\n\n')

      const agent = new AgentRole(personalityPrompt)
      const agentInput = `任务：${taskPrompt}\n\n参考记忆：\n${memoryContext}`

      // 5. Agent 流式执行
      let agentResult = ''
      for await (const chunk of agent.chatStream(agentInput)) {
        agentResult += chunk.content
        broadcast('agent_stream', {
          chunk: chunk.content,
          done: chunk.done,
        } satisfies AgentStreamPayload)
      }

      // 6. Boss 验证
      const retryHistory = getHistoryByTaskPrompt(taskPrompt)
      const bossInput = JSON.stringify({
        originalTask: taskPrompt,
        agentResult,
        retryHistory: retryHistory.slice(-5).map(h => ({
          result: h.result?.substring(0, 200),
          status: h.status,
          feedback: h.bossFeedback,
        })),
        retryCount: retryHistory.length,
      })

      const bossResult = await this.boss.chat(bossInput)
      let verdict: { passed: boolean; feedback: string; isLoop: boolean; loopReason?: string }

      const parseBossVerdict = (raw: unknown): typeof verdict => {
        const obj = raw as Record<string, unknown>
        const passed = (obj.passed ?? obj.pass ?? obj.approved ?? true) as boolean
        const feedback = (obj.feedback ?? obj.comment ?? obj.reason ?? '') as string
        const isLoop = (obj.isLoop ?? obj.is_loop ?? obj.loop ?? false) as boolean
        return { passed, feedback, isLoop }
      }

      try {
        verdict = parseBossVerdict(JSON.parse(bossResult.content))
      } catch {
        const cleaned = bossResult.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
        if (jsonMatch) {
          try {
            verdict = parseBossVerdict(JSON.parse(jsonMatch[0]))
          } catch {
            verdict = { passed: true, feedback: '验证格式错误，默认通过', isLoop: false }
          }
        } else {
          verdict = { passed: true, feedback: '验证格式错误，默认通过', isLoop: false }
        }
      }

      broadcast('boss_verdict', {
        passed: verdict.passed,
        feedback: verdict.feedback,
        isLoop: verdict.isLoop,
        retryCount: retryHistory.length,
      } satisfies BossVerdictPayload)

      // 7. 记录执行历史
      const status = verdict.isLoop ? 'loop_detected' : verdict.passed ? 'success' : 'failure'
      createHistory({
        taskPrompt,
        pathTaken: visitedPath,
        result: agentResult,
        status,
        bossFeedback: verdict.feedback,
        retryCount: retryHistory.length,
      })

      // 8. 如果未通过且不是死循环，重试（有上限）
      if (!verdict.passed && !verdict.isLoop) {
        this.adjustPathDifficulty(visitedPath, false)

        if (this.retryCount < MAX_RETRIES) {
          this.retryCount++
          return this._executeTaskInner(taskPrompt, brainId)
        }
        // 超过重试上限，返回最后一次结果
        broadcast('error', { message: `已达到最大重试次数（${MAX_RETRIES}），返回最后结果` })
        return agentResult
      }

      // 9. 成功或死循环停止
      if (verdict.passed) {
        this.adjustPathDifficulty(visitedPath, true)
        // 自动提取约束/知识节点（fire-and-forget，不阻塞返回）
        autoExtractNodes(taskPrompt, agentResult, brainId).catch(err => {
          console.error('Auto extraction failed:', err)
        })
      }

      return agentResult
    } finally {
      this.isRunning = false
    }
  }

  private adjustPathDifficulty(pathNodeIds: string[], success: boolean): void {
    // 遍历路径上相邻节点对应的边，调整基础难度
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const edges = getEdgesBySourceId(pathNodeIds[i])
      const edge = edges.find(e => e.targetId === pathNodeIds[i + 1])
      if (edge) {
        const factor = success ? 0.95 : 1.1
        const newDifficulty = Math.max(0.05, Math.min(1.0, edge.baseDifficulty * factor))
        updateEdge(edge.id, { baseDifficulty: newDifficulty })
      }
    }
  }

  get running(): boolean {
    return this.isRunning
  }
}

function buildPersonalityPrompt(dimensions: PersonalityDimension[]): string {
  if (dimensions.length === 0) return '你是一个中性的助手。'

  const traits = dimensions.map(d => {
    const level = d.value < 0.3 ? '低' : d.value < 0.7 ? '中等' : '高'
    return `${d.name}：${level}（${d.value.toFixed(2)}）`
  })

  return `你的性格特征：\n${traits.join('\n')}\n\n请根据这些性格特征调整你的回答风格和深度。`
}

export const orchestrator = new Orchestrator()
