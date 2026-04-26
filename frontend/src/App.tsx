import { useState, useCallback, useRef, useEffect } from 'react'

// 导入增强动画系统
import './styles/animations.css'
import { Box, Typography, IconButton, Tooltip, CircularProgress, Button } from '@mui/material'
import {
  Settings as SettingsIcon, Logout as LogoutIcon,
  Psychology as BrainIcon, Add as AddIcon,
  Menu as MenuIcon,
} from '@mui/icons-material'
import { GraphCanvas } from './components/graph'
import { PersonalityPanel } from './components/personality'
import { NodeEditor } from './components/editor'
import { ThinkingPanel } from './components/thinking'
import { ChatInput } from './components/chat'
import { SettingsDialog } from './components/settings'
import { ExportImport } from './components/graph/ExportImport'
import { BrainSelector } from './components/brain'
import { LoginPage } from './components/auth'
import { PWAInstallPrompt, OfflinePage } from './components/pwa'
import { MobileNav } from './components/mobile/MobileNav'
import { useGraphStore } from './stores/graphStore'
import { useAuthStore } from './stores/authStore'
import { useBrainStore } from './stores/brainStore'
import { useTaskStore } from './stores/taskStore'
import { useWebSocket } from './hooks/useWebSocket'
import { useColors } from './ThemeContext'
import { useResponsive } from './hooks/useResponsive'

/** 可拖拽分割线 */
function DragHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const c = useColors()
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

