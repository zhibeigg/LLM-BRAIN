import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import type { WSMessage, WSMessageType, ClientMessage, ClientMessageType } from '../types/index.js'
import { verifyToken } from '../middleware/auth.js'

interface AuthenticatedClient {
  ws: WebSocket
  userId: string
}

const clients = new Set<AuthenticatedClient>()

type ClientMessageHandler = (payload: unknown, userId: string) => void
const clientHandlers = new Map<string, Set<ClientMessageHandler>>()

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
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

    ws.on('message', (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString())
        if (msg.type) {
          const handlers = clientHandlers.get(msg.type)
          if (handlers) {
            handlers.forEach(h => h(msg.payload, userId))
          }
        }
      } catch {
        // 忽略非 JSON 消息
      }
    })

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
      if (!userId || client.userId === userId || !client.userId) {
        client.ws.send(data)
      }
    }
  }
}

/** 注册客户端消息处理器 */
export function onClientMessage(type: ClientMessageType, handler: ClientMessageHandler): () => void {
  if (!clientHandlers.has(type)) {
    clientHandlers.set(type, new Set())
  }
  clientHandlers.get(type)!.add(handler)
  return () => {
    clientHandlers.get(type)?.delete(handler)
  }
}
