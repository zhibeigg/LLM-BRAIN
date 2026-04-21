import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Box, IconButton, CircularProgress, Tooltip, Typography, InputBase,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider, Checkbox,
} from '@mui/material'
import {
  Send as SendIcon,
  School as LearnIcon,
  Queue as QueueIcon,
  AttachFile as AttachIcon,
  Close as CloseIcon,
  Stop as StopIcon,
  Image as ImageIcon,
  FlashOn as AutoIcon,
  Assignment as PlanIcon,
  TouchApp as SupervisedIcon,
  Visibility as ReadonlyIcon,
  Block as RejectIcon,
  SmartToy as AutoReviewIcon,
  ExpandMore as ExpandIcon,
} from '@mui/icons-material'
import { useTaskStore } from '../../stores/taskStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useColors } from '../../ThemeContext'
import { useResponsive } from '../../hooks/useResponsive'
import type { ExecutionMode } from '../../types'

const LEARN_PATTERN = /^学习\s+(.+)/

interface Attachment {
  id: string
  name: string
  type: 'image' | 'file'
  preview?: string // base64 data URL for images
  size: number
}

/** 本地消息队列项 */
interface PendingMessage {
  id: string
  text: string
  attachments: Attachment[]
}

export function ChatInput() {
  const c = useColors()
  const { isMobile } = useResponsive()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pendingQueue, setPendingQueue] = useState<PendingMessage[]>([])
  const [modeMenuAnchor, setModeMenuAnchor] = useState<null | HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isRunning = useTaskStore((s) => s.isRunning)
  const isLearning = useTaskStore((s) => s.isLearning)
  const queue = useTaskStore((s) => s.queue)
  const startTask = useTaskStore((s) => s.startTask)
  const learnTopic = useTaskStore((s) => s.learnTopic)
  const executionMode = useTaskStore((s) => s.executionMode)
  const setExecutionMode = useTaskStore((s) => s.setExecutionMode)
  const autoReview = useTaskStore((s) => s.autoReview)
  const setAutoReview = useTaskStore((s) => s.setAutoReview)

  const busy = isRunning || isLearning

  // 发送一条消息到后端
  const dispatchMessage = useCallback((msg: PendingMessage) => {
    let prompt = msg.text
    // 附件以标记形式附加
    if (msg.attachments.length > 0) {
      const attachInfo = msg.attachments.map(a =>
        a.type === 'image' && a.preview
          ? `[图片:${a.name}]\n${a.preview}`
          : `[附件:${a.name}]`
      ).join('\n')
      prompt = `${prompt}\n\n${attachInfo}`
    }

    const learnMatch = prompt.match(LEARN_PATTERN)
    if (learnMatch) {
      learnTopic(learnMatch[1].trim())
    } else {
      startTask(prompt)
    }
  }, [startTask, learnTopic])

  // 任务完成后自动发送本地队列的下一条
  useEffect(() => {
    if (!busy && pendingQueue.length > 0) {
      const [next, ...rest] = pendingQueue
      setPendingQueue(rest)
      dispatchMessage(next)
    }
  }, [busy, pendingQueue, dispatchMessage])

  // 提交当前输入
  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed && attachments.length === 0) return

    const msg: PendingMessage = {
      id: `local-${Date.now()}`,
      text: trimmed,
      attachments: [...attachments],
    }

    setInput('')
    setAttachments([])

    if (busy) {
      // 加入本地队列
      setPendingQueue(prev => [...prev, msg])
    } else {
      dispatchMessage(msg)
    }
  }, [input, attachments, busy, dispatchMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const sendKey = useSettingsStore.getState().sendKey
      if (sendKey === 'ctrl+enter') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          handleSend()
        }
      } else {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          handleSend()
        }
      }
    },
    [handleSend],
  )

  // 粘贴图片
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        const reader = new FileReader()
        reader.onload = () => {
          const att: Attachment = {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name || 'pasted-image.png',
            type: 'image',
            preview: reader.result as string,
            size: file.size,
          }
          setAttachments(prev => [...prev, att])
        }
        reader.readAsDataURL(file)
      }
    }
  }, [])

  // 文件选择
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of files) {
      const isImage = file.type.startsWith('image/')
      const reader = new FileReader()
      reader.onload = () => {
        const att: Attachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: isImage ? 'image' : 'file',
          preview: isImage ? (reader.result as string) : undefined,
          size: file.size,
        }
        setAttachments(prev => [...prev, att])
      }
      if (isImage) {
        reader.readAsDataURL(file)
      } else {
        reader.readAsDataURL(file) // 文件也读 base64
      }
    }

    // 重置 input 以允许重复选择同一文件
    e.target.value = ''
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const removePending = useCallback((id: string) => {
    setPendingQueue(prev => prev.filter(m => m.id !== id))
  }, [])

  const isLearnCommand = LEARN_PATTERN.test(input.trim())
  const hasInput = input.trim().length > 0 || attachments.length > 0
  const hasPendingQueue = pendingQueue.length > 0

  // 按钮状态
  type ButtonMode = 'send' | 'queue' | 'stop' | 'loading'
  let buttonMode: ButtonMode = 'send'
  if (busy && hasInput) buttonMode = 'queue'
  else if (busy && !hasInput && hasPendingQueue) buttonMode = 'stop'
  else if (busy && !hasInput) buttonMode = 'loading'

  const buttonConfig = {
    send: {
      color: isLearnCommand ? c.success : c.primary,
      hoverColor: isLearnCommand ? '#22C55E' : c.primaryDark,
      icon: isLearnCommand ? <LearnIcon sx={{ fontSize: 18 }} /> : <SendIcon sx={{ fontSize: 18 }} />,
      tooltip: isLearnCommand ? '开始学习' : '发送',
      disabled: !hasInput,
    },
    queue: {
      color: c.warning,
      hoverColor: '#D97706',
      icon: <QueueIcon sx={{ fontSize: 18 }} />,
      tooltip: '排队',
      disabled: !hasInput,
    },
    stop: {
      color: c.error,
      hoverColor: '#DC2626',
      icon: <StopIcon sx={{ fontSize: 18 }} />,
      tooltip: `清空队列 (${pendingQueue.length})`,
      disabled: false,
    },
    loading: {
      color: c.primary,
      hoverColor: c.primary,
      icon: <CircularProgress size={18} sx={{ color: '#fff' }} />,
      tooltip: '执行中...',
      disabled: true,
    },
  }

  const btn = buttonConfig[buttonMode]

  const modeConfig: Record<ExecutionMode, { icon: React.ReactNode; label: string; color: string }> = {
    auto: { icon: <AutoIcon sx={{ fontSize: 16 }} />, label: '全部允许', color: c.success },
    plan: { icon: <PlanIcon sx={{ fontSize: 16 }} />, label: '规划模式', color: c.secondary },
    supervised: { icon: <SupervisedIcon sx={{ fontSize: 16 }} />, label: '逐项询问', color: c.warning },
    readonly: { icon: <ReadonlyIcon sx={{ fontSize: 16 }} />, label: '只读', color: c.textMuted },
  }

  const currentModeConfig = modeConfig[executionMode]

  const handleButtonClick = useCallback(() => {
    if (buttonMode === 'stop') {
      setPendingQueue([])
      return
    }
    if (executionMode === 'readonly') return
    handleSend()
  }, [buttonMode, handleSend, executionMode])

  return (
    <Box
      sx={{
        px: isMobile ? 1.5 : 2,
        py: isMobile ? 1.25 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        borderTop: `1px solid ${c.border}`,
        background: c.bgPanel,
        flexShrink: 0,
        // 移动端安全区域
        pb: isMobile ? 'calc(1.25rem + env(safe-area-inset-bottom, 0))' : 1,
      }}
    >
      {/* 后端队列提示 */}
      {queue.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <QueueIcon sx={{ fontSize: isMobile ? 12 : 13, color: c.warning }} />
          <Typography sx={{ fontSize: isMobile ? 10 : 11, color: c.textMuted }}>
            后端 {queue.length} 个任务排队中
          </Typography>
        </Box>
      )}

      {/* 本地消息队列 */}
      {hasPendingQueue && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          {pendingQueue.map((msg) => (
            <Box
              key={msg.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1, py: 0.4,
                borderRadius: '6px',
                bgcolor: `${c.warning}08`,
                border: `1px solid ${c.warning}20`,
              }}
            >
              <Box sx={{ width: 2, height: 16, borderRadius: 1, bgcolor: c.warning, opacity: 0.5, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 11, color: c.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {msg.text || `${msg.attachments.length} 个附件`}
              </Typography>
              {msg.attachments.length > 0 && (
                <ImageIcon sx={{ fontSize: 12, color: c.textMuted }} />
              )}
              <IconButton
                size="small"
                onClick={() => removePending(msg.id)}
                sx={{ p: 0.15, color: c.textMuted, '&:hover': { color: c.error } }}
                aria-label="移除消息"
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {/* 附件预览 */}
      {attachments.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {attachments.map((att) => (
            <Box
              key={att.id}
              sx={{
                position: 'relative',
                borderRadius: '6px',
                border: `1px solid ${c.border}`,
                overflow: 'hidden',
                bgcolor: c.bgInput,
              }}
            >
              {att.type === 'image' && att.preview ? (
                <Box
                  component="img"
                  src={att.preview}
                  alt={att.name}
                  sx={{ display: 'block', height: 52, maxWidth: 100, objectFit: 'cover' }}
                />
              ) : (
                <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AttachIcon sx={{ fontSize: 14, color: c.textMuted }} />
                  <Typography sx={{ fontSize: 11, color: c.textSecondary, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}
                  </Typography>
                </Box>
              )}
              <IconButton
                size="small"
                onClick={() => removeAttachment(att.id)}
                sx={{
                  position: 'absolute', top: 1, right: 1,
                  p: 0.15, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff',
                  '&:hover': { bgcolor: c.error },
                }}
                aria-label="移除附件"
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {/* 输入行 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: isMobile ? 0.5 : 0.75 }}>
        {/* 模式选择器 - 移动端隐藏，合并到菜单 */}
        {!isMobile && (
          <Tooltip title={currentModeConfig.label}>
            <IconButton
              size="small"
              onClick={(e) => setModeMenuAnchor(e.currentTarget)}
              sx={{
                color: currentModeConfig.color,
                '&:hover': { bgcolor: `${currentModeConfig.color}15` },
              }}
              aria-label={currentModeConfig.label}
            >
              {currentModeConfig.icon}
            </IconButton>
          </Tooltip>
        )}
        <Menu
          anchorEl={modeMenuAnchor}
          open={Boolean(modeMenuAnchor)}
          onClose={() => setModeMenuAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          {(Object.entries(modeConfig) as [ExecutionMode, typeof currentModeConfig][]).map(([mode, cfg]) => (
            <MenuItem
              key={mode}
              selected={executionMode === mode}
              onClick={() => { setExecutionMode(mode) }}
              sx={{ py: 0.75, fontSize: 13 }}
            >
              <ListItemIcon sx={{ color: cfg.color, minWidth: 32 }}>{cfg.icon}</ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>{cfg.label}</ListItemText>
              {executionMode === mode && <Typography sx={{ fontSize: 12, color: c.success, ml: 1 }}>✓</Typography>}
            </MenuItem>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => { setAutoReview(!autoReview) }}
            sx={{ py: 0.75, fontSize: 13 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Checkbox checked={autoReview} size="small" sx={{ p: 0, color: c.textMuted, '&.Mui-checked': { color: c.primary } }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Leader 自动审查</ListItemText>
            <AutoReviewIcon sx={{ fontSize: 16, color: autoReview ? c.primary : c.textMuted, ml: 1 }} />
          </MenuItem>
        </Menu>

        {/* 附件按钮 */}
        <Tooltip title="上传附件">
          <IconButton
            size="small"
            onClick={() => fileInputRef.current?.click()}
            sx={{ color: c.textMuted, '&:hover': { color: c.primary, bgcolor: `${c.primary}10` } }}
            aria-label="上传附件"
          >
            <AttachIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* 输入框 */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            borderRadius: '8px',
            bgcolor: c.bgInput,
            border: `1.5px solid ${
              buttonMode === 'queue' ? c.warning
              : isLearnCommand ? `${c.success}60`
              : c.border
            }`,
            transition: 'border-color 0.15s',
            '&:focus-within': {
              borderColor: buttonMode === 'queue' ? c.warning : isLearnCommand ? c.success : c.primary,
            },
            px: isMobile ? 1.25 : 1.5,
          }}
        >
          <InputBase
            inputRef={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={busy ? '输入后排队执行...' : '输入任务... 或「学习 主题名」'}
            fullWidth
            aria-label="输入任务或学习主题"
            sx={{
              fontSize: isMobile ? 16 : 14, // iOS 需要 16px 防止缩放
              color: c.text,
              py: isMobile ? '10px' : '8px',
              '& .MuiInputBase-input::placeholder': { color: c.textMuted, opacity: 1 },
            }}
          />
          {hasPendingQueue && (
            <Typography sx={{ fontSize: 11, color: c.warning, fontWeight: 600, flexShrink: 0, ml: 0.5 }}>
              {pendingQueue.length}
            </Typography>
          )}
        </Box>

        {/* 发送/排队/中断按钮 */}
        <Tooltip title={btn.tooltip}>
          <span>
            <IconButton
              onClick={handleButtonClick}
              disabled={btn.disabled}
              size="small"
              sx={{
                width: isMobile ? 42 : 36,
                height: isMobile ? 42 : 36,
                borderRadius: isMobile ? '10px' : '8px',
                bgcolor: btn.color,
                color: '#fff',
                flexShrink: 0,
                '&:hover': { bgcolor: btn.hoverColor },
                '&:disabled': { bgcolor: c.bgInput, color: c.textMuted },
              }}
              aria-label={btn.tooltip}
            >
              {btn.icon}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  )
}
