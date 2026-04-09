import { ScholarRole } from '../../llm/roles/scholar.js'
import { getRoleConfig } from '../../db/llm-config.js'
import { sugiyamaLayout } from '../graph/layout.js'
import { getNodesByBrainId, getNodeById, createNode } from '../../db/nodes.js'
import { createEdge, getEdgesBySourceId } from '../../db/edges.js'
import { broadcast } from '../../ws/server.js'
import type { DifficultyType, LearningProgressPayload } from '../../types/index.js'

interface ScholarNode {
  tempId: string
  title: string
  content: string
  tags: string[]
  confidence: number
}

interface ScholarEdge {
  sourceTempId: string
  targetTempId: string
  baseDifficulty: number
  difficultyTypes: DifficultyType[]
  difficultyTypeWeights: Record<string, number>
}

interface ScholarExistingEdge {
  existingNodeId: string
  newNodeTempId: string
  direction: 'existing_to_new' | 'new_to_existing'
  baseDifficulty: number
  difficultyTypes: DifficultyType[]
  difficultyTypeWeights: Record<string, number>
}

interface ScholarResult {
  nodes: ScholarNode[]
  edges: ScholarEdge[]
  existingNodeEdges: ScholarExistingEdge[]
}

function broadcastProgress(payload: LearningProgressPayload) {
  broadcast('learning_progress', payload)
}

/**
 * 自动学习：调用 Scholar LLM 生成知识节点和边，自动连入图谱
 */
