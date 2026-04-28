import { create } from 'zustand'
import { API_BASE_URL } from '../services/backend'

interface AuthUser {
  id: string
  username: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  loading: boolean

  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  restoreSession: () => Promise<void>
}

const TOKEN_KEY = 'llm-brain-token'

async function authRequest(path: string, body: object): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE_URL}/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || res.statusText)
  }
  return res.json()
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: true,

  login: async (username, password) => {
    const data = await authRequest('/login', { username, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    set({ token: data.token, user: data.user })
  },

  register: async (username, password) => {
    const data = await authRequest('/register', { username, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    set({ token: data.token, user: data.user })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null })
  },

  restoreSession: async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      set({ loading: false })
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      set({ token, user: data.user, loading: false })
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      set({ token: null, user: null, loading: false })
    }
  },
}))

/** 获取当前 token（供 api.ts 和 websocket.ts 使用） */
export function getToken(): string | null {
  return useAuthStore.getState().token
}
