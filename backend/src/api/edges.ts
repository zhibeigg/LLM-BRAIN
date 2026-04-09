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
import { getNodeById } from '../db/nodes.js'
import { getBrainById } from '../db/brains.js'

export const edgesRouter = Router()

/** 通过 nodeId 校验所有权 */
function verifyNodeOwnership(nodeId: string, userId: string): { ok: boolean; status?: number; error?: string } {
  const node = getNodeById(nodeId)
  if (!node) return { ok: false, status: 404, error: '关联节点不存在' }
  const brain = getBrainById(node.brainId)
  if (!brain) return { ok: false, status: 404, error: '大脑不存在' }
  if (brain.userId !== userId) return { ok: false, status: 403, error: '无权访问该资源' }
  return { ok: true }
}

// GET / - 获取所有边，支持 ?sourceId= 和 ?targetId= 过滤
edgesRouter.get('/', (req, res) => {
  try {
    const { sourceId, targetId } = req.query
    if (typeof sourceId === 'string') {
      const check = verifyNodeOwnership(sourceId, req.userId ?? '')
      if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
      res.json(getEdgesBySourceId(sourceId))
      return
    }
    if (typeof targetId === 'string') {
      const check = verifyNodeOwnership(targetId, req.userId ?? '')
      if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
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
    const check = verifyNodeOwnership(edge.sourceId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
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
    const check = verifyNodeOwnership(sourceId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
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
    const existing = getEdgeById(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Edge not found' })
      return
    }
    const check = verifyNodeOwnership(existing.sourceId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    const edge = updateEdge(req.params.id, req.body)
    if (!edge) { res.status(404).json({ error: 'Edge not found' }); return }
    res.json(edge)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// DELETE /:id - 删除边
edgesRouter.delete('/:id', (req, res) => {
  try {
    const existing = getEdgeById(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Edge not found' })
      return
    }
    const check = verifyNodeOwnership(existing.sourceId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    deleteEdge(req.params.id)
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
