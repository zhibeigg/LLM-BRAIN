import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

// 默认密钥（不安全，不应使用）
const DEFAULT_SECRET = 'llm-brain-secret-key-change-in-production'

// 最小密钥长度
const MIN_SECRET_LENGTH = 32

// 密钥强度正则（必须包含字母和数字）
const SECRET_STRENGTH_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/

/**
 * 生成随机密钥
 * @returns 随机生成的密钥
 */
export function generateSecretKey(): string {
  return crypto.randomBytes(32).toString('base64')
}

/**
 * 验证密钥格式
 * @param secret 密钥
 * @returns 是否有效
 */
function isValidSecretFormat(secret: string): boolean {
  return secret.length >= MIN_SECRET_LENGTH && SECRET_STRENGTH_PATTERN.test(secret)
}

/**
 * 检查是否为默认密钥
 * @param secret 密钥
 * @returns 是否为默认密钥
 */
function isDefaultSecret(secret: string): boolean {
  return secret === DEFAULT_SECRET
}

// 获取并验证 JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET

// 启动时强制检查
function validateJwtSecret(): void {
  if (!JWT_SECRET) {
    console.error('\x1b[31m[严重错误]\x1b[0m JWT_SECRET 环境变量未设置！')
    console.error('\x1b[31m[严重错误]\x1b[0m 系统拒绝启动以保护安全。')
    console.error('')
    console.error('\x1b[33m[解决方案]\x1b[0m 请执行以下命令生成密钥：')
    console.error(`\x1b[36m  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\x1b[0m`)
    console.error('')
    console.error('\x1b[33m[解决方案]\x1b[0m 然后设置环境变量：')
    console.error('\x1b[36m  export JWT_SECRET=你的密钥\x1b[0m (Linux/Mac)')
    console.error('\x1b[36m  set JWT_SECRET=你的密钥\x1b[0m (Windows CMD)')
    console.error('\x1b[36m  $env:JWT_SECRET="你的密钥"\x1b[0m (Windows PowerShell)')
    console.error('')
    console.error('\x1b[31m[严重错误]\x1b[0m 进程即将退出...')
    process.exit(1)
  }

  if (isDefaultSecret(JWT_SECRET)) {
    console.error('\x1b[31m[严重错误]\x1b[0m 检测到使用默认密钥！')
    console.error('\x1b[31m[严重错误]\x1b[0m 系统拒绝启动以保护安全。')
    console.error('')
    console.error('\x1b[33m[解决方案]\x1b[0m 请执行以下命令生成安全密钥：')
    console.error(`\x1b[36m  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\x1b[0m`)
    console.error('')
    console.error('\x1b[33m[解决方案]\x1b[0m 然后设置环境变量：')
    console.error('\x1b[36m  export JWT_SECRET=你的密钥\x1b[0m (Linux/Mac)')
    console.error('\x1b[36m  set JWT_SECRET=你的密钥\x1b[0m (Windows CMD)')
    console.error('\x1b[36m  $env:JWT_SECRET="你的密钥"\x1b[0m (Windows PowerShell)')
    console.error('')
    console.error('\x1b[31m[严重错误]\x1b[0m 进程即将退出...')
    process.exit(1)
  }

  if (!isValidSecretFormat(JWT_SECRET)) {
    console.warn('\x1b[33m[警告]\x1b[0m JWT_SECRET 强度不足！')
    console.warn(`\x1b[33m[警告]\x1b[0m 密钥长度: ${JWT_SECRET.length} 字符 (最少 ${MIN_SECRET_LENGTH} 字符)`)
    console.warn('\x1b[33m[警告]\x1b[0m 密钥必须同时包含字母和数字。')
    console.warn('')
    console.warn('\x1b[33m[建议]\x1b[0m 请执行以下命令生成安全密钥：')
    console.warn(`\x1b[36m  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\x1b[0m`)
    console.warn('')
    // 强度不足只警告，不阻止启动
  }

  // 密钥验证通过
  console.log('\x1b[32m[信息]\x1b[0m JWT_SECRET 验证通过')
}

// 执行验证
validateJwtSecret()

export interface JwtPayload {
  userId: string
  username: string
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: string
      username?: string
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as JwtPayload
  } catch {
    return null
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: '未登录' })
    return
  }

  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ message: 'token 无效或已过期' })
    return
  }

  req.userId = payload.userId
  req.username = payload.username
  next()
}

// 密钥轮换机制（可选功能）
// 用于在不停机的情况下更新密钥
const keyRotationCache = new Map<string, number>()

/**
 * 验证密钥是否在允许的密钥列表中（用于密钥轮换）
 * @param token JWT token
 * @param allowedSecrets 允许的密钥列表
 * @returns 解析后的 payload 或 null
 */
export function verifyTokenWithRotation(token: string, allowedSecrets: string[]): JwtPayload | null {
  for (const secret of allowedSecrets) {
    try {
      const payload = jwt.verify(token, secret) as JwtPayload
      if (payload) {
        return payload
      }
    } catch {
      // 当前密钥验证失败，尝试下一个
      continue
    }
  }
  return null
}

/**
 * 验证密钥是否有效（用于密钥轮换前的旧密钥缓存）
 * @param token JWT token
 * @returns 解析后的 payload 或 null
 */
export function verifyTokenLegacy(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, DEFAULT_SECRET) as JwtPayload
  } catch {
    return null
  }
}
