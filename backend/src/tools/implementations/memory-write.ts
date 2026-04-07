import type { ToolResult, ToolContext } from '../../types/index.js'
import { createNode } from '../../db/nodes.js'

/**
 * 记忆写入工具 — 向当前大脑的记忆图谱中添加新节点
 */
export async function executeMemoryWrite(
  args: { title: string; content: string; tags?: string[] },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const { title, content } = args
    if (!title || !content) {
      return { success: false, output: '', error: '缺少 title 或 content' }
    }

    const node = createNode({
      brainId: ctx.brainId,
      type: 'memory',
      title,
      content,
      tags: args.tags ?? [],
      confidence: 0.7,
      positionX: Math.random() * 800,
      positionY: Math.random() * 600,
    })

    return {
      success: true,
      output: `已创建记忆节点:\n- ID: ${node.id}\n- 标题: ${node.title}\n- 标签: ${node.tags.join(', ') || '无'}`,
    }
  } catch (err) {
    return { success: false, output: '', error: `写入失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
