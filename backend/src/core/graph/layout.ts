/**
 * Sugiyama 风格 DAG 分层布局算法
 * 可用于：学习引擎自动布局 / 全图重新规整
 */

export interface LayoutNode {
  id: string
  positionX: number
  positionY: number
  type?: string
}

export interface LayoutEdge {
  sourceId: string
  targetId: string
}

export interface LayoutOptions {
  /** 层间水平间距，默认 300 */
  layerGapX?: number
  /** 层内垂直间距，默认 160 */
  nodeGapY?: number
  /** 布局起始 X，默认 100 */
  originX?: number
  /** 布局起始 Y（垂直居中基准），默认 400 */
  originY?: number
}

/**
 * 对一组节点和边执行 Sugiyama 分层布局，返回每个节点的新坐标
 */
export function sugiyamaLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options?: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  const LAYER_GAP_X = options?.layerGapX ?? 300
  const NODE_GAP_Y = options?.nodeGapY ?? 160
  const ORIGIN_X = options?.originX ?? 100
  const ORIGIN_Y = options?.originY ?? 400

  const ids = nodes.map(n => n.id)
  const idSet = new Set(ids)

  // ── 构建邻接表和入度 ──
  const adj = new Map<string, string[]>()
  const revAdj = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const id of ids) {
    adj.set(id, [])
    revAdj.set(id, [])
    inDegree.set(id, 0)
  }

  for (const e of edges) {
    if (idSet.has(e.sourceId) && idSet.has(e.targetId)) {
      adj.get(e.sourceId)!.push(e.targetId)
      revAdj.get(e.targetId)!.push(e.sourceId)
      inDegree.set(e.targetId, (inDegree.get(e.targetId) ?? 0) + 1)
    }
  }

  // ── 1. 分层：最长路径法 ──
  const layer = new Map<string, number>()
  for (const id of ids) layer.set(id, 0)

  const roots: string[] = []
  for (const id of ids) {
    if ((inDegree.get(id) ?? 0) === 0) roots.push(id)
  }
  if (roots.length === 0) roots.push(ids[0])

  const queue: string[] = [...roots]
  const visited = new Set<string>()
  const remaining = new Map(inDegree)

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (visited.has(curr)) continue
    visited.add(curr)

    for (const next of (adj.get(curr) ?? [])) {
      const candidateLayer = (layer.get(curr) ?? 0) + 1
      if (candidateLayer > (layer.get(next) ?? 0)) {
        layer.set(next, candidateLayer)
      }
      remaining.set(next, (remaining.get(next) ?? 1) - 1)
      if ((remaining.get(next) ?? 0) <= 0) {
        queue.push(next)
      }
    }
  }

  // 处理未访问节点（环中的节点）
  for (const id of ids) {
    if (!visited.has(id)) visited.add(id)
  }

  // ── 2. 按层分组 ──
  const maxLayer = Math.max(...[...layer.values()], 0)
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const id of ids) {
    layers[layer.get(id) ?? 0].push(id)
  }

  // ── 3. 重心法层内排序 ──
  for (let l = 1; l <= maxLayer; l++) {
    const prevOrder = new Map<string, number>()
    layers[l - 1].forEach((id, idx) => prevOrder.set(id, idx))

    layers[l].sort((a, b) => {
      const parentsA = (revAdj.get(a) ?? []).filter(p => prevOrder.has(p))
      const parentsB = (revAdj.get(b) ?? []).filter(p => prevOrder.has(p))

      const barycenterA = parentsA.length > 0
        ? parentsA.reduce((sum, p) => sum + (prevOrder.get(p) ?? 0), 0) / parentsA.length
        : 0
      const barycenterB = parentsB.length > 0
        ? parentsB.reduce((sum, p) => sum + (prevOrder.get(p) ?? 0), 0) / parentsB.length
        : 0

      return barycenterA - barycenterB
    })
  }

  // ── 4. 坐标计算 ──
  for (let l = 0; l <= maxLayer; l++) {
    const nodesInLayer = layers[l]
    const layerHeight = (nodesInLayer.length - 1) * NODE_GAP_Y
    const startY = ORIGIN_Y - layerHeight / 2

    for (let i = 0; i < nodesInLayer.length; i++) {
      positions.set(nodesInLayer[i], {
        x: ORIGIN_X + l * LAYER_GAP_X,
        y: startY + i * NODE_GAP_Y,
      })
    }
  }

  return positions
}
