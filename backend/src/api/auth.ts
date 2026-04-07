import { Router } from 'express'
import { findUserByUsername, findUserById, createUser, verifyPassword } from '../db/users.js'
import { signToken, verifyToken } from '../middleware/auth.js'

export const authRouter = Router()

// POST /auth/register
authRouter.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      res.status(400).json({ message: '用户名和密码不能为空' })
      return
    }
    if (typeof username !== 'string' || username.length < 2 || username.length > 32) {
      res.status(400).json({ message: '用户名长度需在 2-32 之间' })
      return
    }
    if (typeof password !== 'string' || password.length < 4) {
      res.status(400).json({ message: '密码长度至少 4 位' })
      return
    }

    const existing = findUserByUsername(username)
    if (existing) {
      res.status(409).json({ message: '用户名已存在' })
      return
    }

    const user = await createUser(username, password)
    const token = signToken({ userId: user.id, username: user.username })

    res.json({ token, user: { id: user.id, username: user.username } })
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : '注册失败' })
  }
})

// POST /auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      res.status(400).json({ message: '用户名和密码不能为空' })
      return
    }

    const userRow = findUserByUsername(username)
    if (!userRow) {
      res.status(401).json({ message: '用户名或密码错误' })
      return
    }

    const valid = await verifyPassword(userRow.password_hash, password)
    if (!valid) {
      res.status(401).json({ message: '用户名或密码错误' })
      return
    }

    const token = signToken({ userId: userRow.id, username: userRow.username })
    res.json({ token, user: { id: userRow.id, username: userRow.username } })
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : '登录失败' })
  }
})

// GET /auth/me
authRouter.get('/me', (req, res) => {
  // 这个路由需要 auth 中间件保护，但为了灵活性，这里手动检查
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: '未登录' })
    return
  }

  const payload = verifyToken(header.slice(7))
  if (!payload) {
    res.status(401).json({ message: 'token 无效' })
    return
  }

  const user = findUserById(payload.userId)
  if (!user) {
    res.status(404).json({ message: '用户不存在' })
    return
  }

  res.json({ user: { id: user.id, username: user.username } })
})
