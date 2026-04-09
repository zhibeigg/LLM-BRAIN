import type { ToolResult, ToolContext } from '../../types/index.js'
import { isSafeURL } from '../../utils/network.js'

/**
 * 网页读取工具 — fetch URL 并提取纯文本
 */
export async function executeUrlReader(
  args: { url: string; maxLength?: number },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { url } = args
    if (!url) return { success: false, output: '', error: '缺少 URL' }

    // URL长度限制
    const MAX_URL_LENGTH = 2048
    if (url.length > MAX_URL_LENGTH) {
      return { success: false, output: '', error: `URL 长度超过限制（最多 ${MAX_URL_LENGTH} 字符）` }
    }

    // 协议检查（只允许 http/https）
    try {
      const urlObj = new URL(url)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { success: false, output: '', error: `禁止访问: 不支持的协议 ${urlObj.protocol}（仅允许 http/https）` }
      }
    } catch {
      return { success: false, output: '', error: '禁止访问: 无效的 URL 格式' }
    }

    // URL 安全检查（防止 SSRF）
    const safety = isSafeURL(url)
    if (!safety.safe) {
      return { success: false, output: '', error: '禁止访问: ' + safety.reason }
    }

    // 恶意域名黑名单检查
    const maliciousDomains = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
    ]
    try {
      const urlObj = new URL(url)
      const hostname = urlObj.hostname.toLowerCase()
      if (maliciousDomains.includes(hostname)) {
        return { success: false, output: '', error: '禁止访问: 恶意或危险域名' }
      }
    } catch {
      // 已在上面处理过无效URL
    }

    const maxLength = args.maxLength ?? 5000

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LLM-BRAIN/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })

    if (!res.ok) {
      return { success: false, output: '', error: `请求失败: ${res.status} ${res.statusText}` }
    }

    const html = await res.text()

    // 简单的 HTML → 纯文本提取
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()

    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...(已截断)'
    }

    if (!text) {
      return { success: true, output: '页面内容为空或无法提取文本。' }
    }

    return { success: true, output: `URL: ${url}\n\n${text}` }
  } catch (err) {
    return { success: false, output: '', error: `读取失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
