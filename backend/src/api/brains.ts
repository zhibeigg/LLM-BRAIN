import { Router } from 'express'
import { getAllBrains, getBrainById, createBrain, updateBrain, deleteBrain } from '../db/brains.js'
import { initProjectGraph } from '../core/init/engine.js'

export const brainsRouter = Router()

// GET / - 获取当前用户的所有大脑
brainsRouter.get('/', (req, res) => {
  try {
    res.json(getAllBrains(req.userId))
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /:id - 获取单个大脑
brainsRouter.get('/:id', (req, res) => {
  try {
    const brain = getBrainById(req.params.id)
    if (!brain) {
      res.status(404).json({ error: '大脑不存在' })
      return
    }
    if (brain.userId !== req.userId) {
      res.status(403).json({ error: '无权访问该大脑' })
      return
    }
    res.json(brain)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST / - 创建大脑
brainsRouter.post('/', (req, res) => {
  try {
    const { name, description, projectPath, initProject } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: '名称不能为空' })
      return
    }
    const brain = createBrain(name.trim(), description?.trim() ?? '', req.userId ?? '', projectPath?.trim() ?? '')
    res.status(201).json(brain)

    // 异步初始化项目图谱（不阻塞响应）
    if (initProject && projectPath?.trim()) {
      initProjectGraph(brain.id, projectPath.trim()).catch(err => {
        console.error('项目初始化失败:', err)
      })
    }
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT /:id - 更新大脑
brainsRouter.put('/:id', (req, res) => {
  try {
    const existing = getBrainById(req.params.id)
    if (!existing) {
      res.status(404).json({ error: '大脑不存在' })
      return
    }
    if (existing.userId !== req.userId) {
      res.status(403).json({ error: '无权修改该大脑' })
      return
    }
    const brain = updateBrain(req.params.id, req.body)
    res.json(brain)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// DELETE /:id - 删除大脑
brainsRouter.delete('/:id', (req, res) => {
  try {
    const existing = getBrainById(req.params.id)
    if (!existing) {
      res.status(404).json({ error: '大脑不存在' })
      return
    }
    if (existing.userId !== req.userId) {
      res.status(403).json({ error: '无权删除该大脑' })
      return
    }
    deleteBrain(req.params.id)
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
