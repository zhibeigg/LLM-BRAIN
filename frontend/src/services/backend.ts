const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:3715'

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const { protocol, hostname } = window.location
  return protocol === 'tauri:' || hostname === 'tauri.localhost' || hostname.endsWith('.tauri.localhost')
}

const configuredBackendOrigin = normalizeOrigin(import.meta.env.VITE_BACKEND_ORIGIN)
const backendOrigin = configuredBackendOrigin || (isDesktopRuntime() ? DEFAULT_BACKEND_ORIGIN : '')

export const API_BASE_URL = backendOrigin ? `${backendOrigin}/api` : '/api'

export function getWebSocketUrl(token?: string | null): string {
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''

  if (backendOrigin) {
    const wsOrigin = backendOrigin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
    return `${wsOrigin}/ws${tokenParam}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws${tokenParam}`
}
