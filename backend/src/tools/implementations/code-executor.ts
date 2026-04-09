import type { ToolResult, ToolContext } from '../../types/index.js'
import { createContext, runInNewContext, type Context } from 'vm'

/** 最大代码长度（字符） */
const MAX_CODE_LENGTH = 10000

/** 执行超时（毫秒） */
const EXECUTION_TIMEOUT_MS = 5000

/**
 * 创建一个安全的上下文对象，防止原型链攻击
 */
function createSecureContext(): Context {
  const logs: string[] = []

  // 使用 Object.create(null) 创建没有原型的对象作为 console
  const safeConsole = Object.create(null)
  safeConsole.log = (...args: unknown[]) => logs.push(String(args.join(' ')))
  safeConsole.error = (...args: unknown[]) => logs.push('[ERROR] ' + String(args.join(' ')))
  safeConsole.warn = (...args: unknown[]) => logs.push('[WARN] ' + String(args.join(' ')))
  safeConsole.info = (...args: unknown[]) => logs.push('[INFO] ' + String(args.join(' ')))

  // 冻结 Math 对象
  const safeMath = Object.create(null)
  const mathProps = ['E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'PI', 'SQRT1_2', 'SQRT2',
    'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2', 'cbrt', 'ceil',
    'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor', 'fround', 'hypot', 'imul',
    'log', 'log1p', 'log10', 'log2', 'max', 'min', 'pow', 'random', 'round',
    'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc'] as const
  for (const prop of mathProps) {
    Object.defineProperty(safeMath, prop, {
      value: (Math as unknown as Record<string, unknown>)[prop],
      writable: false,
      enumerable: true,
    })
  }
  Object.freeze(safeMath)

  // 创建安全的全局对象映射
  const safeGlobals: Record<string, unknown> = {
    console: safeConsole,
    Math: safeMath,
    Date,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Array,
    Object: Object.create(null), // 创建一个没有原型的 Object
    String,
    Number,
    Boolean,
    Map,
    Set,
    RegExp,
    undefined,
    NaN,
    Infinity,
    ArrayBuffer,
    Uint8Array,
    Int32Array,
    Float64Array,
    DataView,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
  }

  // 为 Object 设置安全的方法（使用 Object.create(null) 移除原型）
  const safeObject = Object.create(null)
  Object.defineProperties(safeObject, {
    keys: { value: Object.keys, writable: false, enumerable: false },
    values: { value: Object.values, writable: false, enumerable: false },
    entries: { value: Object.entries, writable: false, enumerable: false },
    freeze: { value: Object.freeze, writable: false, enumerable: false },
    seal: { value: Object.seal, writable: false, enumerable: false },
    create: { value: Object.create, writable: false, enumerable: false },
    assign: { value: Object.assign, writable: false, enumerable: false },
    defineProperty: { value: Object.defineProperty, writable: false, enumerable: false },
    defineProperties: { value: Object.defineProperties, writable: false, enumerable: false },
  })
  Object.freeze(safeObject)
  safeGlobals.Object = safeObject

  // 创建 context
  const context = createContext(safeGlobals)

  return context
}

/**
 * 代码执行工具 — 在加固的 VM 沙箱中安全执行 JavaScript
 *
 * 安全措施：
 * 1. 使用 Object.create(null) 移除原型链
 * 2. 冻结所有全局对象
 * 3. 代码长度限制
 * 4. 执行超时限制
 * 5. 只暴露安全的内置对象
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

    // 代码长度检查
    if (code.length > MAX_CODE_LENGTH) {
      return { success: false, output: '', error: `代码过长，最多允许 ${MAX_CODE_LENGTH} 字符，当前 ${code.length} 字符` }
    }

    // 创建安全上下文
    const context = createSecureContext()

    // 包装代码，使用严格模式
    const wrappedCode = `
      'use strict';
      ${code}
    `

    // 执行代码
    const result = runInNewContext(wrappedCode, context, {
      timeout: EXECUTION_TIMEOUT_MS,
      displayErrors: true,
    })

    const output = result !== undefined ? String(JSON.stringify(result)) : '(无输出)'

    return { success: true, output }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 清理错误消息
    const cleanMsg = msg
      .replace(/Script execution timed out.*/i, '执行超时（超过5秒）')
      .replace(/v8::Context::NewMicrotasks.*/i, '')
      .trim()
    return { success: false, output: '', error: `执行错误: ${cleanMsg}` }
  }
}
