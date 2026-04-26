import { broadcast } from '../../ws/server.js'
import { randomUUID } from 'crypto'
import { Mutex } from 'async-mutex'
import type { ExecutionMode } from '../../types/index.js'

import { TaskQueue } from './TaskQueue.js'
import { LeaderOrchestrator, DifficultyAdjuster } from './LeaderOrchestrator.js'
import { AgentOrchestrator } from './AgentOrchestrator.js'
import { BossOrchestrator } from './BossOrchestrator.js'
import { ApprovalManager } from './ApprovalManager.js'

import { getDimensionsByBrainId } from '../../db/personality.js'
import { getMappings } from '../../db/difficulty-mapping.js'
import { autoExtractNodes } from '../../core/extraction/engine.js'

const MAX_RETRIES = 3

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
        // 空闲时直接执行，不把当前任务显示为“排队中”
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

        try {
          await this.executeTask(item.prompt, item.brainId, true)
        } catch (err) {
          console.error('Task execution error:', err)
          broadcast('error', { message: err instanceof Error ? err.message : String(err) })
        } finally {
          this.taskQueue.isRunning = false
          this._onTaskFinished()
        }
      } else {
        this.taskQueue.isRunning = true
        release() // 释放锁

        try {
          const { learnTopic } = await import('../../core/learning/engine.js')
          await learnTopic(item.prompt, item.brainId)
        } catch (err) {
          console.error('Learning error:', err)
          broadcast('learning_progress', { phase: 'error', message: err instanceof Error ? err.message : String(err) })
          broadcast('error', { message: err instanceof Error ? err.message : String(err) })
        } finally {
          this.taskQueue.isRunning = false
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

      try {
        return await this._executeTaskInner(taskPrompt, brainId)
      } finally {
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
    const dimensions = getDimensionsByBrainId(brainId)
    const mappings = getMappings()

    // ── Leader 决策循环 ──
    const { visitedPath, collectedMemories, totalSteps } = await this.leaderOrchestrator.executeDecisionLoop(
      taskPrompt,
      brainId,
      dimensions,
      mappings,
      this._mode,
      (_requestId, description) => this.approvalManager.requestStepApproval(description)
    )

    // ── plan 模式：路径遍历完后暂停，等待用户确认 ──
    if (this._mode === 'plan' || this._mode === 'supervised') {
      const planPayload = {
        planId: randomUUID(),
        taskPrompt,
        path: collectedMemories.map(n => ({ nodeId: n.id, nodeTitle: n.title, nodeType: n.type })),
        memoryContext: collectedMemories.map(n => `[${n.title}]: ${n.content.substring(0, 100)}`).join('\n'),
        totalSteps,
      }

      const approved = await this.approvalManager.requestPlanApproval(planPayload)
      if (!approved) {
        broadcast('error', { message: '用户拒绝了执行计划' })
        return '计划被用户拒绝'
      }
    }

    // ── Agent 执行 ──
    const memoryContext = collectedMemories.map(n => `[${n.title}]: ${n.content}`).join('\n\n')
    const agentResult = await this.agentOrchestrator.execute(
      taskPrompt,
      dimensions,
      memoryContext,
      this._enabledTools,
      brainId
    )

    // ── Boss 验证 ──
    const { passed, isLoop } = await this.bossOrchestrator.verify(
      taskPrompt,
      agentResult,
      visitedPath
    )

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
