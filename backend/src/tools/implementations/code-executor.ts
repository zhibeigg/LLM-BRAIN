import type { ToolResult, ToolContext } from '../../types/index.js'

/**
 * 代码执行工具 — 在 Node.js vm 中安全执行 JavaScript
 */
export async function executeCode(
  args: { code: string; language?: string },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { code } = args
    if (!code) return { success: false, output: '', error: '缺少代码' }

    const language = args.language ?? 'javascript'
    if (language !== 'javascript' && language !== 'js') {
      return { success: false, output: '', error: `暂不支持 ${language}，目前仅支持 JavaScript` }
    }

    const { runInNewContext } = await import('node:vm')

    const logs: string[] = []
    const sandbox = {
      console: {
        log: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
        error: (...a: unknown[]) => logs.push('[ERROR] ' + a.map(String).join(' ')),
        warn: (...a: unknown[]) => logs.push('[WARN] ' + a.map(String).join(' ')),
      },
      Math, Date, JSON,
      parseInt, parseFloat, isNaN, isFinite,
      Array, Object, String, Number, Boolean, Map, Set, RegExp,
    }

    const result = runInNewContext(code, sandbox, {
      timeout: 5000,
      displayErrors: true,
    })

    const output = logs.length > 0
      ? logs.join('\n') + (result !== undefined ? `\n返回值: ${JSON.stringify(result)}` : '')
      : result !== undefined ? String(JSON.stringify(result)) : '(无输出)'

    return { success: true, output }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, output: '', error: `执行错误: ${msg}` }
  }
}
