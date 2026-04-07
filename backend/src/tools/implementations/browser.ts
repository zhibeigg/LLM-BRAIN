import type { ToolResult, ToolContext } from '../../types/index.js'

/**
 * 浏览器工具 — 导航、提取页面内容、截取关键信息
 * 基于 fetch + HTML 解析，不依赖 Puppeteer
 */
export async function executeBrowser(
  args: { action: 'navigate' | 'get_text' | 'get_links'; url?: string; selector?: string; maxLength?: number },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { action, url } = args
    if (!url) return { success: false, output: '', error: '缺少 URL' }

    const maxLength = args.maxLength ?? 5000

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })

    if (!res.ok) {
      return { success: false, output: '', error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const html = await res.text()

    if (action === 'get_links') {
      // 提取所有链接
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
      const links: string[] = []
      let match: RegExpExecArray | null
      while ((match = linkRegex.exec(html)) !== null && links.length < 30) {
        const href = match[1]
        const text = match[2].replace(/<[^>]+>/g, '').trim()
        if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
          links.push(`${text} → ${href}`)
        }
      }
      return { success: true, output: links.length > 0 ? links.join('\n') : '未找到链接' }
    }

    // navigate / get_text — 提取纯文本
    // 提取 title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''

    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
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

    const header = `页面: ${title || url}\nURL: ${url}\n\n`
    return { success: true, output: header + (text || '(页面内容为空)') }
  } catch (err) {
    return { success: false, output: '', error: `浏览器操作失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
