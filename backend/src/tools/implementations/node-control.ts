import type { ToolResult, ToolContext } from '../../types/index.js'
import { getNodesByBrainId, getNodeById, updateNode, deleteNode } from '../../db/nodes.js'
import { getEdgesBySourceId, getEdgesByTargetId, deleteEdge } from '../../db/edges.js'
import { broadcast } from '../../ws/server.js'

/**
 * 节点编辑工具 — 修改记忆节点的标题、内容、标签、置信度
 */
export async function executeNodeEdit(
  args: { nodeId: string; title?: string; content?: string; tags?: string[]; confidence?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { nodeId } = args
    if (!nodeId) return { success: false, output: '', error: '缺少 nodeId' }

    const node = getNodeById(nodeId)
    if (!node) return { success: false, output: '', error: `节点不存在: ${nodeId}` }
    if (node.brainId !== ctx.brainId) return { success: false, output: '', error: '节点不属于当前大脑' }

    const updates: Record<string, unknown> = {}
    if (args.title !== undefined) updates.title = args.title
    if (args.content !== undefined) updates.content = args.content
    if (args.tags !== undefined) updates.tags = args.tags
    if (args.confidence !== undefined) updates.confidence = Math.max(0, Math.min(1, args.confidence))

    if (Object.keys(updates).length === 0) {
      return { success: false, output: '', error: '没有提供任何要修改的字段' }
    }

    const updated = updateNode(nodeId, updates)
    if (!updated) return { success: false, output: '', error: '更新失败' }

    broadcast('graph_update', { type: 'node_updated', nodeId })

    const fields = Object.keys(updates).join(', ')
    return { success: true, output: `已更新节点「${updated.title}」的字段: ${fields}` }
  } catch (err) {
    return { success: false, output: '', error: `编辑失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 节点删除工具 — 删除指定节点及其关联的边
 */
export async function executeNodeDelete(
  args: { nodeId?: string; query?: string; deleteAll?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    // 模式 1: 清除当前大脑所有节点
    if (args.deleteAll) {
      const nodes = getNodesByBrainId(ctx.brainId)
      if (nodes.length === 0) return { success: true, output: '当前大脑没有任何节点。' }

      let deletedNodes = 0
      let deletedEdges = 0
      for (const node of nodes) {
        // 先删关联边
        const srcEdges = getEdgesBySourceId(node.id)
        const tgtEdges = getEdgesByTargetId(node.id)
        for (const e of [...srcEdges, ...tgtEdges]) {
          if (deleteEdge(e.id)) deletedEdges++
        }
        if (deleteNode(node.id)) deletedNodes++
      }

      broadcast('graph_update', { type: 'bulk_delete', brainId: ctx.brainId })
      return { success: true, output: `已清除当前大脑所有节点: 删除 ${deletedNodes} 个节点, ${deletedEdges} 条边` }
    }

    // 模式 2: 按关键词搜索并删除
    if (args.query) {
      const nodes = getNodesByBrainId(ctx.brainId)
      const keywords = args.query.toLowerCase().split(/\s+/)
      const matched = nodes.filter(n => {
        const text = `${n.title} ${n.content} ${n.tags.join(' ')}`.toLowerCase()
        return keywords.some(kw => text.includes(kw))
      })

      if (matched.length === 0) return { success: true, output: `未找到匹配「${args.query}」的节点。` }

      let deletedNodes = 0
      let deletedEdges = 0
      for (const node of matched) {
        const srcEdges = getEdgesBySourceId(node.id)
        const tgtEdges = getEdgesByTargetId(node.id)
        for (const e of [...srcEdges, ...tgtEdges]) {
          if (deleteEdge(e.id)) deletedEdges++
        }
        if (deleteNode(node.id)) deletedNodes++
      }

      broadcast('graph_update', { type: 'bulk_delete', brainId: ctx.brainId })
      return { success: true, output: `已删除匹配「${args.query}」的 ${deletedNodes} 个节点和 ${deletedEdges} 条边` }
    }

    // 模式 3: 按 ID 删除单个节点
    if (args.nodeId) {
      const node = getNodeById(args.nodeId)
      if (!node) return { success: false, output: '', error: `节点不存在: ${args.nodeId}` }
      if (node.brainId !== ctx.brainId) return { success: false, output: '', error: '节点不属于当前大脑' }

      let deletedEdges = 0
      const srcEdges = getEdgesBySourceId(node.id)
      const tgtEdges = getEdgesByTargetId(node.id)
      for (const e of [...srcEdges, ...tgtEdges]) {
        if (deleteEdge(e.id)) deletedEdges++
      }
      deleteNode(node.id)

      broadcast('graph_update', { type: 'node_deleted', nodeId: node.id })
      return { success: true, output: `已删除节点「${node.title}」及 ${deletedEdges} 条关联边` }
    }

    return { success: false, output: '', error: '需要提供 nodeId、query 或 deleteAll 参数' }
  } catch (err) {
    return { success: false, output: '', error: `删除失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 节点列表工具 — 列出当前大脑的所有节点概要
 */
export async function executeNodeList(
  args: { type?: string; limit?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    let nodes = getNodesByBrainId(ctx.brainId)
    if (args.type) nodes = nodes.filter(n => n.type === args.type)

    const limit = args.limit ?? 20
    const total = nodes.length
    const listed = nodes.slice(0, limit)

    if (listed.length === 0) return { success: true, output: '当前大脑没有节点。' }

    const lines = listed.map((n, i) =>
      `${i + 1}. [${n.id.slice(0, 8)}] 「${n.title}」 (${n.type}) 标签: ${n.tags.join(', ') || '无'} 置信度: ${n.confidence.toFixed(2)}`
    )

    const footer = total > limit ? `\n\n... 共 ${total} 个节点，仅显示前 ${limit} 个` : `\n\n共 ${total} 个节点`
    return { success: true, output: lines.join('\n') + footer }
  } catch (err) {
    return { success: false, output: '', error: `列表失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
