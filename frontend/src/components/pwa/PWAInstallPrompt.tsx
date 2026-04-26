import { useState, useEffect } from 'react'
import { Box, Button, Card, CardContent, Typography, Slide, IconButton } from '@mui/material'
import { Close as CloseIcon, GetApp as InstallIcon } from '@mui/icons-material'
import { useColors } from '../../ThemeContext'

interface PWAInstallPromptProps {
  onInstalled?: () => void
}

/** PWA 安装提示组件 */
export function PWAInstallPrompt({ onInstalled }: PWAInstallPromptProps) {
  const c = useColors()
  const [showPrompt, setShowPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // 检查是否已经安装或已拒绝
    const isInstalled = localStorage.getItem('pwa-install-dismissed')
    if (isInstalled) return

    // 监听 PWA 安装事件
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // 延迟显示，给用户一些时间来了解应用
      setTimeout(() => setShowPrompt(true), 3000)
    }

    // 监听应用已安装
    const handleAppInstalled = () => {
      setShowPrompt(false)
      onInstalled?.()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [onInstalled])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowPrompt(false)
    } else {
      // 用户拒绝，7天内不再显示
      localStorage.setItem('pwa-install-dismissed', Date.now().toString())
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    // 用户关闭，24小时内不再显示
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
    setShowPrompt(false)
  }

  // 检查是否显示过（24小时限制）
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10)
      const oneDay = 24 * 60 * 60 * 1000
      if (Date.now() - dismissedTime < oneDay) {
        setShowPrompt(false)
        return
      }
      // 超过24小时，清除标记
      localStorage.removeItem('pwa-install-dismissed')
    }
  }, [])

  if (!showPrompt || !deferredPrompt) return null

  return (
    <Slide direction="up" in={showPrompt} mountOnEnter unmountOnExit>
      <Card
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          maxWidth: 360,
          zIndex: 100,
          boxShadow: `0 8px 32px ${c.shadow}`,
          borderRadius: 2,
          overflow: 'visible',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: -8,
            right: 16,
            width: 16,
            height: 16,
            bgcolor: c.bgCard,
            transform: 'rotate(45deg)',
            borderLeft: `1px solid ${c.border}`,
            borderTop: `1px solid ${c.border}`,
          }}
        />
        <IconButton
          size="small"
          onClick={handleDismiss}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            color: c.textMuted,
          }}
          aria-label="关闭安装提示"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                bgcolor: `${c.primary}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <InstallIcon sx={{ color: c.primary, fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.text }}>
                安装 LLM Brain
              </Typography>
              <Typography variant="body2" sx={{ color: c.textMuted }}>
                离线访问，一键启动
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" sx={{ color: c.textSecondary, mb: 2, lineHeight: 1.6 }}>
            将应用安装到桌面，获得更快的访问速度和离线使用能力。
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={handleDismiss}
              sx={{ flex: 1, textTransform: 'none' }}
            >
              稍后
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleInstall}
              startIcon={<InstallIcon />}
              sx={{ flex: 1, textTransform: 'none', fontWeight: 600 }}
            >
              安装
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Slide>
  )
}

/** BeforeInstallPromptEvent 类型定义 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
