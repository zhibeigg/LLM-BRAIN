import type { ToolResult, ToolContext } from '../../types/index.js'
import { getNodesByBrainId } from '../../db/nodes.js'

/**
 * 记忆搜索工具 — 在当前大脑的记忆图谱中搜索相关节点
 */
export async function executeMemorySearch(
  args: { query: string; maxResults?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { query } = args
    if (!query) return { success: false, output: '', error: '缺少搜索关键词' }

    const maxResults = args.maxResults ?? 5
    const nodes = getNodesByBrainId(ctx.brainId)

    if (nodes.length === 0) {
      return { success: true, output: '当前大脑中没有任何记忆节点。' }
    }

    // 简单的关键词匹配 + 相关度排序
    const keywords = query.toLowerCase().split(/\s+/)
    const scored = nodes.map(node => {
      const text = `${node.title} ${node.content} ${node.tags.join(' ')}`.toLowerCase()
      let score = 0
      for (const kw of keywords) {
        if (text.includes(kw)) score++
        if (node.title.toLowerCase().includes(kw)) score += 2 // 标题权重更高
        if (node.tags.some(t => t.toLowerCase().includes(kw))) score += 1.5
      }
      return { node, score }
    })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)

    if (scored.length === 0) {
      return { success: true, output: `未找到与"${query}"相关的记忆节点。` }
    }

    const results = scored.map((s, i) => {
      const n = s.node
      const tags = n.tags.length > 0 ? ` [标签: ${n.tags.join(', ')}]` : ''
      const content = n.content.length > 200 ? n.content.substring(0, 200) + '...' : n.content
      return `${i + 1}. 【${n.title}】${tags}\n   ${content}`
    })

    return { success: true, output: `找到 ${scored.length} 个相关记忆节点:\n\n${results.join('\n\n')}` }
  } catch (err) {
    return { success: false, output: '', error: `搜索失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