/** 无大脑时的引导页 */
function NoBrainGuide({ onOpenCreate }: { onOpenCreate: () => void }) {
  const c = useColors()
  return (
    <Box sx={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 2.5,
      bgcolor: c.bg,
    }}>
      <Box sx={{
        width: 72, height: 72, borderRadius: '50%',
        bgcolor: `${c.primary}12`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <BrainIcon sx={{ fontSize: 36, color: c.primary }} />
      </Box>
      <Typography sx={{ fontSize: 20, fontWeight: 700, color: c.text }}>
        还没有大脑
      </Typography>
      <Typography sx={{ fontSize: 14, color: c.textMuted, textAlign: 'center', maxWidth: 360 }}>
        创建一个大脑来开始使用。大脑是你的知识图谱容器，可以学习知识、执行任务、积累记忆。
      </Typography>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={onOpenCreate}
        sx={{ mt: 1, textTransform: 'none', fontWeight: 600, px: 3, py: 1 }}
      >
        创建第一个大脑
      </Button>
    </Box>
  )
}

type MobileTab = 'chat' | 'graph' | 'personality'

function MainApp() {
  useWebSocket()
  const c = useColors()
  const { isMobile } = useResponsive()

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const loadSessions = useTaskStore((s) => s.loadSessions)
  const currentBrainId = useBrainStore((s) => s.currentBrainId)
  const brainsLoading = useBrainStore((s) => s.loading)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createCount, setCreateCount] = useState(0)

  // 移动端状态
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')

  const [leftWidth, setLeftWidth] = useState(LEFT_WIDTH)
  const [graphWidth, setGraphWidth] = useState(480)

  // 登录后或切换大脑时加载历史会话
  useEffect(() => {
    loadSessions()
  }, [loadSessions, currentBrainId])

  const handleLeftDrag = useCallback((delta: number) => {
    setLeftWidth(prev => Math.max(LEFT_MIN, Math.min(LEFT_MAX, prev + delta)))
  }, [])

  const handleRightDrag = useCallback((delta: number) => {
    setGraphWidth(prev => Math.max(GRAPH_MIN, prev - delta))
  }, [])

  // 移动端 Tab 切换
  const handleMobileTabChange = useCallback((tab: MobileTab) => {
    setMobileTab(tab)
  }, [])

  // 离线状态检测和显示
  const [showOfflinePage, setShowOfflinePage] = useState(() => !navigator.onLine)
  useEffect(() => {
    const handleOffline = () => setShowOfflinePage(true)
    const handleOnline = () => setShowOfflinePage(false)

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (showOfflinePage) {
    return <OfflinePage />
  }

  // 移动端布局
  if (isMobile) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: c.bg }}>
        {/* 移动端顶部栏 */}
        <Box
          component="header"
          sx={{
            height: 48,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${c.border}`,
            background: c.bgPanel,
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              size="small"
              onClick={() => setMobileNavOpen(true)}
              sx={{ color: c.textMuted, mr: 0.5 }}
              aria-label="打开菜单"
            >
              <MenuIcon sx={{ fontSize: 22 }} />
            </IconButton>
            <Box
              sx={{
                width: 8, height: 8, borderRadius: '50%',
                bgcolor: c.primary, boxShadow: `0 0 8px ${c.primary}60`,
              }}
            />
            <Typography
              sx={{
                fontWeight: 800, fontSize: 15, color: c.text,
                letterSpacing: '-0.03em',
              }}
            >
              LLM-BRAIN
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {user && (
              <Typography sx={{ color: c.textSecondary, fontSize: 12 }}>
                {user.username}
              </Typography>
            )}
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{ color: c.textMuted }}
              aria-label="设置"
            >
              <SettingsIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>

        {/* 移动端内容区 */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 无大脑时显示引导页 */}
          {!currentBrainId && !brainsLoading ? (
            <NoBrainGuide onOpenCreate={() => setCreateCount(c => c + 1)} />
          ) : (
            <>
              {/* 移动端 Tab 内容 */}
              <Box sx={{ flex: 1, display: mobileTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                  <ThinkingPanel />
                </Box>
                <ChatInput />
              </Box>

              <Box sx={{ flex: 1, display: mobileTab === 'graph' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <GraphCanvas />
              </Box>

              <Box sx={{ flex: 1, display: mobileTab === 'personality' ? 'flex' : 'none', flexDirection: 'column', overflow: 'auto' }}>
                <PersonalityPanel />
              </Box>

              {/* 移动端底部 Tab 栏 */}
              <Box
                component="nav"
                aria-label="主导航"
                sx={{
                  display: 'flex',
                  borderTop: `1px solid ${c.border}`,
                  background: c.bgPanel,
                  flexShrink: 0,
                  pb: 'env(safe-area-inset-bottom, 0)',
                }}
              >
                <MobileTabButton
                  active={mobileTab === 'chat'}
                  onClick={() => handleMobileTabChange('chat')}
                  icon={<ChatIcon />}
                  label="对话"
                  color={c}
                />
                <MobileTabButton
                  active={mobileTab === 'graph'}
                  onClick={() => handleMobileTabChange('graph')}
                  icon={<GraphIcon />}
                  label="图谱"
                  color={c}
                />
                {currentBrainId && (
                  <MobileTabButton
                    active={mobileTab === 'personality'}
                    onClick={() => handleMobileTabChange('personality')}
                    icon={<PersonalityIcon />}
                    label="性格"
                    color={c}
                  />
                )}
              </Box>
            </>
          )}
        </Box>

        {/* 移动端导航抽屉 */}
        <MobileNav
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          activeTab={mobileTab}
          onTabChange={handleMobileTabChange}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={logout}
        />

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <PWAInstallPrompt />
      </Box>
    )
  }

  // 桌面端布局
  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: c.bg }}>
      {/* 顶部工具栏 */}
      <Box
        component="header"
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
              width: 10, height: 10, borderRadius: '50%',
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
              aria-label="设置"
            >
              <SettingsIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="退出登录">
            <IconButton
              size="small"
              onClick={logout}
              sx={{ color: c.textMuted, '&:hover': { color: c.error, bgcolor: `${c.error}15` } }}
              aria-label="退出登录"
            >
              <LogoutIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 主内容区 */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左栏：大脑选择器始终显示 */}
        <Box
          component="aside"
          sx={{
            width: leftWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: c.bgPanel,
          }}
        >
          <Box sx={{ px: 1.5, py: 1.5, borderBottom: `1px solid ${c.border}` }}>
            <BrainSelector requestCreate={createCount} />
          </Box>
          {currentBrainId && (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <PersonalityPanel />
            </Box>
          )}
        </Box>

        <DragHandle onDrag={handleLeftDrag} />

        {/* 无大脑时显示引导页 */}
        {!currentBrainId && !brainsLoading ? (
          <NoBrainGuide onOpenCreate={() => setCreateCount(c => c + 1)} />
        ) : (
          <>
            <Box
              component="main"
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
                    maxWidth: 'calc(100% - 24px)',
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
          </>
        )}
      </Box>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {/* PWA 安装提示 */}
      <PWAInstallPrompt />
    </Box>
  )
}

// 移动端 Tab 按钮组件
function MobileTabButton({
  active,
  onClick,
  icon,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  color: ReturnType<typeof useColors>
}) {
  return (
    <Box
      role="tab"
      tabIndex={0}
      aria-selected={active}
      onClick={onClick}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 1,
        gap: 0.25,
        cursor: 'pointer',
        color: active ? color.primary : color.textMuted,
        bgcolor: active ? `${color.primary}10` : 'transparent',
        transition: 'color 0.2s ease, background-color 0.2s ease',
        '&:active': {
          bgcolor: `${color.primary}20`,
        },
      }}
    >
      {icon}
      <Typography sx={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>
        {label}
      </Typography>
    </Box>
  )
}

// 移动端 Tab 图标组件
function ChatIcon({ sx }: { sx?: object }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} {...(sx as object)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function GraphIcon({ sx }: { sx?: object }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} {...(sx as object)}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="18" r="3" />
      <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
      <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" />
    </svg>
  )
}

function PersonalityIcon({ sx }: { sx?: object }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} {...(sx as object)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}

function App() {
  const c = useColors()
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const restoreSession = useAuthStore((s) => s.restoreSession)

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  if (loading) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: c.bg }}>
        <CircularProgress sx={{ color: c.primary }} />
      </Box>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <MainApp />
}

export default App
