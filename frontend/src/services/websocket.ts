import type { WSMessage } from '../types'
import { getToken } from '../stores/authStore'

type WSHandler = (message: WSMessage) => void

const MAX_RECONNECT_DELAY = 30000
const BASE_RECONNECT_DELAY = 3000

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<WSHandler>> = new Map()
  private reconnectTimer: number | null = null
  private reconnectDelay = BASE_RECONNECT_DELAY

  connect() {
    // 防止重复连接
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    // 先清理旧连接
    this.cleanup()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
    const url = `${protocol}//${window.location.host}/ws${tokenParam}`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.reconnectDelay = BASE_RECONNECT_DELAY
    }

    ws.onmessage = (event) => {
      let message: WSMessage
      try {
        message = JSON.parse(event.data)
      } catch {
        console.warn('WebSocket 收到非 JSON 消息:', event.data)
        return
      }

      const typeHandlers = this.handlers.get(message.type)
      if (typeHandlers) {
        typeHandlers.forEach(handler => handler(message))
      }
      const allHandlers = this.handlers.get('*')
      if (allHandlers) {
        allHandlers.forEach(handler => handler(message))
      }
    }

    ws.onclose = () => {
      // 只有当前活跃连接断开时才重连，旧连接关闭忽略
      if (this.ws !== ws) return
      this.ws = null
      this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  on(type: string, handler: WSHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  disconnect() {
    this.cleanup()
  }

  /** 向服务端发送消息 */
  send(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const old = this.ws
    this.ws = null
    old?.close()
  }
}

export const wsClient = new WebSocketClient()
