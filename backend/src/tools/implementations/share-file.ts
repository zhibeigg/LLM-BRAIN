import type { ToolResult, ToolContext } from '../../types/index.js'
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

const SHARE_DIR = join(process.cwd(), '.shares')
// 内存中维护分享记录（简单实现，重启后失效）
const shares = new Map<string, { filePath: string; fileName: string; createdAt: number; expiresAt: number }>()

/**
 * 文件分享工具 — 生成临时下载链接
 */
export async function executeShareFile(
  args: { path: string; content?: string; fileName?: string; expiresInMinutes?: number },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    if (!existsSync(SHARE_DIR)) mkdirSync(SHARE_DIR, { recursive: true })

    const expiresIn = Math.min(args.expiresInMinutes ?? 60, 1440) // 最长 24 小时
    const id = randomUUID().slice(0, 8)

    let filePath: string
    let fileName: string

    if (args.content) {
      // 从内容创建文件
      fileName = args.fileName ?? `share-${id}.txt`
      filePath = join(SHARE_DIR, `${id}-${fileName}`)
      writeFileSync(filePath, args.content, 'utf-8')
    } else if (args.path) {
      // 引用已有文件
      if (!existsSync(args.path)) {
        return { success: false, output: '', error: `文件不存在: ${args.path}` }
      }
      const stat = statSync(args.path)
      if (stat.size > 50 * 1024 * 1024) {
        return { success: false, output: '', error: '文件超过 50MB 限制' }
      }
      filePath = args.path
      fileName = basename(args.path)
    } else {
      return { success: false, output: '', error: '需要提供 path 或 content' }
    }

    const now = Date.now()
    shares.set(id, {
      filePath,
      fileName,
      createdAt: now,
      expiresAt: now + expiresIn * 60 * 1000,
    })

    return {
      success: true,
      output: `文件已分享:\n- ID: ${id}\n- 文件名: ${fileName}\n- 有效期: ${expiresIn} 分钟\n- 下载路径: /api/tools/share/${id}`,
    }
  } catch (err) {
    return { success: false, output: '', error: `分享失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** 获取分享记录（供 API 路由使用） */
export function getShare(id: string) {
  const share = shares.get(id)
  if (!share) return null
  if (Date.now() > share.expiresAt) {
    shares.delete(id)
    return null
  }
  return share
}
