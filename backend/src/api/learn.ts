import { Router } from 'express'
import { learnTopic } from '../core/learning/engine.js'
import { broadcast } from '../ws/server.js'

export const learnRouter = Router()

// POST /api/learn - 学习新知识
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

    // 立即返回，后台异步执行
    res.json({ status: 'started', message: '学习已开始，请通过 WebSocket 接收进度' })

    learnTopic(topic, brainId).catch(err => {
      console.error('Learning error:', err)
      broadcast('learning_progress', {
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
      broadcast('error', { message: err instanceof Error ? err.message : String(err) })
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})
