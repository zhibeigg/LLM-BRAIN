import type { ToolResult, ToolContext } from '../../types/index.js'
import { writeFile, mkdir, stat, readFile } from 'node:fs/promises'
import { resolve, relative, normalize, dirname } from 'node:path'

const MAX_WRITE_SIZE = 512 * 1024 // 500KB
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
 * 文件写入工具 — 创建或覆盖项目文件
 *
 * 安全措施：
 * 1. 路径遍历防护
 * 2. 写入大小限制（500KB）
 * 3. 覆盖前自动备份
 */
export async function executeFileWrite(
  args: { path: string; content: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { path: filePath, content } = args
    if (!filePath) return { success: false, output: '', error: '缺少 path 参数' }
    if (content === undefined || content === null) return { success: false, output: '', error: '缺少 content 参数' }

    if (content.length > MAX_WRITE_SIZE) {
      return { success: false, output: '', error: `内容过大 (${(content.length / 1024).toFixed(1)}KB)，最大允许 500KB` }
    }

    const projectPath = ctx.projectPath || process.cwd()
    const { safe, resolved, error } = resolveSecurePath(filePath, projectPath)
    if (!safe) return { success: false, output: '', error: error! }

    // 检查是否已存在（用于备份和报告）
    let isNew = true
    try {
      const existing = await stat(resolved)
      if (existing.isFile()) {
        isNew = false
        // 备份现有文件
        const backupBase = resolve(projectPath, BACKUP_DIR)
        const backupPath = resolve(backupBase, filePath + '.' + Date.now())
        await mkdir(dirname(backupPath), { recursive: true })
        const oldContent = await readFile(resolved, 'utf-8')
        await writeFile(backupPath, oldContent, 'utf-8')
      }
    } catch {
      // 文件不存在，正常创建
    }

    // 确保目录存在
    await mkdir(dirname(resolved), { recursive: true })

    // 写入文件
    await writeFile(resolved, content, 'utf-8')

    const lines = content.split('\n').length
    const action = isNew ? '创建' : '覆盖'
    return { success: true, output: `${action}文件: ${filePath} (${lines}L, ${content.length}B)` }
  } catch (err) {
    return { success: false, output: '', error: `写入失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
