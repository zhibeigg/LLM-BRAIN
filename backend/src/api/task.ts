import { Router } from 'express'
import { orchestrator } from '../llm/orchestrator.js'
import { broadcast } from '../ws/server.js'

export const taskRouter = Router()

// POST /api/task/execute - 执行任务
taskRouter.post('/execute', async (req, res) => {
  try {
    const { prompt, brainId } = req.body
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: '缺少 prompt 参数' })
      return
    }
    if (!brainId || typeof brainId !== 'string') {
      res.status(400).json({ error: '缺少 brainId 参数' })
      return
    }
    if (orchestrator.running) {
      res.status(409).json({ error: '已有任务在执行中' })
      return
    }
    // 异步执行，立即返回
    res.json({ status: 'started', message: '任务已开始执行，请通过 WebSocket 接收实时进度' })
    // 不 await，让它在后台运行
    orchestrator.executeTask(prompt, brainId).catch(err => {
      console.error('Task execution error:', err)
      broadcast('error', { message: err instanceof Error ? err.message : String(err) })
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
