import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import type { IncomingMessage } from 'http'
import type { WSMessage, WSMessageType, ClientMessage, ClientMessageType } from '../types/index.js'
import { verifyToken } from '../middleware/auth.js'

// ============== 配置常量 ==============

/** 心跳间隔：30秒 */
const HEARTBEAT_INTERVAL = 30 * 1000
/** 心跳超时：60秒（未收到pong则断开） */
const HEARTBEAT_TIMEOUT = 60 * 1000
/** 消息限流：每分钟最多100条 */
const RATE_LIMIT_MESSAGES = 100
const RATE_LIMIT_WINDOW = 60 * 1000
/** 最大连接数 */
const MAX_CONNECTIONS = 100
/** 最大消息大小：1MB */
const MAX_MESSAGE_SIZE = 1024 * 1024

// ============== 类型定义 ==============

interface AuthenticatedClient {
  ws: WebSocket
  userId: string
  /** 连接时间 */
  connectedAt: number
  /** 最后活跃时间 */
  lastActiveAt: number
  /** 消息计数（用于限流） */
  messageCount: number
  /** 限流窗口起始时间 */
  rateLimitWindowStart: number
  /** 心跳定时器 */
  heartbeatTimer: NodeJS.Timeout | null
  /** pong等待定时器 */
  pongTimer: NodeJS.Timeout | null
  /** IP地址 */
  ip: string
}

interface RateLimitInfo {
  count: number
  resetTime: number
  blocked: boolean
  blockedUntil: number
}

// ============== 全局状态 ==============

const clients = new Map<WebSocket, AuthenticatedClient>()

type ClientMessageHandler = (payload: unknown, userId: string) => void
const clientHandlers = new Map<string, Set<ClientMessageHandler>>()

// ============== 监控统计 ==============

interface WsStats {
  totalConnections: number
  currentConnections: number
  totalMessagesReceived: number
  totalMessagesSent: number
  totalRateLimited: number
  totalAuthFailed: number
  connectionsByUser: Map<string, number>
  ipConnections: Map<string, number>
}

const stats: WsStats = {
  totalConnections: 0,
  currentConnections: 0,
  totalMessagesReceived: 0,
  totalMessagesSent: 0,
  totalRateLimited: 0,
  totalAuthFailed: 0,
  connectionsByUser: new Map(),
  ipConnections: new Map(),
}

/** 获取WebSocket统计信息 */
export function getWsStats(): Readonly<WsStats> {
  return {
    ...stats,
    connectionsByUser: new Map(stats.connectionsByUser),
    ipConnections: new Map(stats.ipConnections),
  }
}

/** 重置统计信息 */
export function resetWsStats(): void {
  stats.totalMessagesReceived = 0
  stats.totalMessagesSent = 0
  stats.totalRateLimited = 0
  stats.totalAuthFailed = 0
}

// ============== 限流检查 ==============

/**
 * 检查客户端是否超过限流
 * @returns true 表示被限流，false 表示正常
 */
function checkRateLimit(client: AuthenticatedClient): boolean {
  const now = Date.now()
  
  // 检查是否被临时封禁
  if (client.messageCount >= RATE_LIMIT_MESSAGES) {
    if (now - client.rateLimitWindowStart < RATE_LIMIT_WINDOW) {
      // 还在窗口期内，封禁
      stats.totalRateLimited++
      sendError(client.ws, 'rate_limit', '消息发送过于频繁，请稍后再试')
      return true
    } else {
      // 窗口期已过，重置计数器
      client.messageCount = 0
      client.rateLimitWindowStart = now
    }
  }
  
  return false
}

/**
 * 记录消息发送
 */
function recordMessage(client: AuthenticatedClient): void {
  const now = Date.now()
  
  // 检查是否需要重置窗口
  if (now - client.rateLimitWindowStart >= RATE_LIMIT_WINDOW) {
    client.messageCount = 0
    client.rateLimitWindowStart = now
  }
  
  client.messageCount++
  stats.totalMessagesReceived++
  
  // 检查是否超限
  if (client.messageCount > RATE_LIMIT_MESSAGES) {
    stats.totalRateLimited++
    sendError(client.ws, 'rate_limit', '消息发送过于频繁，请稍后再试')
    return
  }
}

