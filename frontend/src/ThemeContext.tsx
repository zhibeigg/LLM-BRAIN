import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { createAppTheme, getColors, type ColorMode, type AppColors } from './theme'
import { useSettingsStore, resolveFontFamily } from './stores/settingsStore'

interface ThemeContextValue {
  mode: ColorMode
  setMode: (mode: ColorMode) => void
  toggleMode: () => void
  colors: AppColors
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'llm-brain-color-mode'

function getInitialMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch { /* ignore */ }
  return 'dark'
}

/** 将颜色常量同步到 CSS 变量，供 index.css 使用 */
function applyCssVariables(colors: AppColors, fontSize: number, fontFamily: string) {
  const root = document.documentElement
  root.style.setProperty('--color-bg', colors.bg)
  root.style.setProperty('--color-bg-panel', colors.bgPanel)
  root.style.setProperty('--color-bg-card', colors.bgCard)
  root.style.setProperty('--color-bg-input', colors.bgInput)
  root.style.setProperty('--color-bg-hover', colors.bgHover)
  root.style.setProperty('--color-border', colors.border)
  root.style.setProperty('--color-border-light', colors.borderLight)
  root.style.setProperty('--color-primary', colors.primary)
  root.style.setProperty('--color-text', colors.text)
  root.style.setProperty('--color-text-secondary', colors.textSecondary)
  root.style.setProperty('--color-text-muted', colors.textMuted)
  root.style.setProperty('--color-success', colors.success)
  root.style.setProperty('--color-error', colors.error)
  root.style.setProperty('--app-font-size', `${fontSize}px`)
  root.style.setProperty('--app-font-family', fontFamily)
  root.style.fontSize = `${fontSize}px`
}

export function ThemeContextProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(getInitialMode)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const fontFamily = useSettingsStore((s) => s.fontFamily)

  const colors = useMemo(() => getColors(mode), [mode])
  const resolvedFont = useMemo(() => resolveFontFamily(fontFamily), [fontFamily])
  const muiTheme = useMemo(() => createAppTheme(mode, resolvedFont), [mode, resolvedFont])

  const setMode = (m: ColorMode) => {
    setModeState(m)
    try { localStorage.setItem(STORAGE_KEY, m) } catch { /* ignore */ }
  }

  const toggleMode = () => setMode(mode === 'dark' ? 'light' : 'dark')

  // 同步 CSS 变量
  useEffect(() => {
    applyCssVariables(colors, fontSize, resolvedFont)
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode, colors, fontSize, resolvedFont])

  const value = useMemo(() => ({ mode, setMode, toggleMode, colors }), [mode, colors])

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  )
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeMode must be used within ThemeContextProvider')
  return { mode: ctx.mode, setMode: ctx.setMode, toggleMode: ctx.toggleMode }
}

export function useColors(): AppColors {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useColors must be used within ThemeContextProvider')
  return ctx.colors
}
