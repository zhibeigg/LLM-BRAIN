import { EvaluatorRole } from '../../llm/roles/evaluator.js'
import { createNode, getNodeById, getAllNodes } from '../../db/nodes.js'
import { createEdge, getAllEdges, updateEdge } from '../../db/edges.js'
import { broadcast } from '../../ws/server.js'
import type { EvolutionUpdatePayload, DifficultyType } from '../../types/index.js'

/**
 * 从 Agent 结果中蒸馏核心结论，创建新记忆节点并建立边关系
 */
export async function distillAndEvolve(
  taskPrompt: string,
  agentResult: string,
  pathNodeIds: string[],
  personalityLabel: string,
  brainId: string
): Promise<void> {
  // 1. 蒸馏核心结论
  const content = agentResult.substring(0, 500)
  const title = taskPrompt.substring(0, 50) + '的结论'

  // 2. 计算新节点位置：在最后一个路径节点附近随机偏移
  let posX = 0
  let posY = 0
  const lastNodeId = pathNodeIds[pathNodeIds.length - 1]
  if (lastNodeId) {
    const lastNode = getNodeById(lastNodeId)
    if (lastNode) {
      posX = lastNode.positionX + (Math.random() - 0.5) * 200
      posY = lastNode.positionY + (Math.random() - 0.5) * 200
    }
  }

  // 3. 创建新记忆节点
  const newNode = createNode({
    brainId,
    type: 'memory',
    title,
    content,
    tags: ['auto-generated'],
    confidence: 0.6,
    personalityLabel,
    sourcePathId: pathNodeIds.join(','),
    positionX: posX,
    positionY: posY,
  })

  // 4. 用 Evaluator 评估新边的难度
  const updatedEdges: EvolutionUpdatePayload['updatedEdges'] = []
  const newEdges: EvolutionUpdatePayload['newEdges'] = []

  if (lastNodeId) {
    const sourceNode = getNodeById(lastNodeId)
    if (sourceNode) {
      const evaluator = new EvaluatorRole()
      const evalInput = JSON.stringify({
        sourceNode: {
          id: sourceNode.id,
          title: sourceNode.title,
          content: sourceNode.content.substring(0, 200),
          type: sourceNode.type,
        },
        targetNode: {
          id: newNode.id,
          title: newNode.title,
          content: newNode.content.substring(0, 200),
          type: newNode.type,
        },
        relationship: `从"${sourceNode.title}"到自动蒸馏的结论"${newNode.title}"`,
      })

      const evalResult = await evaluator.chat(evalInput)

      let baseDifficulty = 0.5
      let difficultyTypes: string[] = ['reasoning']
      let difficultyTypeWeights: Record<string, number> = { reasoning: 1.0 }

      try {
        const parsed = JSON.parse(evalResult.content)
        baseDifficulty = parsed.baseDifficulty ?? 0.5
        difficultyTypes = parsed.difficultyTypes ?? ['reasoning']
        difficultyTypeWeights = parsed.difficultyTypeWeights ?? { reasoning: 1.0 }
      } catch {
        // 解析失败使用默认值
      }

      const edge = createEdge({
        sourceId: lastNodeId,
        targetId: newNode.id,
        baseDifficulty,
        difficultyTypes: difficultyTypes as DifficultyType[],
        difficultyTypeWeights,
      })

      newEdges.push({ sourceId: edge.sourceId, targetId: edge.targetId })
    }
  }

  // 5. 广播 evolution_update
  const payload: EvolutionUpdatePayload = {
    newNodeId: newNode.id,
    updatedEdges,
    newEdges,
  }
  broadcast('evolution_update', payload)
}

/**
 * 对超过7天未使用的边按对数衰减提高基础难度
 */
export function decayUnusedEdges(): void {
  const edges = getAllEdges()
  const now = Date.now()
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

  const updatedEdges: EvolutionUpdatePayload['updatedEdges'] = []

  for (const edge of edges) {
    const lastUsed = edge.lastUsedAt ?? edge.createdAt
    const elapsed = now - lastUsed
    if (elapsed <= SEVEN_DAYS_MS) continue

    const daysSinceUse = elapsed / (24 * 60 * 60 * 1000)
    const decayFactor = 1 + 0.01 * Math.log(daysSinceUse / 7)
    const newDifficulty = Math.min(1.0, edge.baseDifficulty * decayFactor)

    if (newDifficulty !== edge.baseDifficulty) {
      updateEdge(edge.id, { baseDifficulty: newDifficulty })
      updatedEdges.push({ edgeId: edge.id, newBaseDifficulty: newDifficulty })
    }
  }

  if (updatedEdges.length > 0) {
    const payload: EvolutionUpdatePayload = {
      updatedEdges,
      newEdges: [],
    }
    broadcast('evolution_update', payload)
  }
}