// ============== 心跳机制 ==============

function startHeartbeat(client: AuthenticatedClient): void {
  // 清除现有定时器
  stopHeartbeat(client)
  
  // 定期发送ping
  client.heartbeatTimer = setInterval(() => {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        // 发送ping帧（WebSocket协议层面的ping）
        client.ws.ping()
        
        // 设置pong超时
        client.pongTimer = setTimeout(() => {
          console.warn(`[WS] Heartbeat timeout for client ${client.userId || 'anonymous'} (${client.ip})`)
          client.ws.terminate()
        }, HEARTBEAT_TIMEOUT)
      } catch (err) {
        console.error('[WS] Failed to send ping:', err)
      }
    }
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat(client: AuthenticatedClient): void {
  if (client.heartbeatTimer) {
    clearInterval(client.heartbeatTimer)
    client.heartbeatTimer = null
  }
  if (client.pongTimer) {
    clearTimeout(client.pongTimer)
    client.pongTimer = null
  }
}

function handlePong(client: AuthenticatedClient): void {
  // 清除pong超时
  if (client.pongTimer) {
    clearTimeout(client.pongTimer)
    client.pongTimer = null
  }
  client.lastActiveAt = Date.now()
}

// ============== 连接管理 ==============

/**
 * 获取客户端IP地址
 */
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]
    return ips.trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

/**
 * 检查连接数限制
 */
function checkConnectionLimit(ip: string, userId: string): { allowed: boolean; reason?: string } {
  // 检查总连接数
  if (clients.size >= MAX_CONNECTIONS) {
    return { allowed: false, reason: '服务器连接数已满，请稍后再试' }
  }
  
  // 检查单IP连接数（最多10个）
  const ipCount = stats.ipConnections.get(ip) ?? 0
  if (ipCount >= 10) {
    return { allowed: false, reason: '该IP连接数过多，请稍后再试' }
  }
  
  // 检查单用户连接数（最多5个）
  if (userId) {
    const userCount = stats.connectionsByUser.get(userId) ?? 0
    if (userCount >= 5) {
      return { allowed: false, reason: '该账号连接数过多，请稍后再试' }
    }
  }
  
  return { allowed: true }
}

/**
 * 更新连接统计
 */
function updateConnectionStats(client: AuthenticatedClient, increment: boolean): void {
  const delta = increment ? 1 : -1
  
  if (client.userId) {
    const current = stats.connectionsByUser.get(client.userId) ?? 0
    const newVal = Math.max(0, current + delta)
    if (newVal === 0) {
      stats.connectionsByUser.delete(client.userId)
    } else {
      stats.connectionsByUser.set(client.userId, newVal)
    }
  }
  
  const ipCount = stats.ipConnections.get(client.ip) ?? 0
  const newIpVal = Math.max(0, ipCount + delta)
  if (newIpVal === 0) {
    stats.ipConnections.delete(client.ip)
  } else {
    stats.ipConnections.set(client.ip, newIpVal)
  }
  
  if (increment) {
    stats.totalConnections++
    stats.currentConnections = clients.size
  } else {
    stats.currentConnections = clients.size
  }
}

/**
 * 移除客户端
 */
function removeClient(ws: WebSocket): void {
  const client = clients.get(ws)
  if (!client) return
  
  stopHeartbeat(client)
  updateConnectionStats(client, false)
  clients.delete(ws)
  
  console.log(`[WS] Client disconnected (userId: ${client.userId || 'anonymous'}, ip: ${client.ip}, total: ${clients.size})`)
}

// ============== 错误消息发送 ==============

function sendError(ws: WebSocket, type: string, message: string): void {
  if (ws.readyState !== WebSocket.OPEN) return
  
  const errorMsg: WSMessage = {
    type: 'error',
    payload: { code: type, message },
    timestamp: Date.now(),
  }
  
  try {
    ws.send(JSON.stringify(errorMsg))
    stats.totalMessagesSent++
  } catch (err) {
    console.error('[WS] Failed to send error message:', err)
  }
}

