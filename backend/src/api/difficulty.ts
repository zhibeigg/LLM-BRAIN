import { Router } from 'express'
import { getAllEdges } from '../db/edges.js'
import { getDimensionsByBrainId } from '../db/personality.js'
import { getBrainById } from '../db/brains.js'
import { getMappings } from '../db/difficulty-mapping.js'
import { computeAllPerceivedDifficulties, computeToleranceThreshold } from '../core/difficulty/index.js'

export const difficultyRouter = Router()

// GET /perceived?brainId= - 获取所有边的感知难度
difficultyRouter.get('/perceived', (req, res) => {
  try {
    const brainId = req.query.brainId as string | undefined
    if (!brainId) {
      res.status(400).json({ error: 'brainId is required' })
      return
    }

    // 校验所有权
    const brain = getBrainById(brainId)
    if (!brain) { res.status(404).json({ error: '大脑不存在' }); return }
    if (brain.userId !== req.userId) { res.status(403).json({ error: '无权访问' }); return }

    const edges = getAllEdges()
    const dimensions = getDimensionsByBrainId(brainId)
    const mappings = getMappings()

    const perceivedMap = computeAllPerceivedDifficulties(edges, dimensions, mappings)

    const result: Record<string, number> = {}
    for (const [edgeId, difficulty] of perceivedMap) {
      result[edgeId] = difficulty
    }

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /threshold?brainId= - 获取当前性格的难度容忍阈值
difficultyRouter.get('/threshold', (req, res) => {
  try {
    const brainId = req.query.brainId as string | undefined
    if (!brainId) {
      res.status(400).json({ error: 'brainId is required' })
      return
    }

    // 校验所有权
    const brain = getBrainById(brainId)
    if (!brain) { res.status(404).json({ error: '大脑不存在' }); return }
    if (brain.userId !== req.userId) { res.status(403).json({ error: '无权访问' }); return }

    const dimensions = getDimensionsByBrainId(brainId)
    const threshold = computeToleranceThreshold(dimensions)
    res.json({ threshold })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
