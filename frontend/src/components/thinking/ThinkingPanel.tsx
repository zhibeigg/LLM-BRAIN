import { useRef, useEffect, useState, useMemo } from 'react'
import { Box, Typography, Chip, LinearProgress, Alert, Collapse, IconButton, Tooltip } from '@mui/material'
import {
  Psychology as ThinkIcon,
  Route as RouteIcon,
  SmartToy as AgentIcon,
  VerifiedUser as BossIcon,
  School as LearnIcon,
  ExpandMore as ExpandMoreIcon,
  History as HistoryIcon,
  DeleteOutline as DeleteIcon,
  ArrowBack as BackIcon,
  CheckCircleOutline as SuccessIcon,
  ErrorOutline as ErrorIcon,
  HourglassTop as RunningIcon,
} from '@mui/icons-material'
import { useTaskStore } from '../../stores/taskStore'
import type { ThinkingStep, ChatSession } from '../../stores/taskStore'
import type {
  LeaderStepPayload,
  LeaderDecisionPayload,
  AgentStreamPayload,
  BossVerdictPayload,
  LearningProgressPayload,
} from '../../types'
import { darkColors as c } from '../../theme'

/* ── 步骤配置 ── */

const STEP_CONFIG = {
  leader_step: { icon: ThinkIcon, color: '#A78BFA', label: 'Leader 思考' },
  leader_decision: { icon: RouteIcon, color: '#5B8DEF', label: 'Leader 决策' },
  agent_stream: { icon: AgentIcon, color: '#4ADE80', label: 'Agent 输出' },
  boss_verdict: { icon: BossIcon, color: '#FBBF24', label: 'Boss 评审' },
  learning_progress: { icon: LearnIcon, color: '#C084FC', label: '知识学习' },
} as const

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function formatSessionTime(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (isToday) return time
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${time}`
}

/* ── 步骤内容渲染 ── */

function StepContent({ step }: { step: ThinkingStep }) {
  switch (step.type) {
    case 'leader_step': {
      const data = step.data as LeaderStepPayload
      return (
        <>
          <Typography style={{ color: '#c0c2d8', fontSize: 13, marginBottom: 6 }}>
            当前:{' '}
            <Chip
              label={data.currentNodeId?.slice(0, 8)}
              size="small"
              sx={{
                height: 20, fontSize: 11,
                bgcolor: '#1a1b28', color: '#c0c2d8',
                border: '1px solid #2a2c3e',
              }}
            />
          </Typography>
          {data.candidates.map((cd) => (
            <Box
              key={cd.edgeId}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                ml: 1, mb: 0.4,
                opacity: cd.filtered ? 0.35 : 1,
              }}
            >
              <Typography
                style={{
                  color: cd.filtered ? '#555770' : '#e0e2f0',
                  textDecoration: cd.filtered ? 'line-through' : 'none',
                  fontSize: 13,
                }}
              >
                → {cd.targetNodeTitle}
              </Typography>
              <Chip
                label={`${cd.perceivedDifficulty.toFixed(2)}`}
                size="small"
                sx={{
                  height: 18, fontSize: 10,
                  bgcolor: cd.filtered ? '#2a2b45' : `${c.primary}20`,
                  color: cd.filtered ? '#6C6F8A' : c.primary,
                  border: `1px solid ${cd.filtered ? '#3a3c5c' : `${c.primary}40`}`,
                }}
              />
            </Box>
          ))}
          {data.thinking && (
            <Typography
              style={{
                color: '#9496b0', fontSize: 13,
                marginTop: 6, fontStyle: 'italic',
                whiteSpace: 'pre-wrap',
              }}
            >
              {data.thinking}
            </Typography>
          )}
        </>
      )
    }
    case 'leader_decision': {
      const data = step.data as LeaderDecisionPayload
      return (
        <>
          <Chip
            label={data.chosenEdgeId ? `选择: ${data.chosenEdgeId.slice(0, 8)}...` : '停止'}
            size="small"
            sx={{
              height: 22, fontSize: 12, mb: 0.5,
              bgcolor: data.chosenEdgeId ? `${c.secondary}20` : '#2a2b45',
              color: data.chosenEdgeId ? c.secondaryLight : '#9496b0',
              border: `1px solid ${data.chosenEdgeId ? `${c.secondary}40` : '#3a3c5c'}`,
            }}
          />
          <Typography style={{ color: '#c0c2d8', fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {data.reason}
          </Typography>
        </>
      )
    }
    case 'agent_stream': {
      const data = step.data as AgentStreamPayload
      return (
        <div className="agent-terminal">
          <Typography
            component="span"
            style={{
              color: '#c8f5d4',
              whiteSpace: 'pre-wrap',
              fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            {data.chunk}
          </Typography>
          {!data.done && <span className="agent-cursor" />}
        </div>
      )
    }
    case 'boss_verdict': {
      const data = step.data as BossVerdictPayload
      return (
        <>
          <Chip
            label={data.passed ? '通过' : data.isLoop ? '循环' : '未通过'}
            size="small"
            sx={{
              height: 22, fontSize: 12, mb: 0.5,
              bgcolor: data.passed ? `${c.success}20` : `${c.error}20`,
              color: data.passed ? c.success : c.error,
              border: `1px solid ${data.passed ? `${c.success}40` : `${c.error}40`}`,
            }}
          />
          {!data.passed && (
            <Typography style={{ color: '#9496b0', fontSize: 13 }}>
              重试: {data.retryCount}
            </Typography>
          )}
          <Typography style={{ color: '#c0c2d8', fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {data.feedback}
          </Typography>
        </>
      )
    }
    case 'learning_progress': {
      const data = step.data as LearningProgressPayload
      const phaseLabel: Record<string, string> = {
        analyzing: '分析中', generating: '生成中', creating_nodes: '创建节点',
        evaluating_edges: '评估连接', creating_edges: '创建连接', done: '完成', error: '错误',
      }
      const phaseColor = data.phase === 'done' ? c.success : data.phase === 'error' ? c.error : '#C084FC'
      return (
        <>
          <Chip
            label={phaseLabel[data.phase] ?? data.phase}
            size="small"
            sx={{
              height: 22, fontSize: 12, mb: 0.5,
              bgcolor: `${phaseColor}20`, color: phaseColor,
              border: `1px solid ${phaseColor}40`,
            }}
          />
          <Typography style={{ color: '#c0c2d8', fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {data.message}
          </Typography>
          {data.totalNodes != null && data.nodesCreated != null && (
            <Box sx={{ mt: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={data.totalNodes > 0 ? (data.nodesCreated / data.totalNodes) * 100 : 0}
                sx={{
                  height: 4, borderRadius: 2,
                  bgcolor: '#3a3c5c',
                  animation: 'progressGlow 2s ease-in-out infinite',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: '#C084FC',
                    borderRadius: 2,
                    boxShadow: '0 0 8px #C084FC60',
                  },
                }}
              />
            </Box>
          )}
        </>
      )
    }
    default:
      return null
  }
}

/* ── 步骤卡片 ── */

function StepCard({
  step,
  index,
  isLast,
  isBusy,
}: {
  step: ThinkingStep
  index: number
  isLast: boolean
  isBusy: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const config = STEP_CONFIG[step.type]
  const Icon = config.icon

  const accentColor =
    step.type === 'boss_verdict'
      ? (step.data as BossVerdictPayload).passed ? c.success : c.error
      : step.type === 'learning_progress'
        ? (step.data as LearningProgressPayload).phase === 'error' ? c.error
          : (step.data as LearningProgressPayload).phase === 'done' ? c.success
          : config.color
        : config.color

  const isVerdict = step.type === 'boss_verdict'
  const isAgent = step.type === 'agent_stream'
  const accentBarColor = accentColor
  const cardClass = isVerdict ? 'step-card step-card--verdict' : 'step-card'
  const dotClass = isLast && isBusy ? 'step-dot step-dot--breathing' : 'step-dot'

  return (
    <Box
      sx={{
        position: 'relative',
        pl: 3.5,
        pb: 2,
        background: 'transparent',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 10,
          top: 0,
          bottom: 0,
          width: '1.5px',
          background: isLast
            ? `linear-gradient(to bottom, ${c.border} 40%, transparent 100%)`
            : c.border,
          opacity: 0.6,
        }}
      />

      <Box
        className={dotClass}
        sx={{
          position: 'absolute',
          left: 4,
          top: 12,
          width: 14,
          height: 14,
          borderRadius: '50%',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '--dot-color': accentColor,
          animationDelay: `${index * 0.06}s`,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `1.5px solid ${accentColor}`,
            opacity: 0.5,
          }}
        />
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: accentColor,
            boxShadow: `0 0 6px ${accentColor}60`,
          }}
        />
      </Box>

      <div
        className={cardClass}
        style={{
          borderRadius: 10,
          background: isAgent ? '#0c0d17' : '#141520',
          border: `1px solid ${isVerdict ? accentColor : '#2a2c3e'}`,
          overflow: 'hidden',
          animationDelay: `${index * 0.06}s`,
          // @ts-expect-error CSS custom property
          '--verdict-color': isVerdict ? accentColor : undefined,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: `linear-gradient(to bottom, ${accentBarColor}, ${accentBarColor}40)`,
            borderRadius: '10px 0 0 10px',
          }}
        />

        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px 8px 16px',
            cursor: 'pointer',
            background: isAgent ? '#0e0f1a' : '#1a1b28',
            transition: 'background 0.15s',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isAgent ? '#12131f' : '#1f2030'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isAgent ? '#0e0f1a' : '#1a1b28'
          }}
        >
          <Icon sx={{ fontSize: 16 }} style={{ color: accentColor }} />
          <span
            style={{
              fontWeight: 600,
              color: accentColor,
              flex: 1,
              fontSize: 13,
              letterSpacing: '0.02em',
            }}
          >
            {config.label}
          </span>
          <span style={{ color: '#666880', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(step.timestamp)}
          </span>
          <ExpandMoreIcon
            sx={{
              fontSize: 18,
              color: '#666880',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>

        <Collapse in={expanded} timeout={250}>
          <div style={{ padding: '6px 14px 12px 16px', position: 'relative' }}>
            <StepContent step={step} />
          </div>
        </Collapse>
      </div>
    </Box>
  )
}

/* ── 历史会话条目 ── */

function SessionItem({
  session,
  isActive,
  isViewing,
  onClick,
  onDelete,
}: {
  session: ChatSession
  isActive: boolean
  isViewing: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const statusIcon = session.status === 'running'
    ? <RunningIcon sx={{ fontSize: 14, color: c.warning }} />
    : session.status === 'success'
      ? <SuccessIcon sx={{ fontSize: 14, color: c.success }} />
      : <ErrorIcon sx={{ fontSize: 14, color: c.error }} />

  const typeColor = session.type === 'learn' ? '#C084FC' : c.primary
  const displayPrompt = session.type === 'learn' && session.prompt.startsWith('学习: ')
    ? session.prompt.slice(4)
    : session.prompt

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        cursor: 'pointer',
        borderRadius: '8px',
        border: `1px solid ${isViewing ? typeColor + '40' : 'transparent'}`,
        bgcolor: isViewing ? typeColor + '08' : isActive ? `${c.primary}05` : 'transparent',
        transition: 'all 0.15s',
        '&:hover': {
          bgcolor: isViewing ? typeColor + '12' : '#1f2030',
        },
        mb: 0.5,
      }}
    >
      {/* 类型指示条 */}
      <Box
        sx={{
          width: 3,
          height: 28,
          borderRadius: 2,
          bgcolor: typeColor,
          opacity: isViewing ? 1 : 0.4,
          flexShrink: 0,
        }}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 12.5,
            color: isViewing ? c.text : c.textSecondary,
            fontWeight: isViewing ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}
        >
          {displayPrompt}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          {statusIcon}
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>
            {formatSessionTime(session.timestamp)}
          </Typography>
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>
            · {session.thinkingSteps.length} 步
          </Typography>
        </Box>
      </Box>

      {/* 删除按钮 */}
      {!isActive && (
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          sx={{
            p: 0.25,
            color: c.textMuted,
            opacity: 0,
            '.MuiBox-root:hover > &': { opacity: 1 },
            '&:hover': { color: c.error },
          }}
        >
          <DeleteIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  )
}

/* ── 空状态 ── */

function EmptyState() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 2,
        userSelect: 'none',
      }}
    >
      <Box sx={{ position: 'relative', width: 64, height: 64 }}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `1px solid ${c.primary}`,
            animation: 'emptyRing 3s ease-in-out infinite',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 8,
            borderRadius: '50%',
            border: `1px solid ${c.primary}`,
            animation: 'emptyRing 3s ease-in-out infinite 0.4s',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 16,
            borderRadius: '50%',
            bgcolor: `${c.primary}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'emptyPulse 3s ease-in-out infinite',
          }}
        >
          <ThinkIcon sx={{ fontSize: 20, color: c.primary, opacity: 0.6 }} />
        </Box>
      </Box>
      <Typography sx={{ color: c.textMuted, fontSize: 13, letterSpacing: '0.08em' }}>
        等待指令...
      </Typography>
    </Box>
  )
}

