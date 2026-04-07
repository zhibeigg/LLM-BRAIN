import type { ToolResult, ToolContext } from '../../types/index.js'

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
