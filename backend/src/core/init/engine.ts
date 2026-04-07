import { ScholarRole } from '../../llm/roles/scholar.js'
import { sugiyamaLayout } from '../graph/layout.js'
import { getNodesByBrainId, getNodeById, createNode } from '../../db/nodes.js'
import { createEdge, getEdgesBySourceId } from '../../db/edges.js'
import { broadcast } from '../../ws/server.js'
import { scanProject } from './scanner.js'
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
 * 初始化项目图谱：扫描项目结构，调用 Scholar 生成知识节点图
 */
export async function initProjectGraph(brainId: string, projectPath: string): Promise<void> {
  // 1. 扫描项目
  broadcastProgress({ phase: 'analyzing', message: '正在扫描项目结构...' })

  const scan = scanProject(projectPath)

  if (!scan.tree && scan.files.length === 0) {
    broadcastProgress({ phase: 'error', message: '项目目录为空或无法读取' })
    return
  }

  // 2. 组装 prompt
  broadcastProgress({ phase: 'generating', message: '正在分析项目并生成知识图谱...' })

  const existingNodes = getNodesByBrainId(brainId)
  const existingSummary = existingNodes.map(n => ({
    id: n.id,
    title: n.title,
    type: n.type,
    tags: n.tags,
  }))

  const fileContents = scan.files
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n')

  const scholarInput = `你需要分析一个软件项目的结构，并生成知识图谱节点。

项目目录结构:
${scan.tree}

关键文件内容:
${fileContents}

已有节点:
${existingSummary.length > 0 ? JSON.stringify(existingSummary) : '无'}

请根据项目的实际架构，生成合理的知识节点和边。要求:
- 根据项目规模和复杂度自行决定合适的粒度（模块级、文件级或功能级）
- 每个节点代表项目中一个有意义的模块、组件或概念
- content 字段要详细描述该模块的职责、包含的关键文件和核心逻辑
- 边表示模块间的依赖/调用关系（A→B 表示 A 依赖或调用 B）
- tags 使用项目相关的技术标签（如框架名、语言、功能领域）
- confidence 根据模块的稳定性和重要性设定
- 节点数量控制在 5-15 个

请严格按以下 JSON 格式返回（不要包含 markdown 代码块或任何其他文字）:
{"nodes":[{"tempId":"n1","title":"节点标题","content":"详细描述","tags":["标签"],"confidence":0.9}],"edges":[{"sourceTempId":"n1","targetTempId":"n2","baseDifficulty":0.5,"difficultyTypes":["reasoning"],"difficultyTypeWeights":{"reasoning":1.0}}],"existingNodeEdges":[]}

difficultyTypes可选: computation, reasoning, creativity, retrieval, analysis, synthesis`

  const scholar = new ScholarRole()
  const result = await scholar.chat(scholarInput)

  // 3. 解析 JSON
  let parsed: ScholarResult
  try {
    parsed = JSON.parse(result.content)
  } catch {
    let cleaned = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        console.error('Init: Scholar JSON 解析失败:', jsonMatch[0].substring(0, 300))
        broadcastProgress({ phase: 'error', message: 'AI 返回格式错误，无法解析' })
        return
      }
    } else {
      console.error('Init: Scholar 返回内容:', result.content.substring(0, 500))
      broadcastProgress({ phase: 'error', message: 'AI 返回格式错误，无法解析' })
      return
    }
  }

  if (!parsed.nodes || parsed.nodes.length === 0) {
    broadcastProgress({ phase: 'error', message: 'AI 未生成任何节点' })
    return
  }

  const totalNodes = parsed.nodes.length
  const totalEdges = (parsed.edges?.length ?? 0) + (parsed.existingNodeEdges?.length ?? 0)

  // 4. 计算布局
  const positions = computeLayout(existingNodes, parsed)

  // 5. 创建节点
  broadcastProgress({
    phase: 'creating_nodes',
    message: `正在创建 ${totalNodes} 个项目节点...`,
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

  // 6. 创建新节点之间的边
  let edgesCreated = 0

  broadcastProgress({
    phase: 'creating_edges',
    message: `正在创建 ${totalEdges} 条连接...`,
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

  // 7. 创建与已有节点的边
  for (const e of (parsed.existingNodeEdges ?? [])) {
    const newNodeId = tempIdToRealId.get(e.newNodeTempId)
    if (!newNodeId) continue

    const existingNode = getNodeById(e.existingNodeId)
    if (!existingNode) continue

    const sourceId = e.direction === 'existing_to_new' ? e.existingNodeId : newNodeId
    const targetId = e.direction === 'existing_to_new' ? newNodeId : e.existingNodeId

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
  }

  // 8. 根节点连接到性格节点
  const personalityNode = existingNodes.find(n => n.type === 'personality')
  if (personalityNode) {
    const rootTempIds = findRootNodes(parsed)
    for (const tempId of rootTempIds) {
      const realId = tempIdToRealId.get(tempId)
      if (!realId) continue

      const personalityEdges = getEdgesBySourceId(personalityNode.id)
      if (personalityEdges.some(edge => edge.targetId === realId)) continue

      createEdge({
        sourceId: personalityNode.id,
        targetId: realId,
        baseDifficulty: 0.2,
        difficultyTypes: ['retrieval'],
        difficultyTypeWeights: { retrieval: 1.0 },
      })
      edgesCreated++
    }
  }

  // 9. 完成
  broadcastProgress({
    phase: 'done',
    message: `项目初始化完成！创建了 ${tempIdToRealId.size} 个节点和 ${edgesCreated} 条连接`,
    nodesCreated: tempIdToRealId.size,
    edgesCreated,
    totalNodes,
    totalEdges: edgesCreated,
  })

  broadcast('graph_update', {})
}

function computeLayout(
  existingNodes: Array<{ id: string; positionX: number; positionY: number; type: string }>,
  parsed: ScholarResult,
): Map<string, { x: number; y: number }> {
  let anchorX = 300
  let anchorY = 200

  const personalityNode = existingNodes.find(n => n.type === 'personality')

  if (personalityNode) {
    anchorX = personalityNode.positionX + 300
    anchorY = personalityNode.positionY
  } else if (existingNodes.length > 0) {
    const maxX = Math.max(...existingNodes.map(n => n.positionX))
    anchorX = maxX + 300
    anchorY = existingNodes[0].positionY
  }

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

function findRootNodes(parsed: ScholarResult): string[] {
  const tempIds = new Set(parsed.nodes.map(n => n.tempId))
  const hasIncoming = new Set<string>()

  for (const e of (parsed.edges ?? [])) {
    if (tempIds.has(e.targetTempId)) {
      hasIncoming.add(e.targetTempId)
    }
  }

  for (const e of (parsed.existingNodeEdges ?? [])) {
    if (e.direction === 'existing_to_new' && tempIds.has(e.newNodeTempId)) {
      hasIncoming.add(e.newNodeTempId)
    }
  }

  return parsed.nodes
    .filter(n => !hasIncoming.has(n.tempId))
    .map(n => n.tempId)
}
