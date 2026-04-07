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
import { broadcast, onClientMessage } from '../ws/server.js'
import { buildOpenAITools } from '../tools/index.js'
import type {
  MemoryNode, PersonalityDimension,
  DifficultyPersonalityMapping, LeaderStepPayload,
  LeaderDecisionPayload, AgentStreamPayload, BossVerdictPayload,
  QueueItem, ExecutionMode, PlanReadyPayload, StepConfirmPayload,
} from '../types/index.js'
import { randomUUID } from 'crypto'

const MAX_RETRIES = 3
const CONFIRM_TIMEOUT = 300_000 // 5 分钟超时

export class Orchestrator {
  private leader = new LeaderRole()
  private boss = new BossRole()
  private isRunning = false
  private retryCount = 0
  private _queue: QueueItem[] = []
  private _mode: ExecutionMode = 'auto'
  private _enabledTools: string[] = []

  // 等待前端响应的 resolve 函数
  private _pendingResolve: ((approved: boolean) => void) | null = null

  constructor() {
    // 监听前端的审批响应
    onClientMessage('plan_response', (payload) => {
      const { approved } = payload as { approved: boolean }
      if (this._pendingResolve) {
        this._pendingResolve(approved)
        this._pendingResolve = null
      }
    })

    onClientMessage('step_response', (payload) => {
      const { approved } = payload as { approved: boolean }
      if (this._pendingResolve) {
        this._pendingResolve(approved)
        this._pendingResolve = null
      }
    })
  }

  /** 设置执行模式 */
  setMode(mode: ExecutionMode) {
    this._mode = mode
  }

  get mode(): ExecutionMode {
    return this._mode
  }

  /** 设置启用的工具列表 */
  setEnabledTools(toolIds: string[]) {
    this._enabledTools = toolIds
  }

  get enabledTools(): string[] {
    return this._enabledTools
  }

