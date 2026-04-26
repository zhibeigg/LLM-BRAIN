import { create } from 'zustand'
import type { MemoryNode, MemoryEdge } from '../types'
import { nodesApi, edgesApi } from '../services/api'

/** 布局配置选项 */
export interface AutoLayoutOptions {
  /** 是否使用前端Worker布局 */
  useWorker?: boolean
  /** 迭代次数 */
  iterations?: number
  /** 节点排斥力 */
  repulsion?: number
  /** 边吸引力 */
  attraction?: number
  /** 阻尼系数 */
  damping?: number
  /** 是否启用层级布局 */
  hierarchical?: boolean
}

interface GraphState {
  nodes: MemoryNode[]
  edges: MemoryEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  newNodeIds: Set<string>
  loading: boolean
  error: string | null
  isLayouting: boolean
  layoutProgress: number

  fetchGraph: () => Promise<void>
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  addNode: (node: Omit<MemoryNode, 'id' | 'brainId' | 'createdAt' | 'updatedAt'>) => Promise<MemoryNode>
  updateNode: (id: string, updates: Partial<MemoryNode>) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  addEdge: (edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'usageCount' | 'perceivedDifficulty'>) => Promise<MemoryEdge>
  updateEdge: (id: string, updates: Partial<MemoryEdge>) => Promise<void>
  deleteEdge: (id: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  autoLayout: (options?: AutoLayoutOptions) => Promise<void>
  addNewNodeId: (id: string) => void
  dismissNewNode: (id: string) => Promise<void>
  clearNewNodeIds: () => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  newNodeIds: new Set<string>(),
  loading: false,
  error: null,
  isLayouting: false,
  layoutProgress: 0,

  fetchGraph: async () => {
    set({ loading: true, error: null })
    try {
      // 从 brainStore 获取当前 brainId
      const { useBrainStore } = await import('./brainStore')
      const brainId = useBrainStore.getState().currentBrainId
      const [nodes, edges] = await Promise.all([
        nodesApi.getAll(brainId ?? undefined),
        edgesApi.getAll(),
      ])
      // 如果有 brainId，只保留该大脑的边
      const nodeIds = new Set(nodes.map(n => n.id))
      const filteredEdges = brainId
        ? edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
        : edges
      set({ nodes, edges: filteredEdges, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  selectNode: (id) => {
    set({ selectedNodeId: id, selectedEdgeId: null })
  },

  selectEdge: (id) => {
    set({ selectedEdgeId: id, selectedNodeId: null })
  },

  addNode: async (node) => {
    try {
      const { useBrainStore } = await import('./brainStore')
      const brainId = useBrainStore.getState().currentBrainId
      if (!brainId) throw new Error('未选择大脑')
      const created = await nodesApi.create({ ...node, brainId })
      set((state) => ({ nodes: [...state.nodes, created] }))
      return created
    } catch (e) {
      console.error('创建节点失败:', e)
      throw e
    }
  },

  updateNode: async (id, updates) => {
    try {
      const updated = await nodesApi.update(id, updates)
      set((state) => ({
        nodes: state.nodes.map((n) => (n.id === id ? updated : n)),
      }))
    } catch (e) {
      console.error('更新节点失败:', e)
      throw e
    }
  },

  deleteNode: async (id) => {
    try {
      await nodesApi.delete(id)
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== id),
        edges: state.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      }))
    } catch (e) {
      console.error('删除节点失败:', e)
      throw e
    }
  },

  addEdge: async (edge) => {
    try {
      const created = await edgesApi.create(edge)
      set((state) => ({ edges: [...state.edges, created] }))
      return created
    } catch (e) {
      console.error('创建边失败:', e)
      throw e
    }
  },

  updateEdge: async (id, updates) => {
    try {
      const updated = await edgesApi.update(id, updates)
      set((state) => ({
        edges: state.edges.map((e) => (e.id === id ? updated : e)),
      }))
    } catch (e) {
      console.error('更新边失败:', e)
      throw e
    }
  },

  deleteEdge: async (id) => {
    try {
      await edgesApi.delete(id)
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== id),
      }))
    } catch (e) {
      console.error('删除边失败:', e)
      throw e
    }
  },

  updateNodePosition: async (id, x, y) => {
    try {
      const updated = await nodesApi.update(id, { positionX: x, positionY: y })
      set((state) => ({
        nodes: state.nodes.map((n) => (n.id === id ? updated : n)),
      }))
    } catch (e) {
      console.error('更新节点位置失败:', e)
    }
  },

  autoLayout: async (options?: AutoLayoutOptions) => {
    const { nodes, edges } = get()
    if (nodes.length === 0) return

    // 默认使用前端Worker布局
    const useWorker = options?.useWorker ?? true

    if (useWorker) {
      // 使用前端Web Worker进行布局
      set({ isLayouting: true, layoutProgress: 0, error: null })

      try {
        // 创建Web Worker进行布局计算
        const worker = new Worker(
          new URL('../workers/graphLayout.worker.ts', import.meta.url),
          { type: 'module' }
        )

        return new Promise<void>((resolve, reject) => {
          worker.onerror = (e) => {
            console.error('布局Worker错误:', e)
            set({ isLayouting: false, error: '布局计算失败' })
            reject(new Error('布局计算失败'))
          }

          worker.onmessage = async (event) => {
            const { type, nodes: layoutNodes, progress, error } = event.data

            switch (type) {
              case 'progress':
                set({ layoutProgress: progress ?? 0 })
                break

              case 'complete':
                if (layoutNodes) {
                  const typedLayoutNodes = layoutNodes as Array<{ id: string; x: number; y: number }>
                  // 更新节点位置
                  const positionMap = new Map(typedLayoutNodes.map((n) => [n.id, n]))
                  set((state) => ({
                    nodes: state.nodes.map(n => {
                      const pos = positionMap.get(n.id)
                      if (pos) {
                        return { ...n, positionX: pos.x, positionY: pos.y }
                      }
                      return n
                    }),
                    isLayouting: false,
                    layoutProgress: 1,
                  }))

                  // 异步保存到后端
                  const { useBrainStore } = await import('./brainStore')
                  const brainId = useBrainStore.getState().currentBrainId
                  if (brainId) {
                    const updatedNodes = typedLayoutNodes.map((n) => ({
                      id: n.id,
                      positionX: n.x,
                      positionY: n.y,
                    }))
                    nodesApi.updateBatch(brainId, updatedNodes).catch(err => {
                      console.error('保存布局到后端失败:', err)
                    })
                  }
                }
                worker.terminate()
                resolve()
                break

              case 'error':
                console.error('布局失败:', error)
                set({ isLayouting: false, error: error ?? '布局失败' })
                worker.terminate()
                reject(new Error(error))
                break
            }
          }

          // 发送布局请求
          worker.postMessage({
            type: 'start',
            nodes,
            edges,
            options: {
              iterations: options?.iterations ?? 120,
              repulsion: options?.repulsion ?? 18000,
              attraction: options?.attraction ?? 0.025,
              damping: options?.damping ?? 0.72,
              hierarchical: options?.hierarchical ?? true,
            },
          })
        })
      } catch (e) {
        console.error('前端布局失败，回退到后端布局:', e)
        // 回退到后端布局
        return get().autoLayout({ ...options, useWorker: false })
      }
    } else {
      // 使用后端API布局
      try {
        const { useBrainStore } = await import('./brainStore')
        const brainId = useBrainStore.getState().currentBrainId
        if (!brainId) throw new Error('未选择大脑')
        const updatedNodes = await nodesApi.autoLayout(brainId)
        set((state) => {
          const updatedMap = new Map(updatedNodes.map(n => [n.id, n]))
          return {
            nodes: state.nodes.map(n => updatedMap.get(n.id) ?? n),
          }
        })
      } catch (e) {
        console.error('自动布局失败:', e)
        throw e
      }
    }
  },

  addNewNodeId: (id) =>
    set((state) => ({
      newNodeIds: new Set([...state.newNodeIds, id]),
    })),

  dismissNewNode: async (id) => {
    try {
      await nodesApi.delete(id)
      set((state) => {
        const next = new Set(state.newNodeIds)
        next.delete(id)
        return {
          nodes: state.nodes.filter((n) => n.id !== id),
          edges: state.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
          newNodeIds: next,
        }
      })
    } catch (e) {
      console.error('删除新节点失败:', e)
    }
  },

  clearNewNodeIds: () =>
    set({ newNodeIds: new Set<string>() }),
}))
