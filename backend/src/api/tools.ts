import { Router } from 'express'
import { getAllTools, getShare } from '../tools/index.js'
import { createReadStream, existsSync } from 'node:fs'

export const toolsRouter = Router()

// GET /api/tools - 获取所有可用工具定义
toolsRouter.get('/', (_req, res) => {
  const tools = getAllTools()
  res.json(tools)
})

// GET /api/tools/share/:id - 下载分享文件
toolsRouter.get('/share/:id', (req, res) => {
  const share = getShare(req.params.id)
  if (!share) {
    res.status(404).json({ error: '分享不存在或已过期' })
    return
  }
  if (!existsSync(share.filePath)) {
    res.status(404).json({ error: '文件不存在' })
    return
  }
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.fileName)}"`)
  createReadStream(share.filePath).pipe(res)
})