export async function learnTopic(topic: string, brainId: string): Promise<void> {
  const scholar = new ScholarRole()

  // 1. 加载已有节点
  broadcastProgress({ phase: 'analyzing', message: `正在分析「${topic}」...` })

  const existingNodes = getNodesByBrainId(brainId)
  const existingSummary = existingNodes.map(n => ({
    id: n.id,
    title: n.title,
    type: n.type,
    tags: n.tags,
    contentPreview: n.content.substring(0, 80),
  }))

  // 2. 调用 Scholar LLM
  broadcastProgress({ phase: 'generating', message: '正在生成知识结构...' })

  const scholarInput = `学习主题: ${topic}

已有节点:
${existingSummary.length > 0 ? JSON.stringify(existingSummary) : '无'}

请严格按以下 JSON 格式返回（不要包含 markdown 代码块或任何其他文字）:
{"nodes":[{"tempId":"n1","title":"节点标题","content":"100-300字知识描述","tags":["标签"],"confidence":0.9},{"tempId":"n2","title":"...","content":"...","tags":["..."],"confidence":0.8}],"edges":[{"sourceTempId":"n1","targetTempId":"n2","baseDifficulty":0.5,"difficultyTypes":["reasoning"],"difficultyTypeWeights":{"reasoning":1.0}}],"existingNodeEdges":[${existingSummary.length > 0 ? '{"existingNodeId":"已有节点的id","newNodeTempId":"n1","direction":"existing_to_new","baseDifficulty":0.3,"difficultyTypes":["retrieval"],"difficultyTypeWeights":{"retrieval":1.0}}' : ''}]}

要求:
- nodes: 3-8个知识节点，tempId用n1,n2,n3...
- edges: 节点间的知识依赖关系（A→B表示理解A有助于理解B）
- existingNodeEdges: 新节点与已有节点的关联（如果有的话）
- difficultyTypes可选: computation, reasoning, creativity, retrieval, analysis, synthesis
- confidence: 0.0-1.0，公理给高值，推论给低值
- 只返回JSON，不要任何其他内容`

  const scholarStartTime = Date.now()
  const result = await scholar.chat(scholarInput)
  const scholarLatency = Date.now() - scholarStartTime
  const scholarModel = getRoleConfig('scholar')?.model

  // 推送 Scholar LLM 的溯源信息
  const scholarTrace = {
    model: scholarModel,
    prompt: scholarInput,
    rawResponse: result.content || '(空响应)',
    latencyMs: scholarLatency,
    ...(result.usage ? { tokenUsage: { prompt: result.usage.promptTokens, completion: result.usage.completionTokens } } : {}),
  }

  broadcastProgress({
    phase: 'generating',
    message: result.content ? '知识结构生成完成，正在解析...' : 'Scholar LLM 返回空内容',
    trace: scholarTrace,
  })

  // 空内容检测
  if (!result.content || result.content.trim() === '') {
    throw new Error(`Scholar LLM 返回空内容 (model: ${scholarModel || '未知'})，请检查 LLM 提供商配置和 API Key`)
  }

  let parsed: ScholarResult
  try {
    parsed = JSON.parse(result.content)
  } catch {
    // 尝试提取 JSON：先去掉 markdown 代码块
    let cleaned = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        console.error('Scholar JSON 提取后仍无法解析:', jsonMatch[0].substring(0, 300))
        throw new Error('Scholar 返回格式错误，无法解析')
      }
    } else {
      console.error('Scholar 返回内容（前500字）:', result.content.substring(0, 500))
      throw new Error('Scholar 返回格式错误，无法解析')
    }
  }

  if (!parsed.nodes || parsed.nodes.length === 0) {
    throw new Error('Scholar 未生成任何知识节点')
  }

  const totalNodes = parsed.nodes.length
  const totalEdges = (parsed.edges?.length ?? 0) + (parsed.existingNodeEdges?.length ?? 0)

  // 3. 计算布局位置
  const positions = computeLayout(existingNodes, parsed)

  // 4. 批量创建节点
  broadcastProgress({
    phase: 'creating_nodes',
    message: `正在创建 ${totalNodes} 个知识节点...`,
    nodesCreated: 0,
    totalNodes,
  })

  const tempIdToRealId = new Map<string, string>()

  for (let i = 0; i < parsed.nodes.length; i++) {
    const n = parsed.nodes[i]
    const pos = positions.get(n.tempId) ?? { x: 300 + i * 250, y: 200 }

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

    broadcastProgress({
      phase: 'creating_nodes',
      message: `已创建节点「${n.title}」`,
      nodesCreated: i + 1,
      totalNodes,
    })
  }

  // 5. 创建新节点之间的边
  let edgesCreated = 0

  broadcastProgress({
    phase: 'creating_edges',
    message: `正在创建 ${totalEdges} 条知识连接...`,
    edgesCreated: 0,
    totalEdges,
  })

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

    broadcastProgress({
      phase: 'creating_edges',
      message: `已创建连接 (${edgesCreated}/${totalEdges})`,
      edgesCreated,
      totalEdges,
    })
  }

  // 6. 创建与已有节点的边
  for (const e of (parsed.existingNodeEdges ?? [])) {
    const newNodeId = tempIdToRealId.get(e.newNodeTempId)
    if (!newNodeId) continue

    // 验证已有节点确实存在
    const existingNode = getNodeById(e.existingNodeId)
    if (!existingNode) continue

    const sourceId = e.direction === 'existing_to_new' ? e.existingNodeId : newNodeId
    const targetId = e.direction === 'existing_to_new' ? newNodeId : e.existingNodeId

    // 避免重复边
    const existingEdges = getEdgesBySourceId(sourceId)
    if (existingEdges.some(edge => edge.targetId === targetId)) continue

    createEdge({
      sourceId,
      targetId,
      baseDifficulty: e.baseDifficulty ?? 0.4,
      difficultyTypes: e.difficultyTypes ?? ['retrieval'],
      difficultyTypeWeights: e.difficultyTypeWeights ?? { retrieval: 1.0 },
    })
    edgesCreated++

    broadcastProgress({
      phase: 'creating_edges',
      message: `已连接到已有节点「${existingNode.title}」`,
      edgesCreated,
      totalEdges,
    })
  }

  // 7. 确保新知识链的根节点连接到性格节点（唯一入口）
  const personalityNode = existingNodes.find(n => n.type === 'personality')
  if (personalityNode) {
    // 找到拓扑排序中入度为 0 的新节点（知识链的起点）
    const rootTempIds = findRootNodes(parsed)
    for (const tempId of rootTempIds) {
      const realId = tempIdToRealId.get(tempId)
      if (!realId) continue

      // 检查是否已经有从性格节点到该节点的边
      const personalityEdges = getEdgesBySourceId(personalityNode.id)
      if (personalityEdges.some(edge => edge.targetId === realId)) continue

      // 也检查是否已经有从其他已有节点到该节点的边（LLM 可能已经安排了）
      const allExistingEdgesToRoot = existingNodes
        .flatMap(n => getEdgesBySourceId(n.id))
        .some(edge => edge.targetId === realId)
      if (allExistingEdgesToRoot) continue

      createEdge({
        sourceId: personalityNode.id,
        targetId: realId,
        baseDifficulty: 0.2,
        difficultyTypes: ['retrieval'],
        difficultyTypeWeights: { retrieval: 1.0 },
      })
      edgesCreated++

      const rootNode = getNodeById(realId)
      broadcastProgress({
        phase: 'creating_edges',
        message: `已连接性格节点 → 「${rootNode?.title ?? realId}」`,
        edgesCreated,
        totalEdges: edgesCreated,
      })
    }
  }

  // 7. 完成，通知前端刷新图谱
  broadcastProgress({
    phase: 'done',
    message: `学习完成！创建了 ${tempIdToRealId.size} 个节点和 ${edgesCreated} 条连接`,
    nodesCreated: tempIdToRealId.size,
    edgesCreated,
    totalNodes,
    totalEdges: edgesCreated,
  })

  broadcast('graph_update', {})
}

