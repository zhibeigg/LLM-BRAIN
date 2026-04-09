import type { ToolResult, ToolContext } from '../../types/index.js'

/**
 * 计算器工具 — 安全地执行数学表达式
 */
export async function executeCalculator(
  args: { expression: string },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { expression } = args
    if (!expression) return { success: false, output: '', error: '缺少数学表达式' }

    // 安全校验：只允许数字、运算符、括号、数学函数
    const sanitized = expression.trim()

    // 先检查是否只包含安全字符（数字、运算符、括号、空格、小数点）和数学函数名
    const mathFnNames = /\b(Math\.\w+|sqrt|pow|abs|ceil|floor|round|sin|cos|tan|log|exp|PI|E)\b/g
    const withoutMathFns = sanitized.replace(mathFnNames, '0') // 将数学函数替换为数字后再检查
    const allowed = /^[\d\s+\-*/().^eE]+$/

    if (!allowed.test(withoutMathFns)) {
      return { success: false, output: '', error: '表达式包含不允许的字符' }
    }

    // 将常见数学函数映射到 Math 对象
    const prepared = sanitized
      .replace(/\bsqrt\b/g, 'Math.sqrt')
      .replace(/\bpow\b/g, 'Math.pow')
      .replace(/\babs\b/g, 'Math.abs')
      .replace(/\bceil\b/g, 'Math.ceil')
      .replace(/\bfloor\b/g, 'Math.floor')
      .replace(/\bround\b/g, 'Math.round')
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\blog\b/g, 'Math.log')
      .replace(/\bexp\b/g, 'Math.exp')
      .replace(/\bPI\b/g, 'Math.PI')
      .replace(/(?<!\.)E\b/g, 'Math.E')

    const { runInNewContext } = await import('node:vm')
    const result = runInNewContext(`(${prepared})`, { Math }, { timeout: 1000 })

    if (typeof result !== 'number' || !isFinite(result)) {
      return { success: false, output: '', error: `计算结果无效: ${result}` }
    }

    return { success: true, output: `${expression} = ${result}` }
  } catch (err) {
    return { success: false, output: '', error: `计算失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
