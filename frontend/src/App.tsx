import { useState, useCallback, useRef, useEffect } from 'react'
import { Box, Typography, IconButton, Tooltip, CircularProgress } from '@mui/material'
import { Settings as SettingsIcon, Logout as LogoutIcon } from '@mui/icons-material'
import { GraphCanvas } from './components/graph'
import { PersonalityPanel } from './components/personality'
import { NodeEditor } from './components/editor'
import { ThinkingPanel } from './components/thinking'
import { ChatInput } from './components/chat'
import { SettingsDialog } from './components/settings'
import { ExportImport } from './components/graph/ExportImport'
import { BrainSelector } from './components/brain'
import { LoginPage } from './components/auth'
import { useGraphStore } from './stores/graphStore'
import { useAuthStore } from './stores/authStore'
import { useTaskStore } from './stores/taskStore'
import { useWebSocket } from './hooks/useWebSocket'
import { darkColors as c } from './theme'

/** 可拖拽分割线 */
function DragHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - lastX.current
      lastX.current = ev.clientX
      onDrag(delta)
    }

    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [onDrag])

  return (
    <Box
      onMouseDown={onMouseDown}
      sx={{
        width: 5,
        flexShrink: 0,
        cursor: 'col-resize',
        position: 'relative',
        zIndex: 5,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 2,
          width: 1,
          bgcolor: c.border,
          transition: 'background-color 0.15s',
        },
        '&:hover::before, &:active::before': {
          bgcolor: c.primary,
          width: 2,
          left: 1.5,
        },
      }}
    />
  )
}

const LEFT_WIDTH = 260
const LEFT_MIN = 200
const LEFT_MAX = 400
const GRAPH_MIN = 340
const CHAT_MIN = 340

function MainApp() {
  useWebSocket()

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const loadSessions = useTaskStore((s) => s.loadSessions)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [leftWidth, setLeftWidth] = useState(LEFT_WIDTH)
  const [graphWidth, setGraphWidth] = useState(480)

  // 登录后加载历史会话
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleLeftDrag = useCallback((delta: number) => {
    setLeftWidth(prev => Math.max(LEFT_MIN, Math.min(LEFT_MAX, prev + delta)))
  }, [])

  const handleRightDrag = useCallback((delta: number) => {
    setGraphWidth(prev => Math.max(GRAPH_MIN, prev - delta))
  }, [])

  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: c.bg }}>
      {/* 顶部工具栏 */}
      <Box
        sx={{
          height: 52,
          px: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${c.border}`,
          background: c.bgPanel,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 9, height: 9, borderRadius: '50%',
              bgcolor: c.primary, boxShadow: `0 0 8px ${c.primary}60`,
            }}
          />
          <Typography
            sx={{
              fontWeight: 800, fontSize: 16, color: c.text,
              letterSpacing: '-0.03em', fontFamily: '"Inter", sans-serif',
            }}
          >
            LLM-BRAIN
          </Typography>
          <Typography sx={{ color: c.textMuted, fontSize: 13, ml: 0.5 }}>
            有向记忆图智能体
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {user && (
            <Typography sx={{ color: c.textSecondary, fontSize: 13, mr: 1 }}>
              {user.username}
            </Typography>
          )}
          <ExportImport />
          <Tooltip title="设置">
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{ color: c.textMuted, '&:hover': { color: c.primary, bgcolor: `${c.primary}15` } }}
            >
              <SettingsIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="退出登录">
            <IconButton
              size="small"
              onClick={logout}
              sx={{ color: c.textMuted, '&:hover': { color: c.error, bgcolor: `${c.error}15` } }}
            >
              <LogoutIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 主内容区 */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Box
          sx={{
            width: leftWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: c.bgPanel,
          }}
        >
          <Box sx={{ px: 1.5, py: 1.5, borderBottom: `1px solid ${c.border}` }}>
            <BrainSelector />
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <PersonalityPanel />
          </Box>
        </Box>

        <DragHandle onDrag={handleLeftDrag} />

        <Box
          sx={{
            flex: 1,
            minWidth: CHAT_MIN,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: c.bgPanel,
          }}
        >
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <ThinkingPanel />
          </Box>
          <ChatInput />
        </Box>

        <DragHandle onDrag={handleRightDrag} />

        <Box sx={{ width: graphWidth, flexShrink: 0, position: 'relative', bgcolor: c.bg }}>
          <GraphCanvas />

          {selectedNodeId && (
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                width: 340,
                maxHeight: 'calc(100% - 24px)',
                overflowY: 'auto',
                borderRadius: '10px',
                border: `1px solid ${c.border}`,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                zIndex: 10,
                bgcolor: c.bgCard,
              }}
            >
              <NodeEditor />
            </Box>
          )}
        </Box>
      </Box>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Box>
  )
}

function App() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const restoreSession = useAuthStore((s) => s.restoreSession)

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  if (loading) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#13141f' }}>
        <CircularProgress sx={{ color: '#E8613A' }} />
      </Box>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <MainApp />
}

export default App
