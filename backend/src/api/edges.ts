import { Router } from 'express'
import {
  getAllEdges,
  getEdgeById,
  getEdgesBySourceId,
  getEdgesByTargetId,
  createEdge,
  updateEdge,
  deleteEdge,
} from '../db/edges.js'

export const edgesRouter = Router()

// GET / - 获取所有边，支持 ?sourceId= 和 ?targetId= 过滤
edgesRouter.get('/', (req, res) => {
  try {
    const { sourceId, targetId } = req.query
    if (typeof sourceId === 'string') {
      res.json(getEdgesBySourceId(sourceId))
      return
    }
    if (typeof targetId === 'string') {
      res.json(getEdgesByTargetId(targetId))
      return
    }
    res.json(getAllEdges())
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /:id - 获取单个边
edgesRouter.get('/:id', (req, res) => {
  try {
    const edge = getEdgeById(req.params.id)
    if (!edge) {
      res.status(404).json({ error: 'Edge not found' })
      return
    }
    res.json(edge)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST / - 创建边
edgesRouter.post('/', (req, res) => {
  try {
    const { sourceId, targetId, baseDifficulty, difficultyTypes, difficultyTypeWeights, lastUsedAt } = req.body
    if (!sourceId || !targetId) {
      res.status(400).json({ error: 'sourceId and targetId are required' })
      return
    }
    const edge = createEdge({
      sourceId,
      targetId,
      baseDifficulty: baseDifficulty ?? 0.5,
      difficultyTypes: difficultyTypes ?? [],
      difficultyTypeWeights: difficultyTypeWeights ?? {},
      lastUsedAt,
    })
    res.status(201).json(edge)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT /:id - 更新边
edgesRouter.put('/:id', (req, res) => {
  try {
    const edge = updateEdge(req.params.id, req.body)
    if (!edge) {
      res.status(404).json({ error: 'Edge not found' })
      return
    }
    res.json(edge)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// DELETE /:id - 删除边
edgesRouter.delete('/:id', (req, res) => {
  try {
    const deleted = deleteEdge(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Edge not found' })
      return
    }
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
