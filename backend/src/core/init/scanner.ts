import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

/** 扫描结果 */
export interface ScanResult {
  /** 目录树文本 */
  tree: string
  /** 关键文件内容（路径 → 内容） */
  files: Array<{ path: string; content: string }>
}

/** 需要忽略的目录 */
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.output', '__pycache__', '.venv', 'venv', '.idea',
  '.vscode', '.gradle', '.cache', 'coverage', '.turbo', '.parcel-cache',
  'vendor', 'Pods', '.dart_tool', '.pub-cache',
])

/** 需要忽略的文件 */
const IGNORE_FILES = new Set([
  'package-lock.json', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db', '.env', '.env.local',
])

/** 优先读取的文件（按优先级排序） */
const PRIORITY_FILES = [
  'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'build.gradle',
  'pom.xml', 'composer.json', 'Gemfile', 'pubspec.yaml',
  'README.md', 'README.rst', 'README.txt',
  'tsconfig.json', 'vite.config.ts', 'vite.config.js',
  'next.config.js', 'next.config.ts', 'nuxt.config.ts',
  'webpack.config.js', 'rollup.config.js',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.eslintrc.js', '.eslintrc.json', 'eslint.config.js',
]

/** 可读取的源码扩展名 */
const SOURCE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte',
  '.py', '.rs', '.go', '.java', '.kt', '.swift', '.dart',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php',
  '.yaml', '.yml', '.toml', '.json', '.xml', '.html', '.css', '.scss',
  '.md', '.txt', '.sh', '.bat', '.ps1', '.sql',
])

/** 内容大小上限（字符） */
const MAX_TOTAL_CONTENT = 30000
/** 单文件内容上限 */
const MAX_FILE_CONTENT = 3000
/** 目录树最大深度 */
const MAX_DEPTH = 5

/**
 * 扫描项目目录，返回目录树和关键文件内容
 */
export function scanProject(projectPath: string): ScanResult {
  const treeLines: string[] = []
  const allFiles: Array<{ path: string; priority: number }> = []

  // 递归构建目录树并收集文件
  buildTree(projectPath, '', 0, treeLines, allFiles, projectPath)

  // 按优先级排序文件
  allFiles.sort((a, b) => a.priority - b.priority)

  // 读取文件内容，控制总大小
  const files: Array<{ path: string; content: string }> = []
  let totalSize = 0

  for (const f of allFiles) {
    if (totalSize >= MAX_TOTAL_CONTENT) break
    try {
      let content = readFileSync(f.path, 'utf-8')
      if (content.length > MAX_FILE_CONTENT) {
        content = content.substring(0, MAX_FILE_CONTENT) + '\n... (truncated)'
      }
      const relativePath = f.path.substring(projectPath.length).replace(/\\/g, '/')
      files.push({ path: relativePath, content })
      totalSize += content.length
    } catch {
      // 跳过无法读取的文件
    }
  }

  return { tree: treeLines.join('\n'), files }
}

function buildTree(
  dirPath: string,
  prefix: string,
  depth: number,
  lines: string[],
  allFiles: Array<{ path: string; priority: number }>,
  rootPath: string,
) {
  if (depth > MAX_DEPTH) return

  let entries: Array<{ name: string; isDir: boolean }>
  try {
    const raw = readdirSync(dirPath, { withFileTypes: true })
    entries = raw
      .filter(e => !e.name.startsWith('.') || e.name === '.env.example')
      .filter(e => !(e.isDirectory() && IGNORE_DIRS.has(e.name)))
      .filter(e => !(e.isFile() && IGNORE_FILES.has(e.name)))
      .map(e => ({ name: e.name, isDir: e.isDirectory() }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const isLast = i === entries.length - 1
    const connector = isLast ? '└── ' : '├── '
    const childPrefix = isLast ? '    ' : '│   '

    lines.push(`${prefix}${connector}${entry.name}${entry.isDir ? '/' : ''}`)

    const fullPath = join(dirPath, entry.name)

    if (entry.isDir) {
      buildTree(fullPath, prefix + childPrefix, depth + 1, lines, allFiles, rootPath)
    } else {
      // 计算文件优先级
      const priorityIdx = PRIORITY_FILES.indexOf(entry.name)
      let priority: number
      if (priorityIdx >= 0) {
        priority = priorityIdx // 优先文件：0-N
      } else if (isEntryFile(entry.name, depth)) {
        priority = 100 // 入口文件
      } else if (SOURCE_EXTS.has(extname(entry.name))) {
        priority = 200 + depth * 10 // 源码文件，浅层优先
      } else {
        priority = 999 // 其他文件
      }

      allFiles.push({ path: fullPath, priority })
    }
  }
}

/** 判断是否为入口文件 */
function isEntryFile(name: string, depth: number): boolean {
  if (depth > 2) return false
  const base = basename(name, extname(name))
  return ['index', 'main', 'app', 'server', 'mod', 'lib'].includes(base.toLowerCase())
}
