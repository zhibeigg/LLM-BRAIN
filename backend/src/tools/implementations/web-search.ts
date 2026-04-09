import type { ToolResult, ToolContext } from '../../types/index.js'

/**
 * 网页搜索工具 — 抓取 Bing 搜索结果（无需 API Key）
 */
export async function executeWebSearch(
  args: { query: string; maxResults?: number },
  _ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const query = args.query
    if (!query) return { success: false, output: '', error: '缺少搜索关键词' }

    const maxResults = args.maxResults ?? 5
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return { success: false, output: '', error: `搜索请求失败: ${res.status}` }
    }

    const html = await res.text()
    const results = parseBingResults(html, maxResults)

    if (results.length === 0) {
      return { success: true, output: `未找到关于"${query}"的搜索结果。` }
    }

    return { success: true, output: results.join('\n\n') }
  } catch (err) {
    return { success: false, output: '', error: `搜索失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** 从 Bing HTML 中提取搜索结果 */
function parseBingResults(html: string, max: number): string[] {
  const results: string[] = []

  // 按 <li class="b_algo"> 分割
  const blocks = html.split(/<li\s+class="b_algo"/i).slice(1)

  for (let i = 0; i < Math.min(max, blocks.length); i++) {
    const block = blocks[i]

    // 从 <h2><a href="...">title</a></h2> 提取标题
    const h2Match = block.match(/<h2[^>]*>[\s\S]*?<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    const title = (h2Match?.[2] ?? '').replace(/<[^>]*>/g, '').trim()

    // 从 <cite> 提取显示 URL
    const citeMatch = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i)
    const displayUrl = (citeMatch?.[1] ?? '').replace(/<[^>]*>/g, '').trim()

    // 从 <p> 提取摘要（取第一个有意义的段落）
    const pMatches = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    let snippet = ''
    if (pMatches) {
      for (const p of pMatches) {
        const text = p.replace(/<[^>]*>/g, '').trim()
        if (text.length > 20) { snippet = text; break }
      }
    }

    if (title) {
      let entry = title
      if (displayUrl) entry += `\n链接: ${displayUrl}`
      if (snippet) entry += `\n${snippet}`
      results.push(entry)
    }
  }

  return results
}
