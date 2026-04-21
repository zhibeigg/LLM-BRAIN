import { useState } from 'react'
import { Box, Typography, TextField, Button, Alert } from '@mui/material'
import { Psychology as BrainIcon } from '@mui/icons-material'
import { useAuthStore } from '../../stores/authStore'
import { useColors } from '../../ThemeContext'

export function LoginPage() {
  const c = useColors()
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)

  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!username.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      if (isRegister) {
        await register(username.trim(), password)
      } else {
        await login(username.trim(), password)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        bgcolor: c.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          p: 4,
          borderRadius: '16px',
          bgcolor: c.bgPanel,
          border: `1px solid ${c.border}`,
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 4 }}>
          <Box
            sx={{
              width: 10, height: 10, borderRadius: '50%',
              bgcolor: c.primary, boxShadow: `0 0 12px ${c.primary}60`,
            }}
          />
          <Typography
            sx={{
              fontWeight: 800, fontSize: 20, color: c.text,
              letterSpacing: '-0.03em',
            }}
          >
            LLM-BRAIN
          </Typography>
        </Box>

        <Typography sx={{ textAlign: 'center', color: c.textSecondary, fontSize: 14, mb: 3 }}>
          {isRegister ? '创建新账户' : '登录到你的大脑'}
        </Typography>

        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 2, fontSize: 13,
              bgcolor: `${c.error}10`, color: c.error,
              border: `1px solid ${c.error}30`,
              '& .MuiAlert-icon': { color: c.error },
            }}
          >
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSubmit() }} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="用户名"
            size="small"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            fullWidth
            autoFocus
            disabled={loading}
          />
          <TextField
            label="密码"
            type="password"
            size="small"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            fullWidth
            disabled={loading}
          />
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={loading || !username.trim() || !password}
            sx={{
              mt: 1,
              py: 1.2,
              fontSize: 14,
              fontWeight: 600,
              textTransform: 'none',
              bgcolor: c.primary,
              '&:hover': { bgcolor: c.primaryDark },
            }}
          >
            {loading ? '请稍候...' : isRegister ? '注册' : '登录'}
          </Button>
        </Box>

        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography
            component="span"
            role="button"
            tabIndex={0}
            sx={{
              fontSize: 13,
              color: c.textMuted,
              cursor: 'pointer',
              '&:hover': { color: c.primary },
              transition: 'color 0.15s',
            }}
            onClick={() => { setIsRegister(!isRegister); setError(null) }}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsRegister(!isRegister); setError(null) } }}
          >
            {isRegister ? '已有账户？去登录' : '没有账户？去注册'}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
