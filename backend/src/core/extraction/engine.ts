import { ScholarRole } from '../../llm/roles/scholar.js'
import { getNodesByBrainId, getNodeById, createNode } from '../../db/nodes.js'
import { createEdge, getEdgesBySourceId } from '../../db/edges.js'
import { sugiyamaLayout } from '../graph/layout.js'
import { broadcast } from '../../ws/server.js'
import type { DifficultyType, NodeExtractedPayload, ExtractionDonePayload } from '../../types/index.js'

/**
 * 归一化标题用于去重比较：去除空格、标点、转小写
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\-_.,;:!?'"()[\]{}\/\\]/g, '')
    .replace(/[，。；：！？、""''（）【】《》]/g, '')
    .trim()
}

/**
 * 自动从 Agent 输出中提取约束/知识节点，逐个广播给前端
 */
export async function autoExtractNodes(
  taskPrompt: string,
  agentResult: string,
  brainId: string
): Promise<void> {
  try {
    const existingNodes = getNodesByBrainId(brainId)
    const existingSummary = existingNodes.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
      tags: n.tags,
      contentPreview: n.content.substring(0, 80),
    }))

    const scholar = new ScholarRole()
    const scholarInput = `请从以下对话中提取值得记忆的知识点，生成知识节点。

用户任务: ${taskPrompt}

AI 回答:
${agentResult.substring(0, 2000)}

已有节点:
${existingSummary.length > 0 ? JSON.stringify(existingSummary) : '无'}

要求:
- 只在以下三种情况创建新节点：
  1. 对话中出现了新功能、新概念、新技术方案
  2. 用户提出了新的约束条件、规则或限制
  3. 讨论过程中产生了新的知识发现或洞察
- 以下情况不应创建节点：
  - 简单问答、闲聊、确认性回复
  - 已有节点已经覆盖的知识（注意检查已有节点列表，避免重复）
  - 临时性的调试信息、错误排查过程
- 如果对话中没有值得记忆的知识，必须返回空 nodes 数组
- 每个知识点一个节点，标题必须与已有节点的标题有明显区分
- 与已有节点有关联的要建 existingNodeEdges

请严格按以下 JSON 格式返回:
{"nodes":[{"tempId":"n1","title":"节点标题","content":"100-300字知识描述","tags":["标签"],"confidence":0.8}],"edges":[{"sourceTempId":"n1","targetTempId":"n2","baseDifficulty":0.5,"difficultyTypes":["reasoning"],"difficultyTypeWeights":{"reasoning":1.0}}],"existingNodeEdges":[${existingSummary.length > 0 ? '{"existingNodeId":"已有节点的id","newNodeTempId":"n1","direction":"existing_to_new","baseDifficulty":0.3,"difficultyTypes":["retrieval"],"difficultyTypeWeights":{"retrieval":1.0}}' : ''}]}`

    const result = await scholar.chat(scholarInput)

    let parsed: { nodes: any[]; edges: any[]; existingNodeEdges: any[] }
    try {
      parsed = JSON.parse(result.content)
    } catch {
      const cleaned = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        broadcast('extraction_done', { totalNodes: 0, totalEdges: 0 } satisfies ExtractionDonePayload)
        return
      }
    }

    if (!parsed.nodes || parsed.nodes.length === 0) {
      broadcast('extraction_done', { totalNodes: 0, totalEdges: 0 } satisfies ExtractionDonePayload)
      return
    }

    // 计算布局
    const layoutNodes = parsed.nodes.map((n: any) => ({ id: n.tempId, positionX: 0, positionY: 0 }))
    const layoutEdges = (parsed.edges ?? []).map((e: any) => ({ sourceId: e.sourceTempId, targetId: e.targetTempId }))

    let originX = 300, originY = 200
    const personalityNode = existingNodes.find(n => n.type === 'personality')
    if (parsed.existingNodeEdges?.length) {
      const refIds = [...new Set(parsed.existingNodeEdges.map((e: any) => e.existingNodeId))]
      const anchors = refIds.map((id: string) => existingNodes.find(n => n.id === id)).filter(Boolean) as typeof existingNodes
      if (anchors.length > 0) {
        originX = Math.max(...anchors.map(n => n.positionX)) + 300
        originY = anchors.reduce((s, n) => s + n.positionY, 0) / anchors.length
      }
    } else if (personalityNode) {
      originX = personalityNode.positionX + 300
      originY = personalityNode.positionY
    } else if (existingNodes.length > 0) {
      originX = Math.max(...existingNodes.map(n => n.positionX)) + 300
      originY = existingNodes[0].positionY
    }

    const positions = sugiyamaLayout(layoutNodes, layoutEdges, { originX, originY })

    // 逐个创建节点并广播（带标题去重）
    const tempIdToRealId = new Map<string, string>()
    const existingTitlesNormalized = existingNodes.map(n => normalizeTitle(n.title))

    for (let i = 0; i < parsed.nodes.length; i++) {
      const n = parsed.nodes[i]

      // 标题去重：与已有节点标题归一化比较
      const newTitleNorm = normalizeTitle(n.title)
      const isDuplicate = existingTitlesNormalized.some(existing =>
        existing === newTitleNorm || existing.includes(newTitleNorm) || newTitleNorm.includes(existing)
      )
      if (isDuplicate) {
        console.log(`[extraction] 跳过重复节点: "${n.title}"`)
        continue
      }

      // 也检查本批次内的重复
      const batchTitles = Array.from(tempIdToRealId.keys())
        .map(tid => parsed.nodes.find((pn: any) => pn.tempId === tid)?.title)
        .filter(Boolean)
        .map((t: string) => normalizeTitle(t))
      if (batchTitles.some((bt: string) => bt === newTitleNorm || bt.includes(newTitleNorm) || newTitleNorm.includes(bt))) {
        console.log(`[extraction] 跳过批次内重复节点: "${n.title}"`)
        continue
      }

      const pos = positions.get(n.tempId) ?? { x: originX + i * 250, y: originY }
      const created = createNode({
        brainId,
        type: 'memory',
        title: n.title,
        content: n.content,
        tags: n.tags ?? [],
        confidence: n.confidence ?? 0.8,
        positionX: pos.x,
        positionY: pos.y,
      })
      tempIdToRealId.set(n.tempId, created.id)

      // 每创建一个节点就广播
      broadcast('node_extracted', {
        nodeId: created.id,
        title: created.title,
        contentPreview: created.content.substring(0, 100),
        tags: created.tags,
        confidence: created.confidence,
      } satisfies NodeExtractedPayload)
    }

    // 创建新节点之间的边
    let edgesCreated = 0
    for (const e of (parsed.edges ?? [])) {
      const sourceId = tempIdToRealId.get(e.sourceTempId)
      const targetId = tempIdToRealId.get(e.targetTempId)
      if (!sourceId || !targetId) continue
      createEdge({
        sourceId,
        targetId,
        baseDifficulty: e.baseDifficulty ?? 0.5,
        difficultyTypes: e.difficultyTypes ?? ['reasoning'],
        difficultyTypeWeights: e.difficultyTypeWeights ?? { reasoning: 1.0 },
      })
      edgesCreated++
    }

    // 创建与已有节点的边
    for (const e of (parsed.existingNodeEdges ?? [])) {
      const newNodeId = tempIdToRealId.get(e.newNodeTempId)
      if (!newNodeId) continue
      const existingNode = getNodeById(e.existingNodeId)
      if (!existingNode) continue
      const sourceId = e.direction === 'existing_to_new' ? e.existingNodeId : newNodeId
      const targetId = e.direction === 'existing_to_new' ? newNodeId : e.existingNodeId
      const existing = getEdgesBySourceId(sourceId)
      if (existing.some(edge => edge.targetId === targetId)) continue
      createEdge({
        sourceId,
        targetId,
        baseDifficulty: e.baseDifficulty ?? 0.4,
        difficultyTypes: e.difficultyTypes ?? ['retrieval'],
        difficultyTypeWeights: e.difficultyTypeWeights ?? { retrieval: 1.0 },
      })
      edgesCreated++
    }

    // 连接到性格节点
    if (personalityNode) {
      const newRootIds = parsed.nodes
        .filter((n: any) => !(parsed.edges ?? []).some((e: any) => e.targetTempId === n.tempId))
        .filter((n: any) => !(parsed.existingNodeEdges ?? []).some((e: any) => e.direction === 'existing_to_new' && e.newNodeTempId === n.tempId))
        .map((n: any) => tempIdToRealId.get(n.tempId))
        .filter(Boolean) as string[]

      for (const realId of newRootIds) {
        const personalityEdges = getEdgesBySourceId(personalityNode.id)
        if (personalityEdges.some(edge => edge.targetId === realId)) continue
        createEdge({
          sourceId: personalityNode.id,
          targetId: realId,
          baseDifficulty: 0.2,
          difficultyTypes: ['retrieval'] as DifficultyType[],
          difficultyTypeWeights: { retrieval: 1.0 },
        })
        edgesCreated++
      }
    }

    // 广播完成 + 刷新图谱
    broadcast('extraction_done', {
      totalNodes: tempIdToRealId.size,
      totalEdges: edgesCreated,
    } satisfies ExtractionDonePayload)
    broadcast('graph_update', {})
  } catch (err) {
    console.error('Auto extraction error:', err)
    broadcast('error', { message: `自动提取失败: ${err instanceof Error ? err.message : String(err)}` })
  }
}