// ============== 认证 ==============

interface AuthResult {
  success: boolean
  userId: string
  error?: string
}

function authenticate(req: IncomingMessage): AuthResult {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`)
  const token = url.searchParams.get('token')
  
  if (!token) {
    return { success: false, userId: '', error: '缺少认证令牌' }
  }
  
  const payload = verifyToken(token)
  if (!payload) {
    stats.totalAuthFailed++
    return { success: false, userId: '', error: '无效的认证令牌' }
  }
  
  return { success: true, userId: payload.userId }
}

// ============== 消息验证 ==============

/**
 * 验证消息大小
 */
function validateMessageSize(data: Buffer): { valid: boolean; error?: string } {
  if (data.length > MAX_MESSAGE_SIZE) {
    return {
      valid: false,
      error: `消息大小超过限制（最大${MAX_MESSAGE_SIZE / 1024 / 1024}MB）`,
    }
  }
  return { valid: true }
}

/**
 * 解析并验证消息
 */
function parseMessage(data: Buffer): { valid: boolean; msg?: ClientMessage; error?: string } {
  // 大小检查
  const sizeCheck = validateMessageSize(data)
  if (!sizeCheck.valid) {
    return { valid: false, error: sizeCheck.error }
  }
  
  // 解析JSON
  let msg: ClientMessage
  try {
    msg = JSON.parse(data.toString())
  } catch {
    return { valid: false, error: '无效的JSON格式' }
  }
  
  // 验证消息结构
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: '消息必须是对象' }
  }
  
  if (typeof msg.type !== 'string') {
    return { valid: false, error: '缺少消息类型' }
  }
  
  if (msg.payload === undefined) {
    return { valid: false, error: '缺少消息载荷' }
  }
  
  return { valid: true, msg }
}

// ============== 初始化WebSocket服务器 ==============

export function initWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' })
  
  console.log(`[WS] WebSocket server initializing (maxConnections: ${MAX_CONNECTIONS}, rateLimit: ${RATE_LIMIT_MESSAGES}/${RATE_LIMIT_WINDOW / 1000}s, maxMessageSize: ${MAX_MESSAGE_SIZE / 1024 / 1024}MB)`)
  
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = getClientIp(req)
    
    // 认证
    const authResult = authenticate(req)
    if (!authResult.success) {
      console.warn(`[WS] Auth failed from ${ip}: ${authResult.error}`)
      sendError(ws, 'auth_failed', authResult.error ?? '认证失败')
      ws.close(1008, 'Authentication failed')
      return
    }
    
    const userId = authResult.userId
    
    // 检查连接限制
    const limitCheck = checkConnectionLimit(ip, userId)
    if (!limitCheck.allowed) {
      console.warn(`[WS] Connection limit exceeded for ${ip} (userId: ${userId})`)
      sendError(ws, 'connection_limit', limitCheck.reason ?? '连接数超限')
      ws.close(1010, 'Connection limit exceeded')
      return
    }
    
    // 创建客户端对象
    const now = Date.now()
    const client: AuthenticatedClient = {
      ws,
      userId,
      connectedAt: now,
      lastActiveAt: now,
      messageCount: 0,
      rateLimitWindowStart: now,
      heartbeatTimer: null,
      pongTimer: null,
      ip,
    }
    
    // 添加到连接池
    clients.set(ws, client)
    updateConnectionStats(client, true)
    
    console.log(`[WS] Client connected (userId: ${userId}, ip: ${ip}, total: ${clients.size})`)
    
    // 启动心跳
    startHeartbeat(client)
    
    // 处理消息
    ws.on('message', (raw: Buffer | string) => {
      // 确保是Buffer
      const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
      
      // 更新活跃时间
      client.lastActiveAt = Date.now()
      
      // 限流检查
      if (checkRateLimit(client)) {
        return
      }
      
      // 记录消息
      recordMessage(client)
      
      // 验证并解析消息
      const parseResult = parseMessage(data)
      if (!parseResult.valid) {
        sendError(ws, 'invalid_message', parseResult.error ?? '无效的消息格式')
        return
      }
      
      const msg = parseResult.msg!
      
      // 处理消息
      if (msg.type) {
        const handlers = clientHandlers.get(msg.type)
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(msg.payload, userId)
            } catch (err) {
              console.error(`[WS] Handler error for type ${msg.type}:`, err)
            }
          })
        }
      }
    })
    
    // 处理pong响应
    ws.on('pong', () => {
      handlePong(client)
    })
    
    // 处理关闭
    ws.on('close', () => {
      removeClient(ws)
    })
    
    // 处理错误
    ws.on('error', (err) => {
      console.error(`[WS] Error for client ${userId || 'anonymous'} (${ip}):`, err.message)
      removeClient(ws)
    })
    
    // 处理超时（针对不响应ping的连接）
    ws.on('timeout', () => {
      console.warn(`[WS] Connection timeout for client ${userId || 'anonymous'} (${ip})`)
      removeClient(ws)
    })
  })
  
  // 服务器错误处理
  wss.on('error', (err) => {
    console.error('[WS] Server error:', err)
  })
  
  // 定期清理无效连接
  setInterval(() => {
    const now = Date.now()
    for (const [ws, client] of clients) {
      // 清理长时间不活跃的连接（超过5分钟无响应）
      if (now - client.lastActiveAt > 5 * 60 * 1000) {
        console.warn(`[WS] Removing inactive client (userId: ${client.userId}, lastActive: ${Math.floor((now - client.lastActiveAt) / 1000)}s ago)`)
        stopHeartbeat(client)
        ws.terminate()
        clients.delete(ws)
        updateConnectionStats(client, false)
      }
    }
  }, 60 * 1000) // 每分钟检查一次
  
  console.log('[WS] WebSocket server initialized successfully')
  return wss
}

/** 向指定用户推送消息，如果 userId 为空则广播给所有已认证用户 */
export function broadcast(type: WSMessageType, payload: unknown, userId?: string): void {
  const message: WSMessage = {
    type,
    payload,
    timestamp: Date.now(),
  }
  const data = JSON.stringify(message)
  
  let sentCount = 0
  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      // 如果指定了 userId，只发送给该用户；否则发送给所有已认证用户
      if (userId ? client.userId === userId : !!client.userId) {
        try {
          client.ws.send(data)
          stats.totalMessagesSent++
          sentCount++
        } catch (err) {
          console.error(`[WS] Failed to send to client ${client.userId}:`, err)
        }
      }
    }
  }
  
  if (sentCount > 0) {
    console.debug(`[WS] Broadcast "${type}" to ${sentCount} clients`)
  }
}

/** 向指定用户推送消息（精确匹配） */
export function sendToUser(userId: string, type: WSMessageType, payload: unknown): number {
  const message: WSMessage = {
    type,
    payload,
    timestamp: Date.now(),
  }
  const data = JSON.stringify(message)
  
  let sentCount = 0
  for (const [, client] of clients) {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(data)
        stats.totalMessagesSent++
        sentCount++
      } catch (err) {
        console.error(`[WS] Failed to send to user ${userId}:`, err)
      }
    }
  }
  
  return sentCount
}

/** 关闭所有连接并清理 */
export function closeAllConnections(): void {
  console.log(`[WS] Closing all ${clients.size} connections...`)
  
  for (const [, client] of clients) {
    stopHeartbeat(client)
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close(1001, 'Server shutting down')
    }
  }
  
  clients.clear()
  stats.currentConnections = 0
  stats.connectionsByUser.clear()
  stats.ipConnections.clear()
  
  console.log('[WS] All connections closed')
}

/** 获取当前连接数 */
export function getConnectionCount(): number {
  return clients.size
}

/** 根据用户ID获取连接数 */
export function getConnectionCountByUser(userId: string): number {
  return stats.connectionsByUser.get(userId) ?? 0
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
