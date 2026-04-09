import type { Request, Response, NextFunction } from 'express'

// 环境标识
const isDev = process.env.NODE_ENV !== 'production'

/**
 * 统一错误响应格式
 */
export interface ErrorResponse {
  error: string
  message: string
  statusCode: number
  stack?: string
  timestamp: number
  path?: string
}

/**
 * 自定义应用错误类
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * 常见错误工厂
 */
export const Errors = {
  badRequest: (message = '请求参数错误') => new AppError(400, message),
  unauthorized: (message = '未登录或登录已过期') => new AppError(401, message),
  forbidden: (message = '没有权限访问此资源') => new AppError(403, message),
  notFound: (message = '请求的资源不存在') => new AppError(404, message),
  conflict: (message = '资源冲突') => new AppError(409, message),
  internal: (message = '服务器内部错误') => new AppError(500, message, false),
}

/**
 * 全局错误处理中间件
 * 统一错误响应格式，区分开发和生产环境
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 默认值
  let statusCode = 500
  let message = '服务器内部错误'
  let error = 'Internal Server Error'
  let stack: string | undefined

  // 处理自定义应用错误
  if (err instanceof AppError) {
    statusCode = err.statusCode
    message = err.message
    error = getErrorName(statusCode)
    // 生产环境下不暴露操作错误堆栈
    if (isDev || !err.isOperational) {
      stack = err.stack
    }
  } else if (err instanceof Error) {
    // 处理未知错误
    message = isDev ? err.message : '服务器内部错误'
    error = isDev ? err.name : 'Internal Server Error'
    stack = isDev ? err.stack : undefined

    // 记录未知错误以便排查
    if (!isDev) {
      console.error('[未处理错误]', err)
    }
  }

  // 构建错误响应
  const errorResponse: ErrorResponse = {
    error,
    message,
    statusCode,
    timestamp: Date.now(),
    path: req.path,
  }

  // 开发环境添加堆栈信息
  if (stack) {
    errorResponse.stack = stack
  }

  // 发送错误响应
  res.status(statusCode).json(errorResponse)
}

/**
 * 404 处理中间件
 * 处理所有未匹配的路由
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    error: 'Not Found',
    message: `路由 ${req.method} ${req.path} 不存在`,
    statusCode: 404,
    timestamp: Date.now(),
    path: req.path,
  })
}

/**
 * 异步处理器包装
 * 自动捕获异步函数中的错误，传递给错误处理中间件
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * 根据状态码获取错误名称
 */
function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  }
  return errorNames[statusCode] || 'Error'
}

/**
 * 注册全局错误监听
 * 处理未捕获的 Promise 拒绝和未捕获的异常
 */
export function registerGlobalErrorHandlers(): void {
  // 处理未捕获的 Promise 拒绝
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('[未捕获的 Promise 拒绝]')
    console.error('Promise:', promise)
    console.error('Reason:', reason)

    // 如果 reason 是 Error，记录详细堆栈
    if (reason instanceof Error) {
      console.error('Stack:', reason.stack)
    }

    // 生产环境不应该让进程崩溃，但应该记录以便排查
    if (isDev) {
      console.error('[警告] 开发环境下进程因未处理的 Promise 拒绝而终止')
      process.exit(1)
    }
  })

  // 处理未捕获的异常
  process.on('uncaughtException', (err: Error) => {
    console.error('[未捕获的异常]')
    console.error('Message:', err.message)
    console.error('Stack:', err.stack)

    // 记录后优雅退出
    console.error('[致命错误] 进程即将退出...')
    process.exit(1)
  })

  console.log(`[信息] 全局错误监听已注册 (${isDev ? '开发' : '生产'}模式)`)
}
