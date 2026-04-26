/**
 * 图谱布局 Web Worker
 * 实现力导向布局算法，避免阻塞主线程
 */

import type { MemoryNode, MemoryEdge } from '../types'

/** Worker消息类型 */
export interface LayoutWorkerMessage {
  type: 'start' | 'stop'
  nodes?: MemoryNode[]
  edges?: MemoryEdge[]
  options?: LayoutOptions
}

/** Worker响应消息 */
export interface LayoutWorkerResponse {
  type: 'progress' | 'complete' | 'error'
  nodes?: Array<{ id: string; x: number; y: number }>
  progress?: number
  error?: string
}

/** 布局配置选项 */
export interface LayoutOptions {
  /** 迭代次数 */
  iterations?: number
  /** 节点排斥力 */
  repulsion?: number
  /** 边吸引力 */
  attraction?: number
  /** 阻尼系数 (0-1)，控制收敛速度 */
  damping?: number
  /** 最大位移限制 */
  maxMove?: number
  /** 初始布局半径 */
  initialRadius?: number
  /** 是否启用多层级布局 */
  hierarchical?: boolean
  /** 层级之间的间距 */
  levelGap?: number
}

/** 默认配置 */
const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  iterations: 120,
  repulsion: 18000,
  attraction: 0.025,
  damping: 0.72,
  maxMove: 28,
  initialRadius: 420,
  hierarchical: true,
  levelGap: 340,
}

/** 节点布局状态 */
interface LayoutNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
  level?: number
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 112
const LAYER_GAP_X = 360
const NODE_GAP_Y = 190
const COMPONENT_GAP_Y = 260
const ORIGIN_X = 80
const ORIGIN_Y = 80

function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

/** 力导向布局算法核心类 */
class ForceDirectedLayout {
  private nodes: LayoutNode[] = []
  private nodeMap = new Map<string, LayoutNode>()
  private edges: MemoryEdge[] = []
  private options: Required<LayoutOptions>
  private running = false
  private animationFrameId: number | null = null

