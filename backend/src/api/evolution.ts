import { Router } from 'express'
import { distillAndEvolve, decayUnusedEdges } from '../core/evolution/index.js'

export const evolutionRouter = Router()

// POST /decay - 手动触发衰减
evolutionRouter.post('/decay', (_req, res) => {
  try {
    decayUnusedEdges()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /distill - 手动触发蒸馏（测试用）
evolutionRouter.post('/distill', async (req, res) => {
  try {
    const { taskPrompt, agentResult, pathNodeIds, personalityLabel, brainId } = req.body
    if (!taskPrompt || !agentResult || !pathNodeIds || !brainId) {
      res.status(400).json({ error: 'taskPrompt, agentResult, pathNodeIds, brainId are required' })
      return
    }
    await distillAndEvolve(taskPrompt, agentResult, pathNodeIds, personalityLabel ?? '', brainId)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
