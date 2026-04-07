import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { closeDb } from './db/database.js'
import { initBuiltinDimensions } from './db/personality.js'
import { initDefaultMappings } from './db/difficulty-mapping.js'
import { apiRouter } from './api/index.js'
import { authRouter } from './api/auth.js'
import { authMiddleware } from './middleware/auth.js'
import { initWebSocket } from './ws/server.js'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3715

app.use(cors())
app.use(express.json({ limit: '2mb' }))

// 强制所有 JSON 响应使用 utf-8 编码，防止中文乱码
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res)
  res.json = (body: unknown) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    return originalJson(body)
  }
  next()
})

// 初始化
initBuiltinDimensions()
initDefaultMappings()

// 健康检查（无需认证）
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// 认证路由（无需认证）
app.use('/api/auth', authRouter)

// 需要认证的 API 路由
app.use('/api', authMiddleware, apiRouter)

// 创建 HTTP server 并初始化 WebSocket
const server = createServer(app)
initWebSocket(server)

server.listen(PORT, () => {
  console.log(`LLM-BRAIN backend running on http://localhost:${PORT}`)
})

process.on('SIGINT', () => {
  closeDb()
  server.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  closeDb()
  server.close()
  process.exit(0)
})
