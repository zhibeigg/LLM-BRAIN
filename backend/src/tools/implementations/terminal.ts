import type { ToolResult, ToolContext } from '../../types/index.js'
import { execFile } from 'node:child_process'

/**
 * 审计日志前缀
 */
const AUDIT_PREFIX = '[Terminal-Audit]'

/**
 * 允许的命令白名单
 */
const ALLOWED_COMMANDS = new Set([
  'ls', 'pwd', 'echo', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'sort', 'uniq',
])

/**
 * 禁止的危险字符和模式
 */
const DANGEROUS_PATTERNS = [
  /;/,        // 命令分隔
  /\|/,       // 管道
  /&&/,       // 条件执行
  /\|\|/,     // 条件执行
  />/,        // 输出重定向
  /</,        // 输入重定向
  /\$/,       // 变量替换
  /`/,        // 命令替换
  /\\$/,      // 转义字符
  /\n/,       // 换行
  /\r/,       // 回车
  /\$\(/,     // $(...) 命令替换
  /\|\s/,     // 管道后跟空格
  /&&\s/,     // && 后跟空格
  /\|\|/,     // || 
  />>/,       // 追加重定向
  /2>/,       // 错误重定向
  /1>/,       // 输出重定向
  /\/dev\//,  // 设备文件
  /\/etc\//,  // 系统配置
  /\/proc\//, // 进程信息
  /\~\//,     // 用户目录
  /\.\.\//,   // 目录遍历
]

/**
 * 命令最大长度
 */
const MAX_COMMAND_LENGTH = 500

/**
 * 检查 Docker 是否可用
 */
async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('docker', ['--version'], { timeout: 5000 }, (err) => {
      resolve(!err)
    })
  })
}

/**
 * 验证命令安全性
 */
function validateCommand(command: string): { valid: boolean; error?: string } {
  // 检查命令长度
  if (command.length > MAX_COMMAND_LENGTH) {
    return { valid: false, error: `命令过长，最多允许 ${MAX_COMMAND_LENGTH} 字符` }
  }

  // 检查危险字符
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { valid: false, error: `命令包含禁止的危险字符或模式` }
    }
  }

  // 提取命令名称（第一个单词）
  const cmdName = command.trim().split(/\s+/)[0]

  // 检查命令是否在白名单中
  if (!ALLOWED_COMMANDS.has(cmdName)) {
    return { valid: false, error: `命令 "${cmdName}" 不在白名单中` }
  }

  // 检查参数中是否包含危险模式
  const args = command.slice(cmdName.length)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(args)) {
      return { valid: false, error: `命令参数包含危险字符` }
    }
  }

  return { valid: true }
}

/**
 * 使用 Docker 执行命令（隔离环境）
 */
async function executeWithDocker(command: string, timeout: number): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    // 使用 Alpine Linux 镜像，网络隔离，只读挂载当前目录
    console.log(`${AUDIT_PREFIX} [Docker] 执行命令: ${command}`)
    
    const args = [
      'run', '--rm', '--network=none', '--read-only',
      '-v', `${process.cwd()}:/workspace:ro`,
      '-w', '/workspace',
      'alpine', 'sh', '-c', command
    ]

    execFile('docker', args, { timeout, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        code: typeof err?.code === 'number' ? err.code : (err ? 1 : 0),
      })
    })
  })
}

/**
 * 使用 execFile 执行命令（备选方案，无 Docker 时）
 */
async function executeWithExecFile(command: string, timeout: number): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmdName = command.trim().split(/\s+/)[0]
  const cmdArgs = command.slice(cmdName.length).trim().split(/\s+/).filter(Boolean)

    console.log(`${AUDIT_PREFIX} [ExecFile] 执行命令: ${command}`)

  return new Promise((resolve) => {
    execFile(cmdName, cmdArgs, { timeout, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        code: typeof err?.code === 'number' ? err.code : (err ? 1 : 0),
      })
    })
  })
}

/**
 * 终端工具 — 在服务器上执行 shell 命令（安全版本）
 * 
 * 安全措施：
 * 1. 命令白名单机制
 * 2. Docker 容器隔离执行
 * 3. 危险字符和模式过滤
 * 4. 命令长度限制
 * 5. 执行审计日志
 */
export async function executeTerminal(
  args: { command: string; timeout?: number },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { command } = args

    // 基本参数检查
    if (!command) {
      return { success: false, output: '', error: '缺少命令' }
    }

    // 审计日志
    console.log(`${AUDIT_PREFIX} 收到命令请求: ${command}`)

    // 验证命令安全性
    const validation = validateCommand(command)
    if (!validation.valid) {
      console.warn(`${AUDIT_PREFIX} [Blocked] 命令被阻止: ${validation.error} - 命令: ${command}`)
      return { success: false, output: '', error: validation.error }
    }

    const timeout = Math.min(args.timeout ?? 15000, 30000)

    // 检查 Docker 是否可用
    const dockerAvailable = await isDockerAvailable()

    let result: { stdout: string; stderr: string; code: number }

    if (dockerAvailable) {
      // 使用 Docker 容器隔离执行
      result = await executeWithDocker(command, timeout)
    } else {
      console.warn(`${AUDIT_PREFIX} Docker 不可用，使用 execFile 备选方案（安全性降低）`)
      result = await executeWithExecFile(command, timeout)
    }

    const output = [
      result.stdout ? result.stdout.trim() : '',
      result.stderr ? `[stderr] ${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n')

    // 审计日志
    console.log(`${AUDIT_PREFIX} 命令执行完成: exitCode=${result.code}`)

    return {
      success: result.code === 0,
      output: output || '(无输出)',
      error: result.code !== 0 ? `退出码: ${result.code}` : undefined,
    }
  } catch (err) {
    console.error(`${AUDIT_PREFIX} [Error] 执行失败: ${err instanceof Error ? err.message : String(err)}`)
    return { success: false, output: '', error: `执行失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
