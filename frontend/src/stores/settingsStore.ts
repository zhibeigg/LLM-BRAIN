import { create } from 'zustand'
import type { ExecutionMode } from '../types'

export type SendKey = 'enter' | 'ctrl+enter'
export type FontFamily = 'inter' | 'jetbrains-mono' | 'system'

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  inter: '"Inter", "Noto Sans SC", sans-serif',
  'jetbrains-mono': '"JetBrains Mono", "Noto Sans SC", monospace',
  system: 'system-ui, -apple-system, "Noto Sans SC", sans-serif',
}

export function resolveFontFamily(key: FontFamily): string {
  return FONT_FAMILY_MAP[key] ?? FONT_FAMILY_MAP.inter
}

export interface AppSettings {
  // 外观
  fontSize: number          // 12-20, 默认 14
  fontFamily: FontFamily

  // 通用
  sendKey: SendKey
  messageHistoryLimit: number // 10-200

  // 图谱
  showMinimap: boolean
  graphSnapToGrid: boolean
  graphAnimateEdges: boolean
  graphAutoFocusLeader: boolean

  // 执行
  defaultExecutionMode: ExecutionMode
  defaultAutoReview: boolean
  maxRetries: number        // 1-10

  // 工具
  enabledTools: string[]    // 启用的工具 ID 列表
}

const STORAGE_KEY = 'llm-brain-settings'

const defaultSettings: AppSettings = {
  fontSize: 14,
  fontFamily: 'inter',
  sendKey: 'enter',
  messageHistoryLimit: 50,
  showMinimap: true,
  graphSnapToGrid: false,
  graphAnimateEdges: true,
  graphAutoFocusLeader: true,
  defaultExecutionMode: 'auto',
  defaultAutoReview: false,
  maxRetries: 3,
  enabledTools: ['web_search', 'url_reader', 'memory_search', 'calculator', 'terminal', 'file_read', 'file_write', 'file_edit', 'file_search', 'file_glob', 'file_list'],
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const result = { ...defaultSettings, ...parsed }
      // 合并新增的默认工具：旧 localStorage 中没有的工具自动加入
      if (Array.isArray(parsed.enabledTools)) {
        const oldSet = new Set(parsed.enabledTools as string[])
        const merged = [...parsed.enabledTools as string[]]
        for (const toolId of defaultSettings.enabledTools) {
          if (!oldSet.has(toolId)) {
            merged.push(toolId)
          }
        }
        result.enabledTools = merged
      }
      return result
    }
  } catch { /* ignore */ }
  return { ...defaultSettings }
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

interface SettingsState extends AppSettings {
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  toggleTool: (toolId: string) => void
  reset: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...loadSettings(),

  update: (key, value) =>
    set((state) => {
      const next = { ...state, [key]: value }
      const { update: _, reset: __, toggleTool: ___, ...data } = next
      saveSettings(data as AppSettings)
      return { [key]: value }
    }),

  toggleTool: (toolId) =>
    set((state) => {
      const enabled = state.enabledTools.includes(toolId)
        ? state.enabledTools.filter(id => id !== toolId)
        : [...state.enabledTools, toolId]
      const next = { ...state, enabledTools: enabled }
      const { update: _, reset: __, toggleTool: ___, ...data } = next
      saveSettings(data as AppSettings)
      return { enabledTools: enabled }
    }),

  reset: () => {
    saveSettings(defaultSettings)
    set(defaultSettings)
  },
}))