  /** 等待前端确认，返回 true=批准 false=拒绝 */
  private _waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this._pendingResolve = resolve
      // 超时自动批准
      setTimeout(() => {
        if (this._pendingResolve === resolve) {
          this._pendingResolve = null
          resolve(true)
        }
      }, CONFIRM_TIMEOUT)
    })
  }

  // ── 队列管理 ──

  enqueue(type: 'task' | 'learn', prompt: string, brainId: string, mode?: ExecutionMode, enabledTools?: string[]): QueueItem {
    const item: QueueItem = {
      id: randomUUID(),
      type,
      prompt,
      brainId,
      createdAt: Date.now(),
    }

    if (mode) this._mode = mode
    if (enabledTools) this._enabledTools = enabledTools

    if (!this.isRunning) {
      this._runItem(item)
    } else {
      this._queue.push(item)
      this._broadcastQueue()
    }

    return item
  }

  removeFromQueue(id: string): boolean {
    const idx = this._queue.findIndex(q => q.id === id)
    if (idx === -1) return false
    this._queue.splice(idx, 1)
    this._broadcastQueue()
    return true
  }

  get queue(): QueueItem[] {
    return [...this._queue]
  }

  private _broadcastQueue() {
    broadcast('queue_update', { queue: this._queue })
  }

  private _runItem(item: QueueItem) {
    if (item.type === 'task') {
      this.executeTask(item.prompt, item.brainId).catch(err => {
        console.error('Task execution error:', err)
        broadcast('error', { message: err instanceof Error ? err.message : String(err) })
      })
    } else {
      this.isRunning = true
      import('../core/learning/engine.js').then(({ learnTopic }) => {
        learnTopic(item.prompt, item.brainId)
          .catch(err => {
            console.error('Learning error:', err)
            broadcast('learning_progress', { phase: 'error', message: err instanceof Error ? err.message : String(err) })
            broadcast('error', { message: err instanceof Error ? err.message : String(err) })
          })
          .finally(() => {
            this.isRunning = false
            this._onTaskFinished()
          })
      })
    }
  }

  private _onTaskFinished() {
    if (this._queue.length > 0) {
      const next = this._queue.shift()!
      this._broadcastQueue()
      setTimeout(() => this._runItem(next), 300)
    }
  }

  // ── 任务执行 ──

  async executeTask(taskPrompt: string, brainId: string): Promise<string> {
    if (this.isRunning) throw new Error('已有任务在执行中')
    this.isRunning = true
    this.retryCount = 0
    try {
      return await this._executeTaskInner(taskPrompt, brainId)
    } finally {
      this.isRunning = false
      this._onTaskFinished()
    }
  }

  private async _executeTaskInner(taskPrompt: string, brainId: string): Promise<string> {
    const dimensions = getDimensionsByBrainId(brainId)
    const mappings = getMappings()
    const threshold = computeToleranceThreshold(dimensions)

    const allNodes = getNodesByBrainId(brainId)
    let startNode = allNodes.find(n => n.type === 'personality')
    if (!startNode && allNodes.length > 0) startNode = allNodes[0]
    if (!startNode) throw new Error('图谱中没有任何节点')

    // ── Leader 决策循环 ──
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
        return { edge, perceivedDifficulty: perceived, targetNode, filtered: perceived > threshold }
      })

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

      const leaderInput = JSON.stringify({
        task: taskPrompt,
        currentNode: { id: currentNode.id, title: currentNode.title, content: currentNode.content.substring(0, 200), type: currentNode.type },
        candidates: candidates.map(c => ({
          edgeId: c.edge.id, targetNodeId: c.edge.targetId, targetTitle: c.targetNode?.title || '未知',
          targetContentPreview: c.targetNode?.content?.substring(0, 100) || '',
          perceivedDifficulty: c.perceivedDifficulty, difficultyTypes: c.edge.difficultyTypes, filtered: c.filtered,
        })),
        toleranceThreshold: threshold,
        visitedNodes: visitedPath,
        totalSteps,
        personalityDescription: dimensions.map(d => `${d.name}: ${d.value.toFixed(2)}`).join(', '),
      })

      const leaderResult = await this.leader.chat(leaderInput)
      let decision: { action: string; edgeId: string | null; reason: string; thinking: string }

      const parseLeaderDecision = (raw: unknown): typeof decision => {
        const obj = raw as Record<string, unknown>
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
          catch { decision = { action: 'stop', edgeId: null, reason: 'Leader 返回格式错误，自动停止', thinking: leaderResult.content } }
        } else {
          decision = { action: 'stop', edgeId: null, reason: 'Leader 返回格式错误，自动停止', thinking: leaderResult.content }
        }
      }

      broadcast('leader_decision', { chosenEdgeId: decision.edgeId, reason: decision.reason, totalSteps } satisfies LeaderDecisionPayload)
      broadcast('leader_step', { currentNodeId: currentNode.id, candidates: [], thinking: decision.thinking || '' } satisfies LeaderStepPayload)

      // supervised 模式：每步决策后等待确认
      if (this._mode === 'supervised' && decision.edgeId) {
        broadcast('step_confirm', {
          stepId: randomUUID(),
          type: 'leader_decision',
          description: `Leader 选择路径 → ${candidates.find(c => c.edge.id === decision.edgeId)?.targetNode?.title || '未知'}`,
        } satisfies StepConfirmPayload)

        const approved = await this._waitForApproval()
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

    // ── plan 模式：路径遍历完后暂停，等待用户确认 ──
    if (this._mode === 'plan' || this._mode === 'supervised') {
      const planPayload: PlanReadyPayload = {
        planId: randomUUID(),
        taskPrompt,
        path: collectedMemories.map(n => ({ nodeId: n.id, nodeTitle: n.title, nodeType: n.type })),
        memoryContext: collectedMemories.map(n => `[${n.title}]: ${n.content.substring(0, 100)}`).join('\n'),
        totalSteps,
      }
      broadcast('plan_ready', planPayload)

      const approved = await this._waitForApproval()
      if (!approved) {
        broadcast('error', { message: '用户拒绝了执行计划' })
        return '计划被用户拒绝'
      }
    }

    // ── Agent 执行 ──
    const personalityPrompt = buildPersonalityPrompt(dimensions)
    const memoryContext = collectedMemories.map(n => `[${n.title}]: ${n.content}`).join('\n\n')
    const agent = new AgentRole(personalityPrompt)
    const agentInput = `任务：${taskPrompt}\n\n参考记忆：\n${memoryContext}`

    let agentResult = ''
    const openaiTools = buildOpenAITools(this._enabledTools)

    if (openaiTools.length > 0) {
      // 有工具时使用工具调用循环（非流式）
      agentResult = await agent.executeWithTools(agentInput, openaiTools, { brainId })
    } else {
      // 无工具时使用流式输出
      for await (const chunk of agent.chatStream(agentInput)) {
        agentResult += chunk.content
        broadcast('agent_stream', { chunk: chunk.content, done: chunk.done } satisfies AgentStreamPayload)
      }
    }

    // ── Boss 验证 ──
    const retryHistory = getHistoryByTaskPrompt(taskPrompt)
    const bossInput = JSON.stringify({
      originalTask: taskPrompt, agentResult,
      retryHistory: retryHistory.slice(-5).map(h => ({ result: h.result?.substring(0, 200), status: h.status, feedback: h.bossFeedback })),
      retryCount: retryHistory.length,
    })

    const bossResult = await this.boss.chat(bossInput)
    let verdict: { passed: boolean; feedback: string; isLoop: boolean }

    const parseBossVerdict = (raw: unknown): typeof verdict => {
      const obj = raw as Record<string, unknown>
      return {
        passed: (obj.passed ?? obj.pass ?? obj.approved ?? true) as boolean,
        feedback: (obj.feedback ?? obj.comment ?? obj.reason ?? '') as string,
        isLoop: (obj.isLoop ?? obj.is_loop ?? obj.loop ?? false) as boolean,
      }
    }

    try {
      verdict = parseBossVerdict(JSON.parse(bossResult.content))
    } catch {
      const cleaned = bossResult.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        try { verdict = parseBossVerdict(JSON.parse(jsonMatch[0])) }
        catch { verdict = { passed: true, feedback: '验证格式错误，默认通过', isLoop: false } }
      } else {
        verdict = { passed: true, feedback: '验证格式错误，默认通过', isLoop: false }
      }
    }

    broadcast('boss_verdict', { passed: verdict.passed, feedback: verdict.feedback, isLoop: verdict.isLoop, retryCount: retryHistory.length } satisfies BossVerdictPayload)

    const status = verdict.isLoop ? 'loop_detected' : verdict.passed ? 'success' : 'failure'
    createHistory({ taskPrompt, pathTaken: visitedPath, result: agentResult, status, bossFeedback: verdict.feedback, retryCount: retryHistory.length })

    if (!verdict.passed && !verdict.isLoop) {
      this.adjustPathDifficulty(visitedPath, false)
      if (this.retryCount < MAX_RETRIES) {
        this.retryCount++
        return this._executeTaskInner(taskPrompt, brainId)
      }
      broadcast('error', { message: `已达到最大重试次数（${MAX_RETRIES}），返回最后结果` })
      return agentResult
    }

    if (verdict.passed) {
      this.adjustPathDifficulty(visitedPath, true)
      autoExtractNodes(taskPrompt, agentResult, brainId).catch(err => console.error('Auto extraction failed:', err))
    }

    return agentResult
  }

  private adjustPathDifficulty(pathNodeIds: string[], success: boolean): void {
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const edges = getEdgesBySourceId(pathNodeIds[i])
      const edge = edges.find(e => e.targetId === pathNodeIds[i + 1])
      if (edge) {
        const factor = success ? 0.95 : 1.1
        updateEdge(edge.id, { baseDifficulty: Math.max(0.05, Math.min(1.0, edge.baseDifficulty * factor)) })
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
