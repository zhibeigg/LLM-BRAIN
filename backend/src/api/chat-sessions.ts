import { Router } from 'express'
import * as chatSessionsDb from '../db/chat-sessions.js'

export const chatSessionsRouter = Router()

// GET /chat-sessions?brainId=xxx&cursor=123&limit=20
chatSessionsRouter.get('/', (req, res) => {
  try {
    const userId = req.userId!
    const brainId = req.query.brainId as string | undefined
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined
    const limit = req.query.limit ? Number(req.query.limit) : 20
    const result = chatSessionsDb.getSessionsByUserPaginated(userId, brainId, cursor, limit)
    res.json(result)
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : '获取会话失败' })
  }
})

// POST /chat-sessions
chatSessionsRouter.post('/', (req, res) => {
  try {
    const userId = req.userId!
    const { brainId, type, prompt } = req.body
    if (!brainId || !type || !prompt) {
      res.status(400).json({ message: '缺少必要参数' })
      return
    }
    const session = chatSessionsDb.createSession({ userId, brainId, type, prompt })
    res.json(session)
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : '创建会话失败' })
  }
})

// PUT /chat-sessions/:id
chatSessionsRouter.put('/:id', (req, res) => {
  try {
    const userId = req.userId!
    const { id } = req.params
    const { agentOutput, thinkingSteps, status } = req.body
    const session = chatSessionsDb.updateSession(id, userId, { agentOutput, thinkingSteps, status })
    if (!session) {
      res.status(404).json({ message: '会话不存在' })
      return
    }
    res.json(session)
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : '更新会话失败' })
  }
})

// DELETE /chat-sessions/:id
chatSessionsRouter.delete('/:id', (req, res) => {
  try {
    const userId = req.userId!
    const { id } = req.params
    const ok = chatSessionsDb.deleteSession(id, userId)
    if (!ok) {
      res.status(404).json({ message: '会话不存在' })
      return
    }
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : '删除会话失败' })
  }
})
