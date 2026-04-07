import { Router } from 'express'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const fsRouter = Router()

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

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    const dirs = entries
      .filter(e => {
        if (!e.isDirectory()) return false
        // 跳过隐藏目录和常见无用目录
        if (e.name.startsWith('.')) return false
        if (e.name === 'node_modules' || e.name === '__pycache__') return false
        return true
      })
      .map(e => ({ name: e.name, path: join(dirPath, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    res.json({ current: dirPath, dirs })
  } catch (err) {
    res.status(400).json({ error: `无法读取目录: ${err instanceof Error ? err.message : String(err)}` })
  }
})
