import { useState, useCallback } from 'react'
import { Box, IconButton, CircularProgress, TextField, Tooltip } from '@mui/material'
import { Send as SendIcon, School as LearnIcon } from '@mui/icons-material'
import { useTaskStore } from '../../stores/taskStore'
import { darkColors as c } from '../../theme'

const LEARN_PATTERN = /^学习\s+(.+)/

export function ChatInput() {
  const [input, setInput] = useState('')
  const isRunning = useTaskStore((s) => s.isRunning)
  const isLearning = useTaskStore((s) => s.isLearning)
  const startTask = useTaskStore((s) => s.startTask)
  const learnTopic = useTaskStore((s) => s.learnTopic)

  const busy = isRunning || isLearning

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || busy) return
    setInput('')

    const learnMatch = trimmed.match(LEARN_PATTERN)
    if (learnMatch) {
      learnTopic(learnMatch[1].trim())
    } else {
      startTask(trimmed)
    }
  }, [input, busy, startTask, learnTopic])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const isLearnCommand = LEARN_PATTERN.test(input.trim())
  const accentColor = isLearnCommand ? c.success : c.primary

  return (
    <Box
      sx={{
        height: 60,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderTop: `1px solid ${c.border}`,
        background: c.bgPanel,
        flexShrink: 0,
      }}
    >
      <TextField
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入任务... 或「学习 主题名」"
        disabled={busy}
        size="small"
        fullWidth
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: '8px',
            bgcolor: c.bgInput,
            fontSize: 14,
            color: c.text,
            '& fieldset': { borderColor: isLearnCommand ? `${c.success}40` : c.border },
            '&:hover fieldset': { borderColor: isLearnCommand ? c.success : c.borderLight },
            '&.Mui-focused fieldset': { borderColor: accentColor, borderWidth: 1.5 },
          },
          '& .MuiInputBase-input': {
            py: '9px',
            '&::placeholder': { color: c.textMuted, opacity: 1 },
          },
        }}
      />
      {busy ? (
        <CircularProgress size={22} sx={{ color: isLearning ? c.success : c.primary, flexShrink: 0 }} />
      ) : (
        <Tooltip title={isLearnCommand ? '开始学习' : '发送任务'}>
          <IconButton
            onClick={handleSend}
            disabled={!input.trim()}
            size="small"
            sx={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              bgcolor: accentColor,
              color: '#fff',
              flexShrink: 0,
              '&:hover': { bgcolor: isLearnCommand ? '#22C55E' : c.primaryDark },
              '&:disabled': { bgcolor: c.bgInput, color: c.textMuted },
            }}
          >
            {isLearnCommand ? <LearnIcon sx={{ fontSize: 18 }} /> : <SendIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
