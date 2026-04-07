import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import type { WSMessage, WSMessageType } from '../types/index.js'
import { verifyToken } from '../middleware/auth.js'

interface AuthenticatedClient {
  ws: WebSocket
  userId: string
}

const clients = new Set<AuthenticatedClient>()

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    // 从 URL query 参数提取 token
    const url = new URL(req.url ?? '', `http://${req.headers.host}`)
    const token = url.searchParams.get('token')

    let userId = ''
    if (token) {
      const payload = verifyToken(token)
      if (payload) {
        userId = payload.userId
      }
    }

    const client: AuthenticatedClient = { ws, userId }
    clients.add(client)
    console.log(`WebSocket client connected (userId: ${userId || 'anonymous'}, total: ${clients.size})`)

    ws.on('close', () => {
      clients.delete(client)
      console.log(`WebSocket client disconnected (total: ${clients.size})`)
    })

    ws.on('error', (err) => {
      console.error('WebSocket error:', err)
      clients.delete(client)
    })
  })
}

/** 向指定用户推送消息，如果 userId 为空则广播给所有人 */
export function broadcast(type: WSMessageType, payload: unknown, userId?: string): void {
  const message: WSMessage = {
    type,
    payload,
    timestamp: Date.now(),
  }
  const data = JSON.stringify(message)
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      // 如果指定了 userId，只推送给该用户；否则广播
      if (!userId || client.userId === userId || !client.userId) {
        client.ws.send(data)
      }
    }
  }
}