  constructor(options: LayoutOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * 初始化节点位置
   * 使用圆形分布初始化节点位置
   */
  private initializePositions(): void {
    const nodeCount = this.nodes.length
    if (nodeCount === 0) return

    // 计算初始布局边界
    const radius = this.options.initialRadius
    const centerX = radius
    const centerY = radius

    // 如果启用层级布局，按层级分布
    if (this.options.hierarchical) {
      this.initializeHierarchicalPositions(centerX, centerY, radius)
    } else {
      // 圆形分布
      this.nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodeCount
        const r = radius * Math.sqrt(i / nodeCount) // 对数螺旋分布，减少中心拥挤
        node.x = centerX + r * Math.cos(angle)
        node.y = centerY + r * Math.sin(angle)
        node.vx = 0
        node.vy = 0
      })
    }
  }

  /**
   * 层级布局初始化
   * 将节点按连接关系分层
   */
  private initializeHierarchicalPositions(centerX: number, centerY: number, radius: number): void {
    // 计算节点的层级（使用BFS从根节点开始）
    this.calculateNodeLevels()
    
    // 按层级分组
    const levelGroups = new Map<number, LayoutNode[]>()
    for (const node of this.nodes) {
      const level = node.level ?? 0
      if (!levelGroups.has(level)) {
        levelGroups.set(level, [])
      }
      levelGroups.get(level)!.push(node)
    }

    // 获取所有层级的最大值
    const maxLevel = Math.max(...Array.from(levelGroups.keys()))
    const levelGap = this.options.levelGap

    // 从中心开始，按层级向外分布
    levelGroups.forEach((nodesInLevel, level) => {
      const radiusForLevel = radius + level * levelGap
      const verticalOffset = (level - maxLevel / 2) * levelGap

      nodesInLevel.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodesInLevel.length
        node.x = centerX + radiusForLevel * Math.cos(angle)
        node.y = centerY + verticalOffset + radiusForLevel * Math.sin(angle) * 0.3 // 压扁垂直方向
        node.vx = 0
        node.vy = 0
      })
    })
  }

  /**
   * 计算节点的层级
   * 使用简化的BFS算法
   */
  private calculateNodeLevels(): void {
    // 构建邻接表
    const adjacency = new Map<string, string[]>()
    for (const node of this.nodes) {
      adjacency.set(node.id, [])
    }
    for (const edge of this.edges) {
      adjacency.get(edge.sourceId)?.push(edge.targetId)
      adjacency.get(edge.targetId)?.push(edge.sourceId)
    }

    // 找到根节点（出度最大的节点）
    let rootId = this.nodes[0]?.id ?? ''
    let maxDegree = 0
    for (const [nodeId, neighbors] of adjacency) {
      if (neighbors.length > maxDegree) {
        maxDegree = neighbors.length
        rootId = nodeId
      }
    }

    // BFS计算层级
    const levels = new Map<string, number>()
    const visited = new Set<string>()
    const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }]

    while (queue.length > 0) {
      const { id, level } = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      levels.set(id, level)

      for (const neighborId of adjacency.get(id) ?? []) {
        if (!visited.has(neighborId)) {
          queue.push({ id: neighborId, level: level + 1 })
        }
      }
    }

    // 处理未访问的节点
    for (const node of this.nodes) {
      if (!levels.has(node.id)) {
        levels.set(node.id, 0)
      }
      node.level = levels.get(node.id) ?? 0
    }
  }

  /**
   * 运行单次迭代
   */
  private iterate(): number {
    const { repulsion, attraction, damping, maxMove } = this.options

    // 排斥力截断距离：超过此距离的节点对跳过计算
    const CUTOFF_DIST = Math.sqrt(repulsion) * 3

    // 1. 计算排斥力（所有节点两两之间，带距离截断）
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const nodeA = this.nodes[i]
        const nodeB = this.nodes[j]

        const dx = nodeB.x - nodeA.x
        const dy = nodeB.y - nodeA.y

        // 快速距离截断：先用曼哈顿距离粗筛
        if (Math.abs(dx) > CUTOFF_DIST || Math.abs(dy) > CUTOFF_DIST) continue

        const distSq = dx * dx + dy * dy
        if (distSq > CUTOFF_DIST * CUTOFF_DIST) continue

        const dist = Math.sqrt(distSq) || 1

        // 库仑力：F = k / d^2
        const force = repulsion / (dist * dist)

        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        nodeA.vx -= fx
        nodeA.vy -= fy
        nodeB.vx += fx
        nodeB.vy += fy
      }
    }

    // 2. 计算吸引力（边连接的节点，使用 Map O(1) 查找）
    for (const edge of this.edges) {
      const source = this.nodeMap.get(edge.sourceId)
      const target = this.nodeMap.get(edge.targetId)
      if (!source || !target) continue

      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1

      // 弹簧力：F = k * d
      const force = attraction * dist

      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      source.vx += fx
      source.vy += fy
      target.vx -= fx
      target.vy -= fy
    }

    // 3. 应用阻尼并更新位置
    let totalMovement = 0
    for (const node of this.nodes) {
      node.vx *= damping
      node.vy *= damping

      // 限制最大位移
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
      if (speed > maxMove) {
        node.vx = (node.vx / speed) * maxMove
        node.vy = (node.vy / speed) * maxMove
      }

      node.x += node.vx
      node.y += node.vy
      totalMovement += speed
    }

    return totalMovement / this.nodes.length
  }

  /**
   * 计算稳定的分层布局。
   * 自动整理不使用纯力导向作为最终结果，避免节点被边吸引到一起造成重叠。
   */
  private computeStableHierarchicalLayout(): Array<{ id: string; x: number; y: number }> {
    const ids = this.nodes.map((node) => node.id)
    const idSet = new Set(ids)
    const nodeById = new Map(this.nodes.map((node) => [node.id, node]))
    const outgoing = new Map<string, string[]>()
    const incoming = new Map<string, string[]>()
    const undirected = new Map<string, string[]>()

    for (const id of ids) {
      outgoing.set(id, [])
      incoming.set(id, [])
      undirected.set(id, [])
    }

    for (const edge of this.edges) {
      if (!idSet.has(edge.sourceId) || !idSet.has(edge.targetId)) continue
      outgoing.get(edge.sourceId)?.push(edge.targetId)
      incoming.get(edge.targetId)?.push(edge.sourceId)
      undirected.get(edge.sourceId)?.push(edge.targetId)
      undirected.get(edge.targetId)?.push(edge.sourceId)
    }

    const components: string[][] = []
    const visited = new Set<string>()
    for (const id of ids) {
      if (visited.has(id)) continue
      const component: string[] = []
      const queue = [id]
      visited.add(id)

      while (queue.length > 0) {
        const current = queue.shift()!
        component.push(current)
        for (const next of undirected.get(current) ?? []) {
          if (visited.has(next)) continue
          visited.add(next)
          queue.push(next)
        }
      }

      components.push(component)
    }

    components.sort((a, b) => b.length - a.length)

    const positions: Array<{ id: string; x: number; y: number }> = []
    let componentTop = ORIGIN_Y

    for (const component of components) {
      const componentSet = new Set(component)
      const roots = component.filter((id) => (incoming.get(id) ?? []).filter((p) => componentSet.has(p)).length === 0)
      if (roots.length === 0) {
        roots.push(
          [...component].sort((a, b) => {
            const degreeA = (incoming.get(a)?.length ?? 0) + (outgoing.get(a)?.length ?? 0)
            const degreeB = (incoming.get(b)?.length ?? 0) + (outgoing.get(b)?.length ?? 0)
            return degreeB - degreeA
          })[0]
        )
      }

      const layer = new Map<string, number>()
      const queue = roots.map((id) => ({ id, depth: 0 }))
      for (const root of roots) layer.set(root, 0)

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!
        for (const target of outgoing.get(id) ?? []) {
          if (!componentSet.has(target)) continue
          const nextDepth = depth + 1
          if (nextDepth > (layer.get(target) ?? -1)) {
            layer.set(target, nextDepth)
            queue.push({ id: target, depth: nextDepth })
          }
        }
      }

      for (const id of component) {
        if (!layer.has(id)) layer.set(id, 0)
      }

      const layers = new Map<number, string[]>()
      for (const id of component) {
        const depth = layer.get(id) ?? 0
        if (!layers.has(depth)) layers.set(depth, [])
        layers.get(depth)?.push(id)
      }

      const sortedLayerNumbers = [...layers.keys()].sort((a, b) => a - b)
      let componentHeight = 0
      for (const layerNumber of sortedLayerNumbers) {
        const layerIds = layers.get(layerNumber) ?? []
        layerIds.sort((a, b) => {
          const aParents = (incoming.get(a) ?? []).filter((p) => componentSet.has(p))
          const bParents = (incoming.get(b) ?? []).filter((p) => componentSet.has(p))
          const aParentOrder = aParents.length > 0
            ? aParents.reduce((sum, p) => sum + (layer.get(p) ?? 0), 0) / aParents.length
            : 0
          const bParentOrder = bParents.length > 0
            ? bParents.reduce((sum, p) => sum + (layer.get(p) ?? 0), 0) / bParents.length
            : 0
          if (aParentOrder !== bParentOrder) return aParentOrder - bParentOrder
          return a.localeCompare(b)
        })
        componentHeight = Math.max(componentHeight, Math.max(NODE_HEIGHT, (layerIds.length - 1) * NODE_GAP_Y + NODE_HEIGHT))
      }

      for (const layerNumber of sortedLayerNumbers) {
        const layerIds = layers.get(layerNumber) ?? []
        const layerHeight = (layerIds.length - 1) * NODE_GAP_Y
        const startY = componentTop + Math.max(0, (componentHeight - layerHeight) / 2)

        layerIds.forEach((id, index) => {
          positions.push({
            id,
            x: ORIGIN_X + layerNumber * LAYER_GAP_X,
            y: startY + index * NODE_GAP_Y,
          })
        })
      }

      for (const node of component) {
        const layoutNode = nodeById.get(node)
        if (layoutNode) layoutNode.level = layer.get(node) ?? 0
      }

      componentTop += componentHeight + COMPONENT_GAP_Y
    }

    return positions
  }

  /**
   * 启动布局计算
   */
  async run(
    nodes: MemoryNode[],
    edges: MemoryEdge[],
    onProgress?: (progress: number) => void
  ): Promise<Array<{ id: string; x: number; y: number }>> {
    this.running = true

    // 初始化节点数据
    this.nodes = nodes.map(n => ({
      id: n.id,
      x: toFiniteNumber(n.positionX),
      y: toFiniteNumber(n.positionY),
      vx: 0,
      vy: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }))
    this.edges = edges

    // 构建 id → node 的 Map，加速吸引力计算中的查找
    this.nodeMap.clear()
    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node)
    }

    if (this.options.hierarchical) {
      return this.computeStableHierarchicalLayout()
    }

    // 如果节点位置都是0，使用初始化位置
    const hasValidPositions = this.nodes.some(n => n.x !== 0 || n.y !== 0)
    if (!hasValidPositions) {
      this.initializePositions()
    }

    // 迭代计算
    const { iterations } = this.options
    let iteration = 0
    let lastMovement = Infinity

    return new Promise((resolve) => {
      const step = () => {
        if (!this.running || iteration >= iterations) {
          // 计算完成，返回结果
          const result = this.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }))
          resolve(result)
          return
        }

        // 运行多次迭代（每帧）
        const iterationsPerFrame = 5
        for (let i = 0; i < iterationsPerFrame && iteration < iterations; i++) {
          lastMovement = this.iterate()
          iteration++
        }

        // 计算进度
        const progress = iteration / iterations
        onProgress?.(progress)

        // 如果运动已经很小，提前结束
        if (lastMovement < 0.1) {
          const result = this.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }))
          resolve(result)
          return
        }

        this.animationFrameId = self.setTimeout(step, 16) as unknown as number
      }

      step()
    })
  }

  /**
   * 停止布局计算
   */
  stop(): void {
    this.running = false
    if (this.animationFrameId !== null) {
      clearTimeout(this.animationFrameId)
      this.animationFrameId = null
    }
  }
}

// 创建布局实例
let layout: ForceDirectedLayout | null = null

/**
 * 处理来自主线程的消息
 */
self.onmessage = async (event: MessageEvent<LayoutWorkerMessage>) => {
  const { type, nodes, edges, options } = event.data

  if (type === 'stop') {
    layout?.stop()
    layout = null
    return
  }

  if (type === 'start') {
    if (!nodes || !edges) {
      const response: LayoutWorkerResponse = {
        type: 'error',
        error: '缺少节点或边数据',
      }
      self.postMessage(response)
      return
    }

    try {
      // 创建新的布局实例
      layout = new ForceDirectedLayout(options)

      // 开始布局计算
      const result = await layout.run(nodes, edges, (progress) => {
        const response: LayoutWorkerResponse = {
          type: 'progress',
          progress,
        }
        self.postMessage(response)
      })

      // 发送完成结果
      const response: LayoutWorkerResponse = {
        type: 'complete',
        nodes: result,
      }
      self.postMessage(response)
    } catch (error) {
      const response: LayoutWorkerResponse = {
        type: 'error',
        error: error instanceof Error ? error.message : '布局计算失败',
      }
      self.postMessage(response)
    }

    layout = null
  }
}

// 导出空对象以满足模块化需求
export {}
