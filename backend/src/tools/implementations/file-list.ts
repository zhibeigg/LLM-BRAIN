import type { ToolResult, ToolContext } from '../../types/index.js'
import { resolve, normalize, relative } from 'node:path'
import { readdir, stat } from 'node:fs/promises'

const MAX_ENTRIES = 200
const DEFAULT_DEPTH = 3

/**
 * 目录列表工具 — 以 tree 风格展示目录结构
 */
export async function executeFileList(
  args: { path?: string; depth?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const projectPath = ctx.projectPath || process.cwd()
    let targetPath = projectPath
    if (args.path) {
      const base = resolve(projectPath)
      const target = resolve(base, normalize(args.path))
      if (!target.startsWith(base)) {
        return { success: false, output: '', error: '路径超出项目目录范围' }
      }
      targetPath = target
    }

    // 验证目标是目录
    try {
      const s = await stat(targetPath)
      if (!s.isDirectory()) {
        return { success: false, output: '', error: `不是目录: ${args.path || '.'}` }
      }
    } catch {
      return { success: false, output: '', error: `目录不存在: ${args.path || '.'}` }
    }

    const maxDepth = Math.min(args.depth ?? DEFAULT_DEPTH, 6)
    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.llm-brain-backup'])
    const lines: string[] = []
    let count = 0

    async function walk(dir: string, prefix: string, depth: number): Promise<void> {
      if (depth > maxDepth || count >= MAX_ENTRIES) return

      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch { return }

      // 排序：目录在前，文件在后
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

      for (let i = 0; i < entries.length && count < MAX_ENTRIES; i++) {
        const entry = entries[i]
        if (entry.name.startsWith('.') && entry.name !== '.env') continue

        const isLast = i === entries.length - 1
        const connector = isLast ? '└── ' : '├── '
        const childPrefix = isLast ? '    ' : '│   '

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) {
            lines.push(`${prefix}${connector}${entry.name}/  (skipped)`)
            count++
            continue
          }
          lines.push(`${prefix}${connector}${entry.name}/`)
          count++
          await walk(resolve(dir, entry.name), prefix + childPrefix, depth + 1)
        } else {
          lines.push(`${prefix}${connector}${entry.name}`)
          count++
        }
      }
    }

    const rootName = relative(projectPath, targetPath).replace(/\\/g, '/') || '.'
    lines.push(rootName + '/')
    await walk(targetPath, '', 1)

    if (count >= MAX_ENTRIES) {
      lines.push(`\n... (已截断，共显示 ${MAX_ENTRIES} 项)`)
    }

    return { success: true, output: lines.join('\n') }
  } catch (err) {
    return { success: false, output: '', error: `列表失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
