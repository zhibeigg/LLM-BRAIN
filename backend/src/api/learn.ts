import { Router } from 'express'
import { orchestrator } from '../llm/orchestrator.js'

export const learnRouter = Router()

// POST /api/learn - 学习新知识（支持排队）
learnRouter.post('/', async (req, res) => {
  try {
    const { topic, brainId } = req.body
    if (!topic || typeof topic !== 'string') {
      res.status(400).json({ error: '缺少 topic 参数' })
      return
    }
    if (!brainId || typeof brainId !== 'string') {
      res.status(400).json({ error: '缺少 brainId 参数' })
      return
    }

    const item = orchestrator.enqueue('learn', topic, brainId)
    const queued = orchestrator.running
    res.json({
      status: queued ? 'queued' : 'started',
      queueItemId: item.id,
      message: queued ? '学习任务已加入队列' : '学习已开始',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})
