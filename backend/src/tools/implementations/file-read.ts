import type { ToolResult, ToolContext } from '../../types/index.js'
import { readFile, stat } from 'node:fs/promises'
import { resolve, relative, normalize } from 'node:path'

const MAX_FILE_SIZE = 1024 * 1024 // 1MB

/**
 * 安全解析文件路径，防止路径遍历
 */
function resolveSecurePath(filePath: string, projectPath: string): { safe: boolean; resolved: string; error?: string } {
  const base = resolve(projectPath)
  const target = resolve(base, normalize(filePath))
  const rel = relative(base, target)
  
  if (rel.startsWith('..') || resolve(target) !== target && rel.startsWith('..')) {
    return { safe: false, resolved: '', error: '路径超出项目目录范围' }
  }
  
  // Double check: resolved path must start with base
  if (!target.startsWith(base)) {
    return { safe: false, resolved: '', error: '路径超出项目目录范围' }
  }
  
  return { safe: true, resolved: target }
}

/**
 * 文件读取工具 — 读取项目文件内容
 * 
 * 安全措施：
 * 1. 路径遍历防护（限制在 projectPath 内）
 * 2. 文件大小限制（1MB）
 * 3. 行范围支持
 */
export async function executeFileRead(
  args: { path: string; startLine?: number; endLine?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { path: filePath } = args
    if (!filePath) {
      return { success: false, output: '', error: '缺少 path 参数' }
    }

    const projectPath = ctx.projectPath || process.cwd()
    const { safe, resolved, error } = resolveSecurePath(filePath, projectPath)
    if (!safe) {
      return { success: false, output: '', error: error! }
    }

    // 检查文件大小
    let fileStat
    try {
      fileStat = await stat(resolved)
    } catch {
      return { success: false, output: '', error: `文件不存在: ${filePath}` }
    }

    if (!fileStat.isFile()) {
      return { success: false, output: '', error: `不是文件: ${filePath}` }
    }

    if (fileStat.size > MAX_FILE_SIZE) {
      return { success: false, output: '', error: `文件过大 (${(fileStat.size / 1024 / 1024).toFixed(1)}MB)，最大允许 1MB` }
    }

    // 读取文件
    const content = await readFile(resolved, 'utf-8')
    const lines = content.split('\n')
    const totalLines = lines.length

    // 行范围处理
    const start = Math.max(1, args.startLine ?? 1)
    const end = Math.min(totalLines, args.endLine ?? totalLines)

    if (start > totalLines) {
      return { success: false, output: '', error: `起始行 ${start} 超出文件总行数 ${totalLines}` }
    }

    const selectedLines = lines.slice(start - 1, end)
    const lineNumWidth = String(end).length
    const numbered = selectedLines.map((line, i) => {
      const num = String(start + i).padStart(lineNumWidth, ' ')
      return `${num} | ${line}`
    }).join('\n')

    const header = start === 1 && end === totalLines
      ? `${filePath} (${totalLines}L)`
      : `${filePath} (${start}-${end} of ${totalLines}L)`

    return { success: true, output: `${header}\n${numbered}` }
  } catch (err) {
    return { success: false, output: '', error: `读取失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
