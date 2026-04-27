import { broadcast } from '../../ws/server.js'
import { randomUUID } from 'crypto'
import { Mutex } from 'async-mutex'
import type { ExecutionMode, ExecutionSnapshot, LeaderReturnPayload } from '../../types/index.js'

import { TaskQueue } from './TaskQueue.js'
import { LeaderOrchestrator, DifficultyAdjuster } from './LeaderOrchestrator.js'
import { AgentOrchestrator } from './AgentOrchestrator.js'
import { BossOrchestrator } from './BossOrchestrator.js'
import { ApprovalManager } from './ApprovalManager.js'

import { getDimensionsByBrainId } from '../../db/personality.js'
import { getMappings } from '../../db/difficulty-mapping.js'
import { autoExtractNodes } from '../../core/extraction/engine.js'
import { getNodeById, getNodesByBrainId } from '../../db/nodes.js'
import { getBrainById } from '../../db/brains.js'

const MAX_RETRIES = 3

function isDirectProjectInspectionTask(taskPrompt: string, enabledTools: string[], projectPath?: string): boolean {
  if (!projectPath) return false
  const hasInspectionTool = enabledTools.some(tool => ['file_list', 'file_glob', 'file_search', 'file_read', 'terminal'].includes(tool))
  if (!hasInspectionTool) return false

  const prompt = taskPrompt.toLowerCase()
  return [
    /列出.*(目录|项目).*(结构|树|文件)/,
    /(查看|展示|显示).*(目录|项目).*(结构|树|文件)/,
    /(目录结构|项目结构|文件树|文件列表)/,
    /list.*(directory|project|file).*(tree|structure|files?)/,
    /(show|display).*(directory|project|file).*(tree|structure|files?)/,
  ].some(pattern => pattern.test(prompt))
}

/**
 * 统一导出的 Orchestrator 主类
 * 协调所有子模块，提供统一的接口
 */
export class Orchestrator {
  // 子模块实例
  readonly taskQueue = new TaskQueue()
  readonly approvalManager = new ApprovalManager()
  private difficultyAdjuster = new DifficultyAdjuster()
  private leaderOrchestrator = new LeaderOrchestrator()
  private agentOrchestrator = new AgentOrchestrator()
  private bossOrchestrator = new BossOrchestrator()

  private mutex = new Mutex()
  private _mode: ExecutionMode = 'auto'
  private _enabledTools: string[] = []
  private retryCount = 0
  private _abortController: AbortController | null = null

