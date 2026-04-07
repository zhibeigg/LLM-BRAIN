import { create } from 'zustand'
import type { Brain } from '../types'
import { brainsApi } from '../services/api'

interface BrainState {
  brains: Brain[]
  currentBrainId: string | null
  loading: boolean

  fetchBrains: () => Promise<void>
  createBrain: (name: string, description?: string, projectPath?: string) => Promise<Brain>
  deleteBrain: (id: string) => Promise<void>
  selectBrain: (id: string) => void
}

export const useBrainStore = create<BrainState>((set, get) => ({
  brains: [],
  currentBrainId: null,
  loading: false,

  fetchBrains: async () => {
    set({ loading: true })
    try {
      const brains = await brainsApi.getAll()
      const current = get().currentBrainId
      set({
        brains,
        loading: false,
        // 如果当前没有选中大脑，自动选第一个
        currentBrainId: current && brains.some(b => b.id === current)
          ? current
          : brains[0]?.id ?? null,
      })
    } catch (e) {
      console.error('获取大脑列表失败:', e)
      set({ loading: false })
    }
  },

  createBrain: async (name, description, projectPath) => {
    const brain = await brainsApi.create(name, description, projectPath)
    set((state) => ({
      brains: [brain, ...state.brains],
      currentBrainId: brain.id,
    }))
    return brain
  },

  deleteBrain: async (id) => {
    await brainsApi.delete(id)
    set((state) => {
      const brains = state.brains.filter(b => b.id !== id)
      return {
        brains,
        currentBrainId: state.currentBrainId === id
          ? brains[0]?.id ?? null
          : state.currentBrainId,
      }
    })
  },

  selectBrain: (id) => {
    set({ currentBrainId: id })
  },
}))
