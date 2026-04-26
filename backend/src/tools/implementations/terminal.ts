import type { ToolResult, ToolContext } from '../../types/index.js'
import { exec } from 'node:child_process'
import { resolve } from 'node:path'

const AUDIT_PREFIX = '[Terminal-Audit]'

/** 命令最大长度 */
const MAX_COMMAND_LENGTH = 2000

/** 输出最大字节 */
const MAX_OUTPUT_SIZE = 512 * 1024

/** 绝对禁止的命令模式（真正危险的操作） */
const BLOCKED_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/i,  // rm -rf /
  /\bformat\b/i,                                   // format
  /\bshutdown\b/i,                                 // shutdown
  /\breboot\b/i,                                   // reboot
  /\bmkfs\b/i,                                     // mkfs
  /\bdd\s+.*of=\/dev\//i,                          // dd of=/dev/
  /\b(poweroff|halt|init\s+0)\b/i,                 // poweroff
  />\s*\/dev\/(sd|hd|nvme)/i,                      // 写入磁盘设备
  /\bchmod\s+.*\s+\/\s*$/i,                        // chmod /
  /\bchown\s+.*\s+\/\s*$/i,                        // chown /
  /\bcurl\b.*\|\s*(ba)?sh/i,                       // curl | sh（远程代码执行）
  /\bwget\b.*\|\s*(ba)?sh/i,                       // wget | sh
]

/** 禁止访问的路径 */
const BLOCKED_PATHS = [
  /\/etc\/shadow/,
  /\/etc\/passwd/,
  /~\/\.ssh/,
  /\.env\.local/,
  /\.env\.production/,
]

/**
 * 验证命令安全性 — 黑名单模式
 */
function validateCommand(command: string): { valid: boolean; error?: string } {
  if (!command.trim()) {
    return { valid: false, error: '命令为空' }
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return { valid: false, error: `命令过长，最多允许 ${MAX_COMMAND_LENGTH} 字符` }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { valid: false, error: '命令包含禁止的危险操作' }
    }
  }

  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(command)) {
      return { valid: false, error: '命令涉及禁止访问的路径' }
    }
  }

  return { valid: true }
}

/**
 * 终端工具 — 在项目目录中执行 Shell 命令
 *
 * 安全措施：
 * 1. 工作目录锁定在项目 projectPath 内
 * 2. 危险命令黑名单过滤
 * 3. 命令长度限制（2000 字符）
 * 4. 执行超时限制（默认 30s，最大 60s）
 * 5. 输出大小限制（512KB）
 * 6. 审计日志
 */
export async function executeTerminal(
  args: { command: string; timeout?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { command } = args
    if (!command) {
      return { success: false, output: '', error: '缺少命令' }
    }

    console.log(`${AUDIT_PREFIX} 收到命令请求: ${command}`)

    // 验证命令安全性
    const validation = validateCommand(command)
    if (!validation.valid) {
      console.warn(`${AUDIT_PREFIX} [Blocked] ${validation.error} — ${command}`)
      return { success: false, output: '', error: validation.error }
    }

    const timeout = Math.min(args.timeout ?? 30000, 60000)
    const cwd = ctx.projectPath ? resolve(ctx.projectPath) : process.cwd()

    console.log(`${AUDIT_PREFIX} [Exec] cwd=${cwd} cmd=${command}`)

    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((res) => {
      exec(command, {
        cwd,
        timeout,
        maxBuffer: MAX_OUTPUT_SIZE,
        env: { ...process.env, LANG: 'en_US.UTF-8' },
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      }, (err, stdout, stderr) => {
        res({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: err?.code ?? (err ? 1 : 0),
        })
      })
    })

    const output = [
      result.stdout ? result.stdout.trim() : '',
      result.stderr ? `[stderr] ${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n')

    console.log(`${AUDIT_PREFIX} 执行完成: exitCode=${result.code}`)

    return {
      success: result.code === 0,
      output: output || '(无输出)',
      error: result.code !== 0 ? `退出码: ${result.code}` : undefined,
    }
  } catch (err) {
    console.error(`${AUDIT_PREFIX} [Error] ${err instanceof Error ? err.message : String(err)}`)
    return { success: false, output: '', error: `执行失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
