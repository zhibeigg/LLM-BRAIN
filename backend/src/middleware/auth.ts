import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'llm-brain-secret-key-change-in-production'

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
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
