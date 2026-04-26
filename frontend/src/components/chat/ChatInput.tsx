import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
  SmartToy as AutoReviewIcon,
} from '@mui/icons-material'
import { useQueueStore, useTaskExecutionStore, useTaskStore } from '../../stores/taskStore'
import { useBrainStore } from '../../stores/brainStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { brainsApi } from '../../services/api'
import { useColors } from '../../ThemeContext'
import { useResponsive } from '../../hooks/useResponsive'
import type { ExecutionMode } from '../../types'

const LEARN_PATTERN = /^学习\s+(.+)/
const INIT_PATTERN = /^\/init(?:\s+(.+))?$/i
const SLASH_LEARN_PATTERN = /^\/learn(?:\s+(.+))?$/i
const SLASH_TASK_PATTERN = /^\/task(?:\s+(.+))?$/i
const INPUT_HISTORY_LIMIT = 50

const COMMAND_SUGGESTIONS = [
  {
    id: 'init',
    command: '/init',
    usage: '/init [项目路径]',
    insertText: '/init ',
    title: '初始化项目',
    description: '扫描并绑定当前大脑的项目上下文',
    icon: <PlanIcon sx={{ fontSize: 16 }} />,
    keywords: ['初始化', '项目', '路径', 'project', 'init'],
  },
  {
    id: 'learn',
    command: '/learn',
    usage: '/learn 主题',
    insertText: '/learn ',
    title: '学习主题',
    description: '让大脑围绕指定主题学习和沉淀记忆',
    icon: <LearnIcon sx={{ fontSize: 16 }} />,
    keywords: ['学习', '主题', '知识', 'learn', 'topic'],
  },
  {
    id: 'task',
    command: '/task',
    usage: '/task 任务描述',
    insertText: '/task ',
    title: '执行任务',
    description: '明确以普通任务方式发送后续内容',
    icon: <SendIcon sx={{ fontSize: 16 }} />,
    keywords: ['任务', '执行', '发送', 'task', 'ask'],
  },
] as const

