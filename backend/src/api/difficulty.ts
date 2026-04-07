import { Router } from 'express'
import { getAllEdges } from '../db/edges.js'
import { getAllDimensions } from '../db/personality.js'
import { getMappings } from '../db/difficulty-mapping.js'
import { computeAllPerceivedDifficulties, computeToleranceThreshold } from '../core/difficulty/index.js'

export const difficultyRouter = Router()

// GET /perceived - 获取所有边的感知难度
difficultyRouter.get('/perceived', (_req, res) => {
  try {
    const edges = getAllEdges()
    const dimensions = getAllDimensions()
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

// GET /threshold - 获取当前性格的难度容忍阈值
difficultyRouter.get('/threshold', (_req, res) => {
  try {
    const dimensions = getAllDimensions()
    const threshold = computeToleranceThreshold(dimensions)
    res.json({ threshold })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
