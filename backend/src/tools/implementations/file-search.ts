import type { ToolResult, ToolContext } from '../../types/index.js'
import { execFile } from 'node:child_process'
import { resolve, normalize, relative } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'

const MAX_RESULTS = 50
const MAX_OUTPUT_SIZE = 32000 // 字符

/** 检测 ripgrep 是否可用 */
async function findRipgrep(): Promise<string | null> {
  // 优先检查 @vscode/ripgrep npm 包
  try {
    const rgPath = resolve(process.cwd(), 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg')
    await new Promise<void>((res, rej) => {
      execFile(rgPath, ['--version'], { timeout: 3000 }, (err) => err ? rej(err) : res())
    })
    return rgPath
  } catch { /* not installed via npm */ }

  // 检查系统 PATH
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  return new Promise((res) => {
    execFile(cmd, ['rg'], { timeout: 3000 }, (err, stdout) => {
      if (err) return res(null)
      const path = stdout.trim().split('\n')[0]?.trim()
      res(path || null)
    })
  })
}

/** 使用 ripgrep 搜索 */
async function searchWithRipgrep(
  rgPath: string,
  pattern: string,
  searchPath: string,
  glob: string | undefined,
  maxResults: number,
): Promise<string> {
  return new Promise((res, rej) => {
    const args = [
      '--line-number',
      '--no-heading',
      '--color', 'never',
      '--max-count', String(maxResults),
      '--max-filesize', '1M',
    ]
    if (glob) {
      args.push('--glob', glob)
    }
    // 忽略常见的非代码目录
    args.push('--glob', '!node_modules', '--glob', '!.git', '--glob', '!dist', '--glob', '!build')
    args.push('--', pattern, searchPath)

    execFile(rgPath, args, { timeout: 30000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      // ripgrep 返回 1 表示无匹配，不是错误
      if (err && (err as NodeJS.ErrnoException).code !== null && !stdout) {
        // 真正的错误
        if (stderr?.includes('regex parse error')) {
          return rej(new Error(`正则表达式语法错误: ${pattern}`))
        }
        // exit code 1 = no matches
        return res('')
      }
      res(stdout || '')
    })
  })
}

/** Node.js 内置搜索（fallback） */
async function searchWithNode(
  pattern: string,
  searchPath: string,
  glob: string | undefined,
  maxResults: number,
): Promise<string> {
  const results: string[] = []
  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'gi')
  } catch {
    // 如果不是有效正则，当作字面量搜索
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  }

  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.llm-brain-backup'])
  const TEXT_EXTS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.css', '.scss',
    '.html', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.env',
    '.sh', '.bash', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.cpp', '.h',
    '.vue', '.svelte', '.astro',
  ])

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch { return }

    for (const entry of entries) {
      if (results.length >= maxResults) return
      if (entry.name.startsWith('.') && entry.name !== '.env') continue

      const fullPath = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(fullPath)
      } else if (entry.isFile()) {
        const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop()! : ''
        if (!TEXT_EXTS.has(ext.toLowerCase())) continue

        try {
          const fileStat = await stat(fullPath)
          if (fileStat.size > 1024 * 1024) continue // skip >1MB

          const content = await readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          const relPath = relative(searchPath, fullPath).replace(/\\/g, '/')

          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (regex.test(lines[i])) {
              results.push(`${relPath}:${i + 1}:${lines[i].trimEnd()}`)
              regex.lastIndex = 0
            }
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  await walk(searchPath)
  return results.join('\n')
}

/**
 * 代码搜索工具 — 使用 ripgrep（如可用）或 Node.js 内置搜索
 */
export async function executeFileSearch(
  args: { pattern: string; path?: string; glob?: string; max_results?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { pattern, glob } = args
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

    const maxResults = Math.min(args.max_results ?? 30, MAX_RESULTS)

    // 尝试使用 ripgrep
    const rgPath = await findRipgrep()
    let output: string

    if (rgPath) {
      output = await searchWithRipgrep(rgPath, pattern, searchPath, glob, maxResults)
    } else {
      output = await searchWithNode(pattern, searchPath, glob, maxResults)
    }

    if (!output.trim()) {
      return { success: true, output: `未找到匹配: ${pattern}` }
    }

    // 截断过长输出
    if (output.length > MAX_OUTPUT_SIZE) {
      output = output.slice(0, MAX_OUTPUT_SIZE) + '\n... (结果已截断)'
    }

    const matchCount = output.split('\n').filter(l => l.trim()).length
    const engine = rgPath ? 'ripgrep' : 'node'
    const header = `搜索 "${pattern}" — ${matchCount} 个匹配 (${engine})\n`

    return { success: true, output: header + output }
  } catch (err) {
    return { success: false, output: '', error: `搜索失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
