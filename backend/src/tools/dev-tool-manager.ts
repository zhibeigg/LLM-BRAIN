import type { DevToolDefinition, DevToolStatus } from '../types/index.js'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { broadcast } from '../ws/server.js'

/** 可安装的开发工具列表 */
export const DEV_TOOLS: DevToolDefinition[] = [
  {
    id: 'ripgrep',
    name: 'ripgrep',
    description: '极速代码搜索工具，比 grep 快 10x+',
    version: '14.1.0',
    installMethod: 'npm',
    npmPackage: '@vscode/ripgrep',
    binaryName: 'rg',
    versionCommand: ['--version'],
    purpose: '为 file_search 工具提供高性能代码搜索能力',
  },
  {
    id: 'fd',
    name: 'fd',
    description: '快速文件查找工具，find 的现代替代',
    version: 'latest',
    installMethod: 'system',
    binaryName: 'fd',
    versionCommand: ['--version'],
    purpose: '加速文件名搜索',
  },
  {
    id: 'bat',
    name: 'bat',
    description: '带语法高亮的文件查看工具，cat 的现代替代',
    version: 'latest',
    installMethod: 'system',
    binaryName: 'bat',
    versionCommand: ['--version'],
    purpose: '为文件读取提供语法高亮',
  },
]

/** 检测单个工具是否已安装 */
export async function checkToolStatus(toolDef: DevToolDefinition): Promise<DevToolStatus> {
  const status: DevToolStatus = { id: toolDef.id, installed: false }

  // 先检查 npm 安装的路径（仅 npm 工具）
  if (toolDef.installMethod === 'npm' && toolDef.npmPackage) {
    const npmBinPath = resolve(process.cwd(), 'node_modules', '.bin', toolDef.binaryName)
    try {
      const version = await execCommand(npmBinPath, toolDef.versionCommand)
      if (version) {
        status.installed = true
        status.version = parseVersion(version)
        status.path = npmBinPath
        return status
      }
    } catch { /* not installed via npm */ }
  }

  // 检查系统 PATH
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const pathResult = await execCommand(cmd, [toolDef.binaryName])
    const binPath = pathResult.trim().split('\n')[0]?.trim()
    if (binPath) {
      const version = await execCommand(binPath, toolDef.versionCommand)
      status.installed = true
      status.version = parseVersion(version)
      status.path = binPath
    }
  } catch { /* not found */ }

  return status
}

/** 检测所有工具状态 */
export async function checkAllToolStatus(): Promise<DevToolStatus[]> {
  return Promise.all(DEV_TOOLS.map(t => checkToolStatus(t)))
}

/** 安装工具 */
export async function installTool(toolId: string, userId?: string): Promise<DevToolStatus> {
  const toolDef = DEV_TOOLS.find(t => t.id === toolId)
  if (!toolDef) throw new Error(`未知工具: ${toolId}`)

  const sendProgress = (phase: string, message: string, progress?: number) => {
    broadcast('dev_tool_install_progress', { toolId, phase, message, progress }, userId)
  }

  if (toolDef.installMethod === 'npm' && toolDef.npmPackage) {
    sendProgress('downloading', `正在安装 ${toolDef.npmPackage}...`, 10)

    try {
      // 使用 npm/bun 安装到 backend 目录
      const packageManager = await detectPackageManager()
      const installCmd = packageManager === 'bun' ? 'bun' : 'npm'
      const installArgs = packageManager === 'bun'
        ? ['add', toolDef.npmPackage]
        : ['install', '--save-dev', toolDef.npmPackage]

      sendProgress('installing', `使用 ${installCmd} 安装...`, 50)

      await execCommand(installCmd, installArgs, { cwd: resolve(process.cwd()) })

      sendProgress('done', `${toolDef.name} 安装完成`, 100)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendProgress('error', `安装失败: ${msg}`)
      throw new Error(`安装 ${toolDef.name} 失败: ${msg}`)
    }
  } else {
    // 系统工具，提供安装指引
    const instructions = getInstallInstructions(toolDef)
    sendProgress('error', `${toolDef.name} 需要手动安装:\n${instructions}`)
    throw new Error(`${toolDef.name} 需要通过系统包管理器安装:\n${instructions}`)
  }

  // 验证安装
  return checkToolStatus(toolDef)
}

/** 获取系统安装指引 */
function getInstallInstructions(toolDef: DevToolDefinition): string {
  const name = toolDef.binaryName
  if (process.platform === 'win32') {
    return `Windows: winget install ${name} 或 scoop install ${name} 或 choco install ${name}`
  } else if (process.platform === 'darwin') {
    return `macOS: brew install ${name}`
  } else {
    return `Linux: apt install ${name} 或 pacman -S ${name}`
  }
}

/** 检测包管理器 */
async function detectPackageManager(): Promise<'bun' | 'npm'> {
  try {
    await execCommand('bun', ['--version'])
    return 'bun'
  } catch {
    return 'npm'
  }
}

/** 执行命令并返回 stdout */
function execCommand(cmd: string, args: string[], options?: { cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120000, maxBuffer: 1024 * 512, ...options }, (err, stdout, stderr) => {
      if (err) return reject(err)
      resolve(stdout || stderr || '')
    })
  })
}

/** 从版本输出中提取版本号 */
function parseVersion(output: string): string {
  const match = output.match(/(\d+\.\d+\.\d+)/)
  return match?.[1] ?? output.trim().split('\n')[0]?.trim() ?? 'unknown'
}
