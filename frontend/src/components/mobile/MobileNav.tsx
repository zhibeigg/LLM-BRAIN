import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, IconButton, Drawer, Divider, List, ListItemButton,
  ListItemIcon, ListItemText, Badge, Tooltip, Button,
} from '@mui/material'
import {
  Close as CloseIcon,
  Psychology as BrainIcon,
  Psychology as PersonalityIcon,
  AccountTree as GraphIcon,
  Chat as ChatIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  ChevronRight as ChevronIcon,
} from '@mui/icons-material'
import { useBrainStore } from '../../stores/brainStore'
import { useGraphStore } from '../../stores/graphStore'
import { useTaskStore } from '../../stores/taskStore'
import { useAuthStore } from '../../stores/authStore'
import { useColors } from '../../ThemeContext'
import { BrainSelector } from '../brain'
import { PersonalityPanel } from '../personality'

interface MobileNavProps {
  open: boolean
  onClose: () => void
  activeTab: 'chat' | 'graph' | 'personality'
  onTabChange: (tab: 'chat' | 'graph' | 'personality') => void
  onOpenSettings: () => void
  onLogout: () => void
}

export function MobileNav({
  open,
  onClose,
  activeTab,
  onTabChange,
  onOpenSettings,
  onLogout,
}: MobileNavProps) {
  const c = useColors()
  const currentBrainId = useBrainStore((s) => s.currentBrainId)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const isRunning = useTaskStore((s) => s.isRunning)
  const isLearning = useTaskStore((s) => s.isLearning)
  const queue = useTaskStore((s) => s.queue)
  const user = useAuthStore((s) => s.user)

  const handleNavClick = useCallback((tab: 'chat' | 'graph' | 'personality') => {
    onTabChange(tab)
    onClose()
  }, [onTabChange, onClose])

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 280,
          bgcolor: c.bgPanel,
          borderRight: `1px solid ${c.border}`,
          pt: 2,
        },
      }}
      ModalProps={{
        BackdropProps: {
          sx: {
            bgcolor: c.overlay,
          },
        },
      }}
    >
      {/* 头部 */}
      <Box sx={{ px: 2, pb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8, height: 8, borderRadius: '50%',
              bgcolor: c.primary, boxShadow: `0 0 8px ${c.primary}60`,
            }}
          />
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: c.text }}>
            LLM-BRAIN
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: c.textMuted }} aria-label="关闭导航">
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <Divider sx={{ borderColor: c.border }} />

      {/* 用户信息 */}
      {user && (
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 13, color: c.textSecondary }}>
            {user.username}
          </Typography>
          {(isRunning || isLearning) && (
            <Box sx={{
              px: 1, py: 0.25, borderRadius: '4px',
              bgcolor: `${c.warning}20`,
            }}>
              <Typography sx={{ fontSize: 10, color: c.warning, fontWeight: 600 }}>
                运行中
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* 大脑选择器 */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${c.border}` }}>
        <BrainSelector />
      </Box>

      {/* 导航列表 */}
      <List sx={{ flex: 1, pt: 1 }}>
        <ListItemButton
          onClick={() => handleNavClick('chat')}
          sx={{
            mx: 1,
            borderRadius: '8px',
            mb: 0.5,
            bgcolor: activeTab === 'chat' ? `${c.primary}15` : 'transparent',
            '&:hover': { bgcolor: activeTab === 'chat' ? `${c.primary}20` : `${c.primary}10` },
          }}
        >
          <ListItemIcon sx={{ color: activeTab === 'chat' ? c.primary : c.textMuted, minWidth: 40 }}>
            <ChatIcon sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="对话"
            primaryTypographyProps={{ fontSize: 14, fontWeight: activeTab === 'chat' ? 600 : 400, color: c.text }}
          />
          {queue.length > 0 && (
            <Badge badgeContent={queue.length} sx={{ mr: 1 }} />
          )}
          <ChevronIcon sx={{ fontSize: 18, color: c.textMuted }} />
        </ListItemButton>

        <ListItemButton
          onClick={() => handleNavClick('graph')}
          sx={{
            mx: 1,
            borderRadius: '8px',
            mb: 0.5,
            bgcolor: activeTab === 'graph' ? `${c.primary}15` : 'transparent',
            '&:hover': { bgcolor: activeTab === 'graph' ? `${c.primary}20` : `${c.primary}10` },
          }}
        >
          <ListItemIcon sx={{ color: activeTab === 'graph' ? c.primary : c.textMuted, minWidth: 40 }}>
            <GraphIcon sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="图谱"
            primaryTypographyProps={{ fontSize: 14, fontWeight: activeTab === 'graph' ? 600 : 400, color: c.text }}
          />
          {selectedNodeId && (
            <Box sx={{
              px: 1, py: 0.25, borderRadius: '4px',
              bgcolor: `${c.secondary}20`,
            }}>
              <Typography sx={{ fontSize: 10, color: c.secondary }}>
                已选节点
              </Typography>
            </Box>
          )}
          <ChevronIcon sx={{ fontSize: 18, color: c.textMuted }} />
        </ListItemButton>

        {currentBrainId && (
          <ListItemButton
            onClick={() => handleNavClick('personality')}
            sx={{
              mx: 1,
              borderRadius: '8px',
              mb: 0.5,
              bgcolor: activeTab === 'personality' ? `${c.primary}15` : 'transparent',
              '&:hover': { bgcolor: activeTab === 'personality' ? `${c.primary}20` : `${c.primary}10` },
            }}
          >
            <ListItemIcon sx={{ color: activeTab === 'personality' ? c.primary : c.textMuted, minWidth: 40 }}>
              <PersonalityIcon sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary="性格系统"
              primaryTypographyProps={{ fontSize: 14, fontWeight: activeTab === 'personality' ? 600 : 400, color: c.text }}
            />
            <ChevronIcon sx={{ fontSize: 18, color: c.textMuted }} />
          </ListItemButton>
        )}
      </List>

      <Divider sx={{ borderColor: c.border }} />

      {/* 底部操作 */}
      <Box sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="设置">
            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<SettingsIcon sx={{ fontSize: 18 }} />}
              onClick={() => { onOpenSettings(); onClose() }}
              sx={{
                flex: 1,
                borderColor: c.border,
                color: c.textSecondary,
                '&:hover': { borderColor: c.primary, color: c.primary },
              }}
            >
              设置
            </Button>
          </Tooltip>
          <Tooltip title="退出登录">
            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<LogoutIcon sx={{ fontSize: 18 }} />}
              onClick={onLogout}
              sx={{
                flex: 1,
                borderColor: c.border,
                color: c.textSecondary,
                '&:hover': { borderColor: c.error, color: c.error },
              }}
            >
              退出
            </Button>
          </Tooltip>
        </Box>
      </Box>
    </Drawer>
  )
}
