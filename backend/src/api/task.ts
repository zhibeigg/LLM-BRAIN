import { Router } from 'express'
import { orchestrator } from '../llm/orchestrator.js'
import { getBrainById } from '../db/brains.js'
import type { ExecutionMode } from '../types/index.js'

export const taskRouter = Router()

// POST /api/task/execute - 执行任务（支持排队 + 执行模式）
taskRouter.post('/execute', async (req, res) => {
  try {
    const { prompt, brainId, mode, enabledTools } = req.body
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: '缺少 prompt 参数' })
      return
    }
    if (!brainId || typeof brainId !== 'string') {
      res.status(400).json({ error: '缺少 brainId 参数' })
      return
    }

    // 校验 brainId 所有权
    const brain = getBrainById(brainId)
    if (!brain) {
      res.status(404).json({ error: '大脑不存在' })
      return
    }
    if (brain.userId !== req.userId) {
      res.status(403).json({ error: '无权操作该大脑' })
      return
    }

    const execMode = (['auto', 'plan', 'supervised', 'readonly'].includes(mode) ? mode : undefined) as ExecutionMode | undefined

    if (execMode === 'readonly') {
      res.status(403).json({ error: '当前为只读模式，不允许执行任务' })
      return
    }

    const tools = Array.isArray(enabledTools) ? enabledTools as string[] : undefined
    const item = await orchestrator.enqueue('task', prompt, brainId, execMode, tools)
    const queued = orchestrator.running
    res.json({
      status: queued ? 'queued' : 'started',
      queueItemId: item.id,
      message: queued ? '任务已加入队列' : '任务已开始执行',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

// GET /api/task/status - 获取任务状态
taskRouter.get('/status', (_req, res) => {
  res.json({ running: orchestrator.running })
})

// GET /api/task/queue - 获取当前队列
taskRouter.get('/queue', (_req, res) => {
  res.json({ queue: orchestrator.queue })
})

// DELETE /api/task/queue/:id - 取消排队
taskRouter.delete('/queue/:id', async (req, res) => {
  const removed = await orchestrator.removeFromQueue(req.params.id)
  if (removed) {
    res.json({ status: 'removed' })
  } else {
    res.status(404).json({ error: '队列中未找到该任务' })
  }
})
