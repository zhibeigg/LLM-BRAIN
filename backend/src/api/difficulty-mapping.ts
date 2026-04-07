import { Router } from 'express'
import type { DifficultyType } from '../types/index.js'
import {
  getMappings,
  getMappingsByType,
  setMapping,
  deleteMapping,
} from '../db/difficulty-mapping.js'

export const difficultyMappingRouter = Router()

// GET / - 获取所有映射
difficultyMappingRouter.get('/', (_req, res) => {
  try {
    res.json(getMappings())
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /:type - 获取某难度类型的映射
difficultyMappingRouter.get('/:type', (req, res) => {
  try {
    const mappings = getMappingsByType(req.params.type as DifficultyType)
    res.json(mappings)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT / - 设置映射（upsert）
difficultyMappingRouter.put('/', (req, res) => {
  try {
    const { difficultyType, dimensionId, direction, weight } = req.body
    if (!difficultyType || !dimensionId) {
      res.status(400).json({ error: 'difficultyType and dimensionId are required' })
      return
    }
    setMapping({
      difficultyType,
      dimensionId,
      direction: direction ?? -1,
      weight: weight ?? 1.0,
    })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// DELETE / - 删除映射
difficultyMappingRouter.delete('/', (req, res) => {
  try {
    const { difficultyType, dimensionId } = req.body
    if (!difficultyType || !dimensionId) {
      res.status(400).json({ error: 'difficultyType and dimensionId are required' })
      return
    }
    const deleted = deleteMapping(difficultyType as DifficultyType, dimensionId)
    if (!deleted) {
      res.status(404).json({ error: 'Mapping not found' })
      return
    }
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})
