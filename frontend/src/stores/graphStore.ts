import { create } from 'zustand'
import type { MemoryNode, MemoryEdge } from '../types'
import { nodesApi, edgesApi } from '../services/api'

interface GraphState {
  nodes: MemoryNode[]
  edges: MemoryEdge[]
  selectedNodeId: string | null
  newNodeIds: Set<string>
  loading: boolean
  error: string | null

  fetchGraph: () => Promise<void>
  selectNode: (id: string | null) => void
  addNode: (node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>) => Promise<MemoryNode>
  updateNode: (id: string, updates: Partial<MemoryNode>) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  addEdge: (edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'usageCount' | 'perceivedDifficulty'>) => Promise<MemoryEdge>
  updateEdge: (id: string, updates: Partial<MemoryEdge>) => Promise<void>
  deleteEdge: (id: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  autoLayout: () => Promise<void>
  addNewNodeId: (id: string) => void
  dismissNewNode: (id: string) => Promise<void>
  clearNewNodeIds: () => void
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  newNodeIds: new Set<string>(),
  loading: false,
  error: null,

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
    set({ selectedNodeId: id })
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

  autoLayout: async () => {
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