type CommandSuggestion = typeof COMMAND_SUGGESTIONS[number]

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
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const draftBeforeHistoryRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isRunning = useTaskExecutionStore((s) => s.isRunning)
  const isLearning = useTaskExecutionStore((s) => s.isLearning)
  const queue = useQueueStore((s) => s.queue)
  const setIsLearning = useTaskExecutionStore((s) => s.setIsLearning)
  const setError = useTaskExecutionStore((s) => s.setError)
  const setCurrentTaskPrompt = useTaskExecutionStore((s) => s.setCurrentTaskPrompt)
  const addThinkingStep = useTaskExecutionStore((s) => s.addThinkingStep)
  const currentBrainId = useBrainStore((s) => s.currentBrainId)
  const fetchBrains = useBrainStore((s) => s.fetchBrains)
  const startTask = useTaskStore((s) => s.startTask)
  const learnTopic = useTaskStore((s) => s.learnTopic)
  const executionMode = useQueueStore((s) => s.executionMode)
  const setExecutionMode = useQueueStore((s) => s.setExecutionMode)
  const autoReview = useQueueStore((s) => s.autoReview)
  const setAutoReview = useQueueStore((s) => s.setAutoReview)

  const busy = isRunning || isLearning

  const runInitCommand = useCallback(async (projectPath?: string) => {
    if (!currentBrainId) {
      setError('请先选择一个大脑')
      return
    }

    const displayPrompt = projectPath ? `/init ${projectPath}` : '/init'
    setCurrentTaskPrompt(displayPrompt)
    setError(null)
    setIsLearning(true)
    addThinkingStep({
      id: `init-command-${Date.now()}`,
      type: 'learning_progress',
      timestamp: Date.now(),
      data: { phase: 'analyzing', message: projectPath ? `准备初始化项目：${projectPath}` : '准备初始化当前大脑绑定的项目' },
    })

    try {
      await brainsApi.initProject(currentBrainId, projectPath)
      if (projectPath) await fetchBrains()
    } catch (err) {
      setIsLearning(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [currentBrainId, setError, setIsLearning, setCurrentTaskPrompt, addThinkingStep, fetchBrains])

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

    const initMatch = prompt.match(INIT_PATTERN)
    if (initMatch) {
      runInitCommand(initMatch[1]?.trim())
      return
    }

    const slashLearnMatch = prompt.match(SLASH_LEARN_PATTERN)
    if (slashLearnMatch) {
      const topic = slashLearnMatch[1]?.trim()
      if (!topic) {
        setError('请输入要学习的主题')
        return
      }
      learnTopic(topic)
      return
    }

    const slashTaskMatch = prompt.match(SLASH_TASK_PATTERN)
    if (slashTaskMatch) {
      const taskPrompt = slashTaskMatch[1]?.trim()
      if (!taskPrompt) {
        setError('请输入要执行的任务')
        return
      }
      startTask(taskPrompt)
      return
    }

    const learnMatch = prompt.match(LEARN_PATTERN)
    if (learnMatch) {
      learnTopic(learnMatch[1].trim())
    } else {
      startTask(prompt)
    }
  }, [startTask, learnTopic, runInitCommand, setError])

  // 任务完成后自动发送本地队列的下一条
  useEffect(() => {
    if (!busy && pendingQueue.length > 0) {
      const [next, ...rest] = pendingQueue
      setPendingQueue(rest)
      dispatchMessage(next)
    }
  }, [busy, pendingQueue, dispatchMessage])

  const rememberInput = useCallback((value: string) => {
    const normalized = value.trim()
    if (!normalized) return
    setInputHistory((prev) => {
      const withoutDuplicate = prev.filter((item) => item !== normalized)
      return [...withoutDuplicate, normalized].slice(-INPUT_HISTORY_LIMIT)
    })
    setHistoryIndex(null)
    draftBeforeHistoryRef.current = ''
  }, [])

  // 提交当前输入
  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed && attachments.length === 0) return

    rememberInput(trimmed)

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
  }, [input, attachments, busy, dispatchMessage, rememberInput])

  const slashCommandState = useMemo(() => {
    const value = input.trimStart()
    if (!value.startsWith('/')) return { hasArgs: false, suggestions: [] as CommandSuggestion[] }

    const body = value.slice(1)
    const hasArgs = /\s/.test(body)
    const query = body.split(/\s/, 1)[0].toLowerCase()
    const suggestions = COMMAND_SUGGESTIONS.filter((item) => {
      if (!query) return true
      const haystack = [item.command.slice(1), item.title, item.description, ...item.keywords].join(' ').toLowerCase()
      return haystack.includes(query)
    })

    return { hasArgs, suggestions }
  }, [input])

  const commandSuggestions = slashCommandState.suggestions
  const showCommandSuggestions = !commandMenuDismissed && !slashCommandState.hasArgs && commandSuggestions.length > 0
  const selectedCommandIndex = commandSuggestions.length > 0
    ? Math.min(activeCommandIndex, commandSuggestions.length - 1)
    : 0

  const applyCommandSuggestion = useCallback((suggestion: CommandSuggestion) => {
    setInput(suggestion.insertText)
    setCommandMenuDismissed(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(suggestion.insertText.length, suggestion.insertText.length)
    })
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    setHistoryIndex(null)
    draftBeforeHistoryRef.current = ''
    setCommandMenuDismissed(false)
  }, [])

  const recallHistory = useCallback((direction: 'prev' | 'next') => {
    if (inputHistory.length === 0) return false

    const inputElement = inputRef.current
    const selectionStart = inputElement?.selectionStart ?? input.length
    const selectionEnd = inputElement?.selectionEnd ?? input.length
    const isCaretAtStart = selectionStart === 0 && selectionEnd === 0
    const isCaretAtEnd = selectionStart === input.length && selectionEnd === input.length

    if (direction === 'prev' && input.trim() && historyIndex === null && !isCaretAtStart) return false
    if (direction === 'next' && historyIndex === null) return false
    if (direction === 'next' && !isCaretAtEnd) return false

    let nextIndex: number | null
    if (direction === 'prev') {
      if (historyIndex === null) {
        draftBeforeHistoryRef.current = input
        nextIndex = inputHistory.length - 1
      } else {
        nextIndex = Math.max(0, historyIndex - 1)
      }
    } else {
      if (historyIndex === null) return false
      nextIndex = historyIndex + 1
      if (nextIndex >= inputHistory.length) nextIndex = null
    }

    const nextValue = nextIndex === null ? draftBeforeHistoryRef.current : inputHistory[nextIndex]
    setHistoryIndex(nextIndex)
    setInput(nextValue)
    setCommandMenuDismissed(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextValue.length, nextValue.length)
    })
    return true
  }, [historyIndex, input, inputHistory])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showCommandSuggestions) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveCommandIndex((selectedCommandIndex + 1) % commandSuggestions.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveCommandIndex((selectedCommandIndex - 1 + commandSuggestions.length) % commandSuggestions.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          applyCommandSuggestion(commandSuggestions[selectedCommandIndex] ?? commandSuggestions[0])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setCommandMenuDismissed(true)
          return
        }
      }

      if (!showCommandSuggestions && e.key === 'ArrowUp') {
        if (recallHistory('prev')) {
          e.preventDefault()
          return
        }
      }
      if (!showCommandSuggestions && e.key === 'ArrowDown') {
        if (recallHistory('next')) {
          e.preventDefault()
          return
        }
      }

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
    [handleSend, showCommandSuggestions, commandSuggestions, selectedCommandIndex, applyCommandSuggestion, recallHistory],
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

  const isLearnCommand = LEARN_PATTERN.test(input.trim()) || SLASH_LEARN_PATTERN.test(input.trim())
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
      hoverColor: isLearnCommand ? c.successHover : c.primaryDark,
      icon: isLearnCommand ? <LearnIcon sx={{ fontSize: 18 }} /> : <SendIcon sx={{ fontSize: 18 }} />,
      tooltip: isLearnCommand ? '开始学习' : '发送',
      disabled: !hasInput,
    },
    queue: {
      color: c.warning,
      hoverColor: c.warningHover,
      icon: <QueueIcon sx={{ fontSize: 18 }} />,
      tooltip: '排队',
      disabled: !hasInput,
    },
    stop: {
      color: c.error,
      hoverColor: c.errorHover,
      icon: <StopIcon sx={{ fontSize: 18 }} />,
      tooltip: `清空队列 (${pendingQueue.length})`,
      disabled: false,
    },
    loading: {
      color: c.primary,
      hoverColor: c.primary,
      icon: <CircularProgress size={18} sx={{ color: c.textInverse }} />,
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
                sx={{ p: 0.15, minWidth: 28, minHeight: 28, color: c.textMuted, '&:hover': { color: c.error } }}
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
                  p: 0.15, minWidth: 28, minHeight: 28, bgcolor: c.overlay, color: '#fff',
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

      {/* 指令推荐 */}
      {showCommandSuggestions && (
        <Box
          role="listbox"
          aria-label="指令推荐"
          sx={{
            overflow: 'hidden',
            borderRadius: '10px',
            border: `1px solid ${c.border}`,
            bgcolor: c.bgPanel,
            boxShadow: `0 12px 32px ${c.shadow}`,
          }}
        >
          <Box sx={{ px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, borderBottom: `1px solid ${c.border}` }}>
            <Typography sx={{ fontSize: 12, color: c.primary, fontWeight: 700 }}>/ 指令</Typography>
            <Typography sx={{ fontSize: 11, color: c.textMuted }}>继续输入可筛选，Enter/Tab 选择</Typography>
          </Box>
          {commandSuggestions.map((suggestion, index) => {
            const selected = index === selectedCommandIndex
            return (
              <Box
                key={suggestion.id}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveCommandIndex(index)}
                onClick={() => applyCommandSuggestion(suggestion)}
                sx={{
                  px: 1.25,
                  py: 0.9,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  bgcolor: selected ? `${c.primary}12` : 'transparent',
                  borderLeft: `3px solid ${selected ? c.primary : 'transparent'}`,
                  '&:hover': { bgcolor: `${c.primary}10` },
                }}
              >
                <Box sx={{ color: selected ? c.primary : c.textMuted, display: 'flex', alignItems: 'center' }}>
                  {suggestion.icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: 13, color: c.text, fontWeight: 700 }}>{suggestion.command}</Typography>
                    <Typography sx={{ fontSize: 11, color: c.textMuted }}>{suggestion.usage}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 11, color: c.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {suggestion.title} · {suggestion.description}
                  </Typography>
                </Box>
              </Box>
            )
          })}
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
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={busy ? '输入后排队执行...' : '输入任务... 输入 / 查看指令'}
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
                color: c.textInverse,
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