  constructor() {
    // 审批管理器已在其构造函数中初始化监听
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

  /** 强行终止当前执行中的任务 */
  abort(): boolean {
    if (!this._abortController) return false
    this._abortController.abort()
    this._abortController = null
    return true
  }

  /** 检查是否已被终止，如果是则抛出错误 */
  private checkAborted() {
    if (this._abortController?.signal.aborted) {
      throw new Error('任务已被用户终止')
    }
  }

  /** 获取运行状态（线程安全） */
  get isRunning(): boolean {
    return this.taskQueue.isRunning
  }

  // ── 队列管理 ──

  async enqueue(type: 'task' | 'learn', prompt: string, brainId: string, mode?: ExecutionMode, enabledTools?: string[]): Promise<import('../../types/index.js').QueueItem> {
    if (mode) this._mode = mode
    if (enabledTools) this._enabledTools = enabledTools

    const item: import('../../types/index.js').QueueItem = {
      id: randomUUID(),
      type,
      prompt,
      brainId,
      createdAt: Date.now(),
    }

    const release = await this.mutex.acquire()
    try {
      if (!this.taskQueue.isRunning) {
        // 空闲时直接执行，不把当前任务显示为"排队中"
        this._runItem(item).catch(err => {
          console.error('Queue item execution error:', err)
        })
      } else {
        await this.taskQueue.enqueueItem(item)
      }
    } finally {
      release()
    }

    return item
  }

  async removeFromQueue(id: string): Promise<boolean> {
    return this.taskQueue.remove(id)
  }

  get queue() {
    return this.taskQueue.items
  }

  private async _runItem(item: import('../../types/index.js').QueueItem) {
    const release = await this.mutex.acquire()

    try {
      if (item.type === 'task') {
        this.taskQueue.isRunning = true
        release() // 释放锁，让executeTask自己获取

        let taskStatus: 'success' | 'error' = 'success'
        try {
          await this.executeTask(item.prompt, item.brainId, true)
        } catch (err) {
          taskStatus = 'error'
          console.error('Task execution error:', err)
          broadcast('error', { message: err instanceof Error ? err.message : String(err) })
        } finally {
          this.taskQueue.isRunning = false
          broadcast('task_complete', { status: taskStatus, type: 'task', prompt: item.prompt })
          this._onTaskFinished()
        }
      } else {
        this.taskQueue.isRunning = true
        release() // 释放锁

        let learnStatus: 'success' | 'error' = 'success'
        try {
          const { learnTopic } = await import('../../core/learning/engine.js')
          await learnTopic(item.prompt, item.brainId)
        } catch (err) {
          learnStatus = 'error'
          console.error('Learning error:', err)
          broadcast('learning_progress', { phase: 'error', message: err instanceof Error ? err.message : String(err) })
          broadcast('error', { message: err instanceof Error ? err.message : String(err) })
        } finally {
          this.taskQueue.isRunning = false
          broadcast('task_complete', { status: learnStatus, type: 'learn', prompt: item.prompt })
          this._onTaskFinished()
        }
      }
    } catch (err) {
      // 如果在获取锁时发生错误，确保释放锁
      if (release) release()
      throw err
    }
  }

  private async _onTaskFinished() {
    const release = await this.mutex.acquire()

    try {
      if (this.taskQueue.length > 0) {
        const next = await this.taskQueue.shift()
        if (next) {
          setTimeout(() => this._runItem(next), 300)
        }
      }
    } finally {
      release()
    }
  }

  // ── 任务执行 ──

  async executeTask(taskPrompt: string, brainId: string, _fromQueue = false): Promise<string> {
    const release = await this.mutex.acquire()

    try {
      if (!_fromQueue && this.taskQueue.isRunning) {
        throw new Error('已有任务在执行中')
      }

      this.taskQueue.isRunning = true
      this.retryCount = 0
      this._abortController = new AbortController()

      try {
        return await this._executeTaskInner(taskPrompt, brainId)
      } finally {
        this._abortController = null
        if (!_fromQueue) {
          this.taskQueue.isRunning = false
          this._onTaskFinished()
        }
      }
    } finally {
      release()
    }
  }

  private async _executeTaskInner(taskPrompt: string, brainId: string): Promise<string> {
    this.checkAborted()
    const dimensions = getDimensionsByBrainId(brainId)
    const mappings = getMappings()
    const brain = getBrainById(brainId)

    if (isDirectProjectInspectionTask(taskPrompt, this._enabledTools, brain?.projectPath)) {
      this.checkAborted()
      const personalityNode = getNodesByBrainId(brainId).find(node => node.type === 'personality')
      const memoryContext = personalityNode ? `[${personalityNode.title}]: ${personalityNode.content}` : ''
      return this.agentOrchestrator.execute(
        taskPrompt,
        dimensions,
        memoryContext,
        this._enabledTools,
        brainId,
        brain?.projectPath
      )
    }

    // ── Leader 决策循环（支持回退） ──
    this.checkAborted()
    const { visitedPath, collectedMemories, totalSteps } = await this.leaderOrchestrator.executeDecisionLoop(
      taskPrompt,
      brainId,
      dimensions,
      mappings,
      this._mode,
      (description, snapshots) => this.approvalManager.requestStepApproval(description, snapshots)
    )

    // ── plan / supervised 模式：路径遍历完后暂停，等待用户确认（支持回退） ──
    if (this._mode === 'plan' || this._mode === 'supervised') {
      const planPayload = {
        planId: randomUUID(),
        taskPrompt,
        path: collectedMemories.map((n, i) => ({ nodeId: n.id, nodeTitle: n.title, nodeType: n.type, stepIndex: i })),
        memoryContext: collectedMemories.map(n => `[${n.title}]: ${n.content.substring(0, 100)}`).join('\n'),
        totalSteps,
      }

      const planResult = await this.approvalManager.requestPlanApproval(planPayload)

      if (planResult.action === 'reject') {
        broadcast('error', { message: '用户拒绝了执行计划' })
        return '计划被用户拒绝'
      }

      if (planResult.action === 'return_to' && planResult.returnToNodeId) {
        // 用户在计划审批阶段请求回退到某个节点，重新执行 Leader 决策
        const returnNode = getNodeById(planResult.returnToNodeId)
        broadcast('leader_return', {
          returnToNodeId: planResult.returnToNodeId,
          returnToNodeTitle: returnNode?.title ?? '未知',
          returnToStepIndex: collectedMemories.findIndex(n => n.id === planResult.returnToNodeId),
          reason: '用户在计划审批阶段请求回退重选',
        } satisfies LeaderReturnPayload)
        // 递归重新执行整个任务（Leader 会从头开始，但路径难度已调整）
        return this._executeTaskInner(taskPrompt, brainId)
      }
    }

    // ── Agent 执行 ──
    this.checkAborted()
    const memoryContext = collectedMemories.map(n => `[${n.title}]: ${n.content}`).join('\n\n')
    const agentResult = await this.agentOrchestrator.execute(
      taskPrompt,
      dimensions,
      memoryContext,
      this._enabledTools,
      brainId,
      brain?.projectPath
    )

    // ── Boss 验证 ──
    this.checkAborted()
    const { passed, isLoop, uncertain } = await this.bossOrchestrator.verify(
      taskPrompt,
      agentResult,
      visitedPath
    )

    if (uncertain) {
      // 不确定通常代表误输入、需求不明确或继续重试价值不足：直接停止，避免重复消耗 token。
      return agentResult
    }

    if (!passed && !isLoop) {
      this.difficultyAdjuster.adjustPathDifficulty(visitedPath, false)
      if (this.retryCount < MAX_RETRIES) {
        this.retryCount++
        return this._executeTaskInner(taskPrompt, brainId)
      }
      broadcast('error', { message: `已达到最大重试次数（${MAX_RETRIES}），返回最后结果` })
      return agentResult
    }

    if (passed) {
      this.difficultyAdjuster.adjustPathDifficulty(visitedPath, true)
      // 只有 Agent 回答足够长（包含实质内容）时才触发知识蒸馏
      // 过短的回答通常是简单问答/闲聊，不值得创建节点
      if (agentResult.length >= 100) {
        autoExtractNodes(taskPrompt, agentResult, brainId).catch(err => console.error('Auto extraction failed:', err))
      }
    }

    return agentResult
  }

  get running(): boolean {
    return this.isRunning
  }
}

export const orchestrator = new Orchestrator()
