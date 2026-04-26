/**
 * 轻量 i18n 系统 — 基于 React Context，无第三方依赖
 * 支持嵌套 key（用 . 分隔）和模板变量（{variable}）
 */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { zhCN } from './zh-CN'
import { en } from './en'

export type Locale = 'zh-CN' | 'en'

type NestedMessages = { [key: string]: string | NestedMessages }

const locales: Record<Locale, NestedMessages> = {
  'zh-CN': zhCN,
  'en': en,
}

/** 从嵌套对象中按 dot-path 取值 */
function getNestedValue(obj: NestedMessages, path: string): string | undefined {
  const keys = path.split('.')
  let current: NestedMessages | string = obj
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined
    current = current[key]
  }
  return typeof current === 'string' ? current : undefined
}

/** 替换模板变量 {name} */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`))
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('llm-brain-locale')
    if (saved === 'zh-CN' || saved === 'en') return saved
    // 浏览器语言检测
    const browserLang = navigator.language
    if (browserLang.startsWith('zh')) return 'zh-CN'
  }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem('llm-brain-locale', newLocale)
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const messages = locales[locale]
    const value = getNestedValue(messages, key)
    if (value === undefined) {
      // fallback 到中文
      const fallback = getNestedValue(locales['zh-CN'], key)
      if (fallback !== undefined) return interpolate(fallback, vars)
      // 都找不到返回 key 本身
      return key
    }
    return interpolate(value, vars)
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export { type NestedMessages }
