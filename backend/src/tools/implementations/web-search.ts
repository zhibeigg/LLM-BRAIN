import type { ToolResult, ToolContext } from '../../types/index.js'

/**
 * 网页搜索工具 — 使用 DuckDuckGo Instant Answer API（无需 API Key）
 */
export async function executeWebSearch(
  args: { query: string; maxResults?: number },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const query = args.query
    if (!query) return { success: false, output: '', error: '缺少搜索关键词' }

    const maxResults = args.maxResults ?? 5
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'LLM-BRAIN/1.0' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      return { success: false, output: '', error: `搜索请求失败: ${res.status}` }
    }

    const data = await res.json() as Record<string, unknown>
    const results: string[] = []

    // Abstract（摘要）
    if (data.Abstract && typeof data.Abstract === 'string') {
      results.push(`摘要: ${data.Abstract}`)
      if (data.AbstractURL) results.push(`来源: ${data.AbstractURL}`)
    }

    // RelatedTopics（相关话题）
    const topics = data.RelatedTopics as Array<Record<string, unknown>> | undefined
    if (topics) {
      for (const topic of topics.slice(0, maxResults)) {
        if (topic.Text && typeof topic.Text === 'string') {
          const line = topic.FirstURL ? `${topic.Text} (${topic.FirstURL})` : topic.Text
          results.push(line)
        }
      }
    }

    if (results.length === 0) {
      return { success: true, output: `未找到关于"${query}"的搜索结果。` }
    }

    return { success: true, output: results.join('\n\n') }
  } catch (err) {
    return { success: false, output: '', error: `搜索失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