/**
 * 计算新节点的布局位置（委托给通用 Sugiyama 布局）
 * 在已有节点右侧锚定，新节点内部按 DAG 分层排列
 */
function computeLayout(
  existingNodes: Array<{ id: string; positionX: number; positionY: number; type: string }>,
  parsed: ScholarResult,
): Map<string, { x: number; y: number }> {
  // 计算锚点
  let anchorX = 300
  let anchorY = 200

  const personalityNode = existingNodes.find(n => n.type === 'personality')

  if (parsed.existingNodeEdges?.length) {
    const referencedIds = [...new Set(parsed.existingNodeEdges.map(e => e.existingNodeId))]
    const anchors = referencedIds
      .map(id => existingNodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n != null)

    if (anchors.length > 0) {
      anchorX = Math.max(...anchors.map(n => n.positionX)) + 300
      anchorY = anchors.reduce((sum, n) => sum + n.positionY, 0) / anchors.length
    }
  } else if (personalityNode) {
    anchorX = personalityNode.positionX + 300
    anchorY = personalityNode.positionY
  } else if (existingNodes.length > 0) {
    const maxX = Math.max(...existingNodes.map(n => n.positionX))
    anchorX = maxX + 300
    anchorY = existingNodes[0].positionY
  }

  // 将 Scholar 的 tempId 格式转为通用布局格式
  const layoutNodes = parsed.nodes.map(n => ({
    id: n.tempId,
    positionX: 0,
    positionY: 0,
  }))
  const layoutEdges = (parsed.edges ?? []).map(e => ({
    sourceId: e.sourceTempId,
    targetId: e.targetTempId,
  }))

  return sugiyamaLayout(layoutNodes, layoutEdges, {
    originX: anchorX,
    originY: anchorY,
  })
}

/**
 * 找到新节点中入度为 0 的根节点（知识链的起点）
 * 这些节点需要连接到性格节点
 */
function findRootNodes(parsed: ScholarResult): string[] {
  const tempIds = new Set(parsed.nodes.map(n => n.tempId))
  const hasIncoming = new Set<string>()

  // 统计新节点之间的边
  for (const e of (parsed.edges ?? [])) {
    if (tempIds.has(e.targetTempId)) {
      hasIncoming.add(e.targetTempId)
    }
  }

  // 统计已有节点指向新节点的边
  for (const e of (parsed.existingNodeEdges ?? [])) {
    if (e.direction === 'existing_to_new' && tempIds.has(e.newNodeTempId)) {
      hasIncoming.add(e.newNodeTempId)
    }
  }

  // 没有入边的就是根节点
  return parsed.nodes
    .filter(n => !hasIncoming.has(n.tempId))
    .map(n => n.tempId)
}
