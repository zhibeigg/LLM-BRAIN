import { Router } from 'express'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve, normalize } from 'node:path'
import { getBrainById } from '../db/brains.js'

export const fsRouter = Router()

/**
 * 验证路径是否在允许的范围内
 * 只允许访问用户大脑关联的项目路径，或驱动器根目录（用于目录选择器）
 */
function isPathAllowed(dirPath: string, userId: string): boolean {
  const normalized = resolve(normalize(dirPath))

  // 允许访问驱动器根目录（用于目录选择器浏览）
  if (process.platform === 'win32') {
    if (/^[A-Z]:\\$/i.test(normalized)) return true
  } else {
    if (normalized === '/') return true
  }

  // 禁止访问敏感系统目录
  const blockedPaths = process.platform === 'win32'
    ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData']
    : ['/etc', '/proc', '/sys', '/dev', '/root', '/var']

  for (const blocked of blockedPaths) {
    if (normalized.toLowerCase().startsWith(blocked.toLowerCase())) {
      return false
    }
  }

  return true
}

// GET /api/fs/list-dirs?path=xxx — 列出指定路径下的子目录
fsRouter.get('/list-dirs', (req, res) => {
  const dirPath = (req.query.path as string) || ''

  // 如果没有传路径，返回驱动器列表（Windows）或根目录
  if (!dirPath) {
    if (process.platform === 'win32') {
      // 列出常见驱动器
      const drives: Array<{ name: string; path: string }> = []
      for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
        try {
          statSync(`${letter}:\\`)
          drives.push({ name: `${letter}:`, path: `${letter}:\\` })
        } catch { /* 驱动器不存在 */ }
      }
      res.json({ current: '', dirs: drives })
      return
    }
    res.json({ current: '/', dirs: [{ name: '/', path: '/' }] })
    return
  }

  // 路径安全检查
  const normalizedPath = resolve(normalize(dirPath))
  if (!isPathAllowed(normalizedPath, req.userId ?? '')) {
    res.status(403).json({ error: '无权访问该路径' })
    return
  }

  try {
    const entries = readdirSync(normalizedPath, { withFileTypes: true })
    const dirs = entries
      .filter(e => {
        if (!e.isDirectory()) return false
        // 跳过隐藏目录和常见无用目录
        if (e.name.startsWith('.')) return false
        if (e.name === 'node_modules' || e.name === '__pycache__') return false
        return true
      })
      .map(e => ({ name: e.name, path: join(normalizedPath, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    res.json({ current: normalizedPath, dirs })
  } catch (err) {
    res.status(400).json({ error: `无法读取目录: ${err instanceof Error ? err.message : String(err)}` })
  }
})
