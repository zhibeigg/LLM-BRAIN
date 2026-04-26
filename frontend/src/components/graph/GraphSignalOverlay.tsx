import { memo, useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import { useShallow } from 'zustand/shallow'
import { useGraphStore } from '../../stores/graphStore'
import { useTaskStore, useTaskExecutionStore, type ThinkingStep } from '../../stores/taskStore'
import type {
  AgentStreamPayload,
  BossVerdictPayload,
  LeaderDecisionPayload,
  LeaderStepPayload,
  LearningProgressPayload,
  ToolCallPayload,
} from '../../types'
import { useColors } from '../../ThemeContext'

type SignalType = ThinkingStep['type'] | 'idle'

interface SignalEvent {
  id: string
  type: SignalType
  label: string
  detail: string
  tone: string
  timestamp: number
}

function getStepSignal(step: ThinkingStep): SignalEvent {
  switch (step.type) {
    case 'leader_step': {
      const data = step.data as LeaderStepPayload
      return {
        id: step.id,
        type: step.type,
        label: '正在规划路径',
        detail: `从 ${shortId(data.currentNodeId)} 发现 ${data.candidates.length} 条候选路径`,
        tone: 'leader',
        timestamp: step.timestamp,
      }
    }
    case 'leader_decision': {
      const data = step.data as LeaderDecisionPayload
      return {
        id: step.id,
        type: step.type,
        label: data.chosenEdgeId ? '路径已选定' : '寻路已完成',
        detail: data.chosenEdgeId ? `选中边 ${shortId(data.chosenEdgeId)}` : '没有更多可行边',
        tone: 'leader',
        timestamp: step.timestamp,
      }
    }
    case 'agent_stream': {
      const data = step.data as AgentStreamPayload
      const tokenCount = data.chunk.trim().length
      return {
        id: step.id,
        type: step.type,
        label: data.done ? '模型输出完成' : '模型正在流式输出',
        detail: tokenCount > 0 ? `已输出 ${tokenCount} 个字符` : '等待模型输出',
        tone: 'agent',
        timestamp: step.timestamp,
      }
    }
    case 'tool_call': {
      const data = step.data as ToolCallPayload
      return {
        id: step.id,
        type: step.type,
        label: data.phase === 'start' ? '工具已发起' : '工具已返回',
        detail: data.toolName,
        tone: data.success === false ? 'alert' : 'tool',
        timestamp: step.timestamp,
      }
    }
    case 'boss_verdict': {
      const data = step.data as BossVerdictPayload
      return {
        id: step.id,
        type: step.type,
        label: data.passed ? '评审已通过' : '评审要求修正',
        detail: data.isLoop ? '检测到循环风险' : `第 ${data.retryCount} 次重试`,
        tone: data.passed ? 'boss' : 'alert',
        timestamp: step.timestamp,
      }
    }
    case 'learning_progress': {
      const data = step.data as LearningProgressPayload
      return {
        id: step.id,
        type: step.type,
        label: '图谱正在学习',
        detail: data.message,
        tone: data.phase === 'error' ? 'alert' : 'memory',
        timestamp: step.timestamp,
      }
    }
  }
}

function shortId(id?: string | null) {
  return id ? id.slice(0, 6) : '无'
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function GraphSignalOverlayInner() {
  const c = useColors()
  const { thinkingSteps, isRunning, isLearning, activeNodeId, activeEdgeIds, agentOutput } = useTaskStore(
    useShallow((state) => ({
      thinkingSteps: state.thinkingSteps,
      isRunning: state.isRunning,
      isLearning: state.isLearning,
      activeNodeId: state.activeNodeId,
      activeEdgeIds: state.activeEdgeIds,
      agentOutput: state.agentOutput,
    }))
  )
  const graphNodes = useGraphStore((state) => state.nodes)
  const leaderPathLength = useTaskExecutionStore((s) => s.leaderPath.length)

  const signalEvents = useMemo(
    () => thinkingSteps.slice(-6).map(getStepSignal),
    [thinkingSteps]
  )
  const latestEvent = signalEvents[signalEvents.length - 1]
  const activeNodeTitle = useMemo(
    () => graphNodes.find((node) => node.id === activeNodeId)?.title ?? shortId(activeNodeId),
    [graphNodes, activeNodeId]
  )
  const statusLabel = isLearning ? '图谱学习中' : isRunning ? '模型链路活跃' : '神经场待命'
  const statusDetail = activeNodeId ? `聚焦记忆：${activeNodeTitle}` : '等待下一次提问'
  const activeEdgeCount = activeEdgeIds.size
  const streamChars = agentOutput.length

  return (
    <Box
      className={`graph-signal-overlay ${isRunning || isLearning ? 'graph-signal-overlay--active' : ''}`}
      sx={{
        '--signal-bg': c.bg,
        '--signal-panel': c.bgPanel,
        '--signal-card': c.bgCard,
        '--signal-border': c.border,
        '--signal-primary': c.primary,
        '--signal-leader': c.stepLeader,
        '--signal-agent': c.stepAgent,
        '--signal-boss': c.stepBoss,
        '--signal-tool': c.stepTool,
        '--signal-memory': c.secondary,
        '--signal-alert': c.error,
        '--signal-text': c.text,
        '--signal-muted': c.textMuted,
      }}
    >
      <svg className="graph-signal-field" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id="signalFieldCore" cx="50%" cy="50%" r="58%">
            <stop offset="0%" stopColor="var(--signal-primary)" stopOpacity="0.22" />
            <stop offset="54%" stopColor="var(--signal-memory)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--signal-bg)" stopOpacity="0" />
          </radialGradient>
          <filter id="signalSoftGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100" height="100" fill="url(#signalFieldCore)" className="graph-signal-field__wash" />
      </svg>

      <Box className="graph-signal-stack">
        <Box className="graph-signal-status">
          <Typography className="graph-signal-status__eyebrow">信号遥测</Typography>
          <Typography className="graph-signal-status__title">{statusLabel}</Typography>
          <Typography className="graph-signal-status__detail">{statusDetail}</Typography>
          <Box className="graph-signal-status__metrics">
            <span>{activeEdgeCount} 条活跃边</span>
            {leaderPathLength > 0 && <span>{leaderPathLength} 步路径</span>}
            <span>{streamChars} 个字符</span>
          </Box>
        </Box>

        {latestEvent && (
          <Box className={`graph-signal-event graph-signal-event--${latestEvent.tone}`}>
            <Typography className="graph-signal-event__time">{formatTime(latestEvent.timestamp)}</Typography>
            <Typography className="graph-signal-event__label">{latestEvent.label}</Typography>
            <Typography className="graph-signal-event__detail">{latestEvent.detail}</Typography>
          </Box>
        )}
      </Box>

      <Box className="graph-signal-log" aria-label="最近的信息流事件">
        {signalEvents.slice(-4).map((event) => (
          <Box key={event.id} className={`graph-signal-log__item graph-signal-log__item--${event.tone}`}>
            <span>{event.label}</span>
            <small>{event.detail}</small>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export const GraphSignalOverlay = memo(GraphSignalOverlayInner)
