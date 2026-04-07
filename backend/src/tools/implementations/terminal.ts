import type { ToolResult, ToolContext } from '../../types/index.js'
import { exec } from 'node:child_process'

/**
 * 终端工具 — 在服务器上执行 shell 命令
 */
export async function executeTerminal(
  args: { command: string; timeout?: number },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { command } = args
    if (!command) return { success: false, output: '', error: '缺少命令' }

    const timeout = Math.min(args.timeout ?? 15000, 30000)

    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      exec(command, { timeout, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: err?.code ?? 0,
        })
      })
    })

    const output = [
      result.stdout ? result.stdout.trim() : '',
      result.stderr ? `[stderr] ${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n')

    return {
      success: result.code === 0,
      output: output || '(无输出)',
      error: result.code !== 0 ? `退出码: ${result.code}` : undefined,
    }
  } catch (err) {
    return { success: false, output: '', error: `执行失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