/* ── 主面板 ── */

export function ThinkingPanel() {
  const isRunning = useTaskStore((s) => s.isRunning)
  const isLearning = useTaskStore((s) => s.isLearning)
  const thinkingSteps = useTaskStore((s) => s.thinkingSteps)
  const currentTaskPrompt = useTaskStore((s) => s.currentTaskPrompt)
  const error = useTaskStore((s) => s.error)
  const sessions = useTaskStore((s) => s.sessions)
  const activeSessionId = useTaskStore((s) => s.activeSessionId)
  const viewingSessionId = useTaskStore((s) => s.viewingSessionId)
  const viewSession = useTaskStore((s) => s.viewSession)
  const deleteSession = useTaskStore((s) => s.deleteSession)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)

  const [historyOpen, setHistoryOpen] = useState(false)

  const busy = isRunning || isLearning

  // 正在查看的历史会话
  const viewingSession = useMemo(() => {
    if (!viewingSessionId) return null
    return sessions.find((s) => s.id === viewingSessionId) ?? null
  }, [viewingSessionId, sessions])

  // 当前显示的步骤和提示
  const displaySteps = viewingSession ? viewingSession.thinkingSteps : thinkingSteps
  const displayPrompt = viewingSession ? viewingSession.prompt : currentTaskPrompt
  const isViewingHistory = viewingSession !== null

  // 已完成的历史会话（不含当前运行中的）
  const historySessions = useMemo(() => {
    return sessions.filter((s) => s.status !== 'running').reverse()
  }, [sessions])

  // 平滑滚动到底部（仅当前活跃会话）
  useEffect(() => {
    if (!isViewingHistory && bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [thinkingSteps.length, isViewingHistory])

  // 切换到查看历史时滚动到顶部
  useEffect(() => {
    if (isViewingHistory && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [viewingSessionId, isViewingHistory])

  const statusColor = useMemo(() => {
    if (isLearning) return '#C084FC'
    if (isRunning) return c.primary
    return c.textMuted
  }, [isRunning, isLearning])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2.5 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexShrink: 0 }}>
        {isViewingHistory ? (
          <>
            <Tooltip title="返回当前">
              <IconButton
                size="small"
                onClick={() => viewSession(null)}
                sx={{ p: 0.25, color: c.textSecondary, '&:hover': { color: c.primary } }}
              >
                <BackIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Typography sx={{ fontWeight: 600, color: c.textSecondary, fontSize: 15 }}>
              历史记录
            </Typography>
          </>
        ) : (
          <>
            <ThinkIcon sx={{ fontSize: 18, color: c.primary }} />
            <Typography sx={{ fontWeight: 600, color: c.text, fontSize: 15 }}>
              思考过程
            </Typography>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: statusColor,
                ml: 0.5,
                '--status-color': statusColor,
                animation: busy ? 'statusPulse 1.5s ease-in-out infinite' : 'none',
                transition: 'background-color 0.3s',
              }}
            />
          </>
        )}

        <Box sx={{ flex: 1 }} />

        {/* 历史按钮 */}
        {historySessions.length > 0 && (
          <Tooltip title={historyOpen ? '收起历史' : '展开历史'}>
            <IconButton
              size="small"
              onClick={() => setHistoryOpen(!historyOpen)}
              sx={{
                p: 0.5,
                color: historyOpen ? c.primary : c.textMuted,
                bgcolor: historyOpen ? `${c.primary}10` : 'transparent',
                '&:hover': { color: c.primary, bgcolor: `${c.primary}15` },
              }}
            >
              <HistoryIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* 历史会话列表 */}
      <Collapse in={historyOpen && historySessions.length > 0} timeout={200}>
        <Box
          sx={{
            mb: 2,
            maxHeight: 220,
            overflowY: 'auto',
            borderRadius: '10px',
            border: `1px solid ${c.border}`,
            bgcolor: '#0f1019',
            p: 1,
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, px: 0.5 }}>
            <Typography sx={{ fontSize: 11, color: c.textMuted, fontWeight: 500 }}>
              历史会话 ({historySessions.length})
            </Typography>
          </Box>
          {historySessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              isViewing={session.id === viewingSessionId}
              onClick={() => viewSession(session.id === viewingSessionId ? null : session.id)}
              onDelete={() => deleteSession(session.id)}
            />
          ))}
        </Box>
      </Collapse>

      {/* 进度条 */}
      {busy && !isViewingHistory && (
        <LinearProgress
          sx={{
            mb: 1.5,
            borderRadius: 2,
            height: 2,
            bgcolor: 'transparent',
            flexShrink: 0,
            '& .MuiLinearProgress-bar': {
              bgcolor: isLearning ? '#C084FC' : c.primary,
              boxShadow: `0 0 8px ${isLearning ? '#C084FC' : c.primary}80`,
            },
          }}
        />
      )}

      {error && !isViewingHistory && (
        <Alert
          severity="error"
          sx={{
            mb: 1.5, fontSize: 13,
            bgcolor: `${c.error}10`, color: c.error,
            border: `1px solid ${c.error}30`,
            '& .MuiAlert-icon': { color: c.error },
            flexShrink: 0,
          }}
        >
          {error}
        </Alert>
      )}

      {/* 滚动区域 + 渐变遮罩 */}
      <Box
        className="thinking-scroll-container"
        sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}
      >
        <Box
          ref={scrollRef}
          sx={{
            height: '100%',
            overflowY: 'auto',
            pr: 0.5,
            pt: 0.5,
          }}
        >
          {displayPrompt && (
            <Box
              sx={{
                mb: 2, p: 2,
                borderRadius: '10px',
                bgcolor: isViewingHistory ? '#141520' : `${c.primary}08`,
                border: `1px solid ${isViewingHistory ? c.border : `${c.primary}20`}`,
              }}
            >
              <Typography sx={{ fontSize: 12, color: c.textMuted, mb: 0.5 }}>
                {displayPrompt.startsWith('学习:') ? '学习主题' : '任务'}
              </Typography>
              <Typography sx={{ fontSize: 14, color: c.text, fontWeight: 500 }}>
                {displayPrompt.startsWith('学习: ')
                  ? displayPrompt.slice(4)
                  : displayPrompt}
              </Typography>
            </Box>
          )}

          {displaySteps.length === 0 && !displayPrompt ? (
            <EmptyState />
          ) : (
            displaySteps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                isLast={i === displaySteps.length - 1}
                isBusy={!isViewingHistory && busy}
              />
            ))
          )}

          <div ref={bottomAnchorRef} />
        </Box>
      </Box>
    </Box>
  )
}
