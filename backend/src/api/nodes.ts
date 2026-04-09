import { Router } from 'express'
import type { NodeType } from '../types/index.js'
import {
  getAllNodes,
  getNodeById,
  getNodesByBrainId,
  getNodesByType,
  createNode,
  updateNode,
  deleteNode,
} from '../db/nodes.js'
import { getAllEdges } from '../db/edges.js'
import { getBrainById } from '../db/brains.js'
import { sugiyamaLayout } from '../core/graph/layout.js'

export const nodesRouter = Router()

/** 校验 brainId 是否属于当前用户 */
function verifyBrainOwnership(brainId: string, userId: string): { ok: boolean; status?: number; error?: string } {
  const brain = getBrainById(brainId)
  if (!brain) return { ok: false, status: 404, error: '大脑不存在' }
  if (brain.userId !== userId) return { ok: false, status: 403, error: '无权访问该大脑的资源' }
  return { ok: true }
}

// GET / - 获取节点，支持 ?brainId= 和 ?type= 过滤
nodesRouter.get('/', (req, res) => {
  try {
    const brainId = req.query.brainId as string | undefined
    const type = req.query.type as string | undefined

    if (type && type !== 'personality' && type !== 'memory') {
      res.status(400).json({ error: 'Invalid type' })
      return
    }

    if (brainId) {
      const check = verifyBrainOwnership(brainId, req.userId ?? '')
      if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    }

    let nodes = brainId ? getNodesByBrainId(brainId) : getAllNodes()
    if (type) {
      nodes = nodes.filter(n => n.type === type)
    }
    res.json(nodes)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /auto-layout - 自动重新规整所有节点布局
nodesRouter.post('/auto-layout', (req, res) => {
  try {
    const { brainId } = req.body
    if (!brainId) {
      res.status(400).json({ error: 'brainId is required' })
      return
    }

    const check = verifyBrainOwnership(brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }

    const nodes = getNodesByBrainId(brainId)
    if (nodes.length === 0) {
      res.json([])
      return
    }

    // 获取该大脑的所有边
    const nodeIds = new Set(nodes.map(n => n.id))
    const allEdges = getAllEdges()
    const brainEdges = allEdges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))

    // 计算布局
    const positions = sugiyamaLayout(
      nodes.map(n => ({ id: n.id, positionX: n.positionX, positionY: n.positionY, type: n.type })),
      brainEdges.map(e => ({ sourceId: e.sourceId, targetId: e.targetId })),
    )

    // 批量更新位置
    const updated = []
    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (pos) {
        const result = updateNode(node.id, { positionX: pos.x, positionY: pos.y })
        if (result) updated.push(result)
      }
    }

    res.json(updated)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /:id
nodesRouter.get('/:id', (req, res) => {
  try {
    const node = getNodeById(req.params.id)
    if (!node) { res.status(404).json({ error: 'Node not found' }); return }
    const check = verifyBrainOwnership(node.brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    res.json(node)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /
nodesRouter.post('/', (req, res) => {
  try {
    const { brainId, type, title, content, tags, confidence, positionX, positionY } = req.body
    if (!type || !title || !brainId) {
      res.status(400).json({ error: 'brainId, type and title are required' })
      return
    }

    const check = verifyBrainOwnership(brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }

    // 性格节点每个大脑只能有一个，由 createBrain 自动创建
    if (type === 'personality') {
      const existing = getNodesByBrainId(brainId)
      if (existing.some(n => n.type === 'personality')) {
        res.status(409).json({ error: '该大脑已有性格节点，每个大脑只能有一个性格节点' })
        return
      }
    }
    const node = createNode({
      brainId,
      type,
      content: content ?? '',
      tags: tags ?? [],
      confidence: confidence ?? 0.5,
      positionX: positionX ?? 0,
      positionY: positionY ?? 0,
      title,
    })
    res.status(201).json(node)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT /:id
nodesRouter.put('/:id', (req, res) => {
  try {
    const existing = getNodeById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Node not found' }); return }
    const check = verifyBrainOwnership(existing.brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    const node = updateNode(req.params.id, req.body)
    if (!node) { res.status(404).json({ error: 'Node not found' }); return }
    res.json(node)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// DELETE /:id
nodesRouter.delete('/:id', (req, res) => {
  try {
    const node = getNodeById(req.params.id)
    if (!node) { res.status(404).json({ error: 'Node not found' }); return }
    const check = verifyBrainOwnership(node.brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    if (node.type === 'personality') {
      res.status(403).json({ error: '性格节点不可删除，它是大脑的入口节点' })
      return
    }
    const deleted = deleteNode(req.params.id)
    if (!deleted) { res.status(404).json({ error: 'Node not found' }); return }
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
