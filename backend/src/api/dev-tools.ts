import { Router } from 'express'
import { DEV_TOOLS, checkAllToolStatus, checkToolStatus, installTool } from '../tools/dev-tool-manager.js'

export const devToolsRouter = Router()

// GET /api/dev-tools — 获取所有可安装工具及其状态
devToolsRouter.get('/', async (_req, res) => {
  try {
    const statuses = await checkAllToolStatus()
    const tools = DEV_TOOLS.map(def => {
      const status = statuses.find(s => s.id === def.id)
      return { ...def, ...status }
    })
    res.json({ tools })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// POST /api/dev-tools/check — 检测指定工具状态
devToolsRouter.post('/check', async (req, res) => {
  try {
    const { toolId } = req.body
    if (!toolId) {
      res.status(400).json({ error: '缺少 toolId' })
      return
    }
    const toolDef = DEV_TOOLS.find(t => t.id === toolId)
    if (!toolDef) {
      res.status(404).json({ error: `未知工具: ${toolId}` })
      return
    }
    const status = await checkToolStatus(toolDef)
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// POST /api/dev-tools/install — 安装指定工具
devToolsRouter.post('/install', async (req, res) => {
  try {
    const { toolId } = req.body
    if (!toolId) {
      res.status(400).json({ error: '缺少 toolId' })
      return
    }
    const status = await installTool(toolId, req.userId)
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
