import type { ToolResult, ToolContext } from '../../types/index.js'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, normalize, dirname } from 'node:path'

const BACKUP_DIR = '.llm-brain-backup'

function resolveSecurePath(filePath: string, projectPath: string): { safe: boolean; resolved: string; error?: string } {
  const base = resolve(projectPath)
  const target = resolve(base, normalize(filePath))
  if (!target.startsWith(base)) {
    return { safe: false, resolved: '', error: '路径超出项目目录范围' }
  }
  return { safe: true, resolved: target }
}

/**
 * 文件编辑工具 — 精确字符串替换
 *
 * 安全措施：
 * 1. 路径遍历防护
 * 2. 编辑前自动备份
 * 3. old_string 必须在文件中存在且唯一（除非 replace_all）
 */
export async function executeFileEdit(
  args: { path: string; old_string: string; new_string: string; replace_all?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { path: filePath, old_string, new_string, replace_all } = args
    if (!filePath) return { success: false, output: '', error: '缺少 path 参数' }
    if (old_string === undefined || old_string === null) return { success: false, output: '', error: '缺少 old_string 参数' }
    if (new_string === undefined || new_string === null) return { success: false, output: '', error: '缺少 new_string 参数' }
    if (old_string === new_string) return { success: false, output: '', error: 'old_string 和 new_string 相同' }

    const projectPath = ctx.projectPath || process.cwd()
    const { safe, resolved, error } = resolveSecurePath(filePath, projectPath)
    if (!safe) return { success: false, output: '', error: error! }

    // 读取文件
    let content: string
    try {
      const fileStat = await stat(resolved)
      if (!fileStat.isFile()) return { success: false, output: '', error: `不是文件: ${filePath}` }
      content = await readFile(resolved, 'utf-8')
    } catch {
      return { success: false, output: '', error: `文件不存在: ${filePath}` }
    }

    // 检查 old_string 是否存在
    const occurrences = content.split(old_string).length - 1
    if (occurrences === 0) {
      return { success: false, output: '', error: `未找到匹配的文本` }
    }

    if (!replace_all && occurrences > 1) {
      return { success: false, output: '', error: `找到 ${occurrences} 处匹配，请提供更多上下文使其唯一，或设置 replace_all=true` }
    }

    // 备份
    const backupBase = resolve(projectPath, BACKUP_DIR)
    const backupPath = resolve(backupBase, filePath + '.' + Date.now())
    await mkdir(dirname(backupPath), { recursive: true })
    await writeFile(backupPath, content, 'utf-8')

    // 执行替换
    let newContent: string
    let replacedCount: number
    if (replace_all) {
      newContent = content.split(old_string).join(new_string)
      replacedCount = occurrences
    } else {
      // 只替换第一个
      const idx = content.indexOf(old_string)
      newContent = content.slice(0, idx) + new_string + content.slice(idx + old_string.length)
      replacedCount = 1
    }

    await writeFile(resolved, newContent, 'utf-8')

    // 生成简要 diff 信息
    const oldLines = old_string.split('\n')
    const newLines = new_string.split('\n')
    const diffSummary = `替换 ${replacedCount} 处: ${oldLines.length}L → ${newLines.length}L`

    return { success: true, output: `编辑文件: ${filePath}\n${diffSummary}` }
  } catch (err) {
    return { success: false, output: '', error: `编辑失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
