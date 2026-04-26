import type { ToolResult, ToolContext } from '../../types/index.js'
import { resolve, normalize, relative } from 'node:path'
import { readdir, stat } from 'node:fs/promises'

const MAX_RESULTS = 100

/**
 * 简单的 glob 匹配（支持 * 和 **）
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // 将 glob 模式转换为正则
  const regexStr = pattern
    .replace(/\\/g, '/')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\./g, '\\.')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
  try {
    return new RegExp(`^${regexStr}$`, 'i').test(filePath.replace(/\\/g, '/'))
  } catch {
    return false
  }
}

/**
 * 文件名模式搜索工具 — 按 glob 模式查找文件
 */
export async function executeFileGlob(
  args: { pattern: string; path?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { pattern } = args
    if (!pattern) return { success: false, output: '', error: '缺少 pattern 参数' }

    const projectPath = ctx.projectPath || process.cwd()
    let searchPath = projectPath
    if (args.path) {
      const base = resolve(projectPath)
      const target = resolve(base, normalize(args.path))
      if (!target.startsWith(base)) {
        return { success: false, output: '', error: '搜索路径超出项目目录范围' }
      }
      searchPath = target
    }

    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.llm-brain-backup'])
    const results: string[] = []

    async function walk(dir: string): Promise<void> {
      if (results.length >= MAX_RESULTS) return
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch { return }

      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) return
        const fullPath = resolve(dir, entry.name)
        const relPath = relative(searchPath, fullPath).replace(/\\/g, '/')

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            // 检查目录本身是否匹配
            if (matchGlob(relPath + '/', pattern)) {
              results.push(relPath + '/')
            }
            await walk(fullPath)
          }
        } else if (entry.isFile()) {
          if (matchGlob(relPath, pattern)) {
            results.push(relPath)
          }
        }
      }
    }

    await walk(searchPath)

    if (results.length === 0) {
      return { success: true, output: `未找到匹配: ${pattern}` }
    }

    results.sort()
    const header = `匹配 "${pattern}" — ${results.length} 个文件${results.length >= MAX_RESULTS ? ' (已截断)' : ''}\n`
    return { success: true, output: header + results.join('\n') }
  } catch (err) {
    return { success: false, output: '', error: `搜索失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
