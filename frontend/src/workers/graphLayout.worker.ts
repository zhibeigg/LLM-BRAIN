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
  iterations: 100,
  repulsion: 5000,
  attraction: 0.1,
  damping: 0.85,
  maxMove: 50,
  initialRadius: 300,
  hierarchical: false,
  levelGap: 150,
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
    const levels = this.calculateNodeLevels()
    
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
      x: n.positionX,
      y: n.positionY,
      vx: 0,
      vy: 0,
      width: 180, // 默认节点宽度
      height: 80, // 默认节点高度
    }))
    this.edges = edges

    // 构建 id → node 的 Map，加速吸引力计算中的查找
    this.nodeMap.clear()
    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node)
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
