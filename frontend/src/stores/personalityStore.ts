import { create } from 'zustand'
import type { PersonalityDimension } from '../types'
import { personalityApi } from '../services/api'

interface PersonalityState {
  dimensions: PersonalityDimension[]
  maxDimensions: number
  loading: boolean

  fetchDimensions: () => Promise<void>
  updateDimensionLocal: (id: string, value: number) => void
  commitDimensionValue: (id: string, value: number) => Promise<void>
  addDimension: (name: string, description: string) => Promise<void>
  deleteDimension: (id: string) => Promise<void>
  fetchMaxDimensions: () => Promise<void>
  setMaxDimensions: (max: number) => Promise<void>
}

export const usePersonalityStore = create<PersonalityState>((set) => ({
  dimensions: [],
  maxDimensions: 8,
  loading: false,

  fetchDimensions: async () => {
    set({ loading: true })
    try {
      const { useBrainStore } = await import('./brainStore')
      const brainId = useBrainStore.getState().currentBrainId
      const dimensions = await personalityApi.getDimensions(brainId ?? undefined)
      set({ dimensions, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  // 仅更新本地状态（Slider 拖动时调用，不发 API）
  updateDimensionLocal: (id, value) => {
    set((state) => ({
      dimensions: state.dimensions.map((d) => (d.id === id ? { ...d, value } : d)),
    }))
  },

  // 提交到后端（Slider 松手时调用）
  commitDimensionValue: async (id, value) => {
    try {
      const updated = await personalityApi.updateDimension(id, { value })
      set((state) => ({
        dimensions: state.dimensions.map((d) => (d.id === id ? updated : d)),
      }))
    } catch (e) {
      console.error('更新维度失败:', e)
    }
  },

  addDimension: async (name, description) => {
    try {
      const { useBrainStore } = await import('./brainStore')
      const brainId = useBrainStore.getState().currentBrainId
      if (!brainId) return
      const created = await personalityApi.createDimension({ brainId, name, description })
      set((state) => ({
        dimensions: [...state.dimensions, created],
      }))
    } catch (e) {
      console.error('添加维度失败:', e)
    }
  },

  deleteDimension: async (id) => {
    try {
      await personalityApi.deleteDimension(id)
      set((state) => ({
        dimensions: state.dimensions.filter((d) => d.id !== id),
      }))
    } catch (e) {
      console.error('删除维度失败:', e)
    }
  },

  fetchMaxDimensions: async () => {
    try {
      const data = await personalityApi.getMaxDimensions()
      set({ maxDimensions: data.max ?? 8 })
    } catch (e) {
      console.error('获取维度上限失败:', e)
    }
  },

  setMaxDimensions: async (max) => {
    try {
      await personalityApi.setMaxDimensions(max)
      set({ maxDimensions: max })
    } catch (e) {
      console.error('设置维度上限失败:', e)
    }
  },
}))
