import { Router } from 'express'
import {
  getAllDimensions,
  getDimensionsByBrainId,
  getDimensionById,
  createDimension,
  updateDimension,
  deleteDimension,
  getMaxDimensions,
  setMaxDimensions,
} from '../db/personality.js'
import { getBrainById } from '../db/brains.js'
import { parsePersonalityFromChat } from '../core/personality/index.js'

export const personalityRouter = Router()

/** 校验 brainId 是否属于当前用户 */
function verifyBrainOwnership(brainId: string, userId: string): { ok: boolean; status?: number; error?: string } {
  const brain = getBrainById(brainId)
  if (!brain) return { ok: false, status: 404, error: '大脑不存在' }
  if (brain.userId !== userId) return { ok: false, status: 403, error: '无权访问该大脑的资源' }
  return { ok: true }
}

// GET /dimensions - 获取维度，支持 ?brainId= 过滤
personalityRouter.get('/dimensions', (req, res) => {
  try {
    const brainId = req.query.brainId as string | undefined
    if (brainId) {
      const check = verifyBrainOwnership(brainId, req.userId ?? '')
      if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    }
    const dims = brainId ? getDimensionsByBrainId(brainId) : getAllDimensions()
    res.json(dims)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /dimensions - 创建维度（检查上限）
personalityRouter.post('/dimensions', (req, res) => {
  try {
    const { brainId, name, description, value, isBuiltin, sortOrder } = req.body
    if (!name || !brainId) {
      res.status(400).json({ error: 'brainId and name are required' })
      return
    }
    const check = verifyBrainOwnership(brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    const current = getDimensionsByBrainId(brainId)
    const max = getMaxDimensions()
    if (current.length >= max) {
      res.status(400).json({ error: `Dimension limit reached (max: ${max})` })
      return
    }
    const dim = createDimension({
      brainId,
      name,
      description: description ?? '',
      value: value ?? 0.5,
      isBuiltin: isBuiltin ?? false,
      sortOrder: sortOrder ?? 0,
    })
    res.status(201).json(dim)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT /dimensions/:id - 更新维度
personalityRouter.put('/dimensions/:id', (req, res) => {
  try {
    const existing = getDimensionById(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Dimension not found' })
      return
    }
    const check = verifyBrainOwnership(existing.brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    const dim = updateDimension(req.params.id, req.body)
    if (!dim) { res.status(404).json({ error: 'Dimension not found' }); return }
    res.json(dim)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// DELETE /dimensions/:id - 删除维度
personalityRouter.delete('/dimensions/:id', (req, res) => {
  try {
    const existing = getDimensionById(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Dimension not found' })
      return
    }
    const check = verifyBrainOwnership(existing.brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    deleteDimension(req.params.id)
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /max-dimensions - 获取维度上限
personalityRouter.get('/max-dimensions', (_req, res) => {
  try {
    res.json({ max: getMaxDimensions() })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT /max-dimensions - 设置维度上限
personalityRouter.put('/max-dimensions', (req, res) => {
  try {
    const { max } = req.body
    if (typeof max !== 'number' || max < 1) {
      res.status(400).json({ error: 'max must be a positive number' })
      return
    }
    setMaxDimensions(max)
    res.json({ max })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /parse - 解析性格描述
personalityRouter.post('/parse', async (req, res) => {
  try {
    const { description, brainId } = req.body
    if (!description || typeof description !== 'string' || !brainId) {
      res.status(400).json({ error: 'description and brainId are required' })
      return
    }
    const check = verifyBrainOwnership(brainId, req.userId ?? '')
    if (!check.ok) { res.status(check.status!).json({ error: check.error }); return }
    const result = await parsePersonalityFromChat(description, brainId)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
