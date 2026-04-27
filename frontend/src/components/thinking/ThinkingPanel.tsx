import { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
import { Box, Typography, Chip, LinearProgress, Alert, Collapse, IconButton, Tooltip, Button, CircularProgress } from '@mui/material'
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
  ChevronRight as ChevronRightIcon,
  CheckCircle as ChosenIcon,
  Circle as DotIcon,
  Close as CloseIcon,
  Queue as QueueIcon,
  Build as BuildIcon,
  Stop as StopIcon,
  Undo as UndoIcon,
  KeyboardDoubleArrowDown as JumpDownIcon,
} from '@mui/icons-material'
import { useQueueStore, useSessionStore, useTaskExecutionStore, useTaskStore } from '../../stores/taskStore'
import { useGraphStore } from '../../stores/graphStore'
import type { ThinkingStep, ChatSession } from '../../stores/taskStore'
import type {
  LeaderStepPayload,
  LeaderDecisionPayload,
  LeaderReturnPayload,
  AgentStreamPayload,
  BossVerdictPayload,
  LearningProgressPayload,
  ToolCallPayload,
  LLMTrace,
} from '../../types'
import { useColors } from '../../ThemeContext'
import { MarkdownRenderer } from '../common/MarkdownRenderer'
import { ToolCallCard } from './ToolCallCard'

/* ── 步骤配置 ── */

const STEP_ICONS = {
  leader_step: { icon: ThinkIcon, label: 'Leader 思考' },
  leader_decision: { icon: RouteIcon, label: 'Leader 决策' },
  leader_return: { icon: UndoIcon, label: 'Leader 回退' },
  agent_stream: { icon: AgentIcon, label: 'Agent 输出' },
  boss_verdict: { icon: BossIcon, label: 'Boss 评审' },
  learning_progress: { icon: LearnIcon, label: '知识学习' },
  tool_call: { icon: BuildIcon, label: '工具调用' },
} as const

const AUTO_SCROLL_BOTTOM_THRESHOLD = 96

function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_BOTTOM_THRESHOLD
}

function countTextContent(value: unknown): number {
  if (typeof value === 'string') return value.length
  if (Array.isArray(value)) return value.reduce((total, item) => total + countTextContent(item), 0)
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((total, item) => total + countTextContent(item), 0)
  }
  return 0
}

function formatNewContentSize(size: number) {
  if (size <= 0) return '有新内容'
  if (size < 1000) return `新增 ${size} 字`
  return `新增 ${(size / 1000).toFixed(1)}k 字`
}

function useStepColors() {
  const c = useColors()
  return {
    leader_step: c.stepLeader,
    leader_decision: c.primary,
    leader_return: c.warning,
    agent_stream: c.primary,
    boss_verdict: c.stepBoss,
    learning_progress: c.stepLearn,
    tool_call: c.textMuted,
  }
}

/** 步骤卡片内部颜色（跟随主题） */
function useStepTheme() {
  const c = useColors()
  return {
    bodyText: c.text,
    mutedText: c.textSecondary,
    dimText: c.textMuted,
    filteredText: c.textDim,
    brightText: c.text,
    agentText: c.text,
    chipBg: c.bg,
    chipBorder: c.border,
    filteredChipBg: c.bgPanel,
    cardBg: c.bg,
    cardAgentBg: c.bg,
    cardHeaderBg: c.bgPanel,
    cardHeaderAgentBg: c.bgPanel,
    cardHeaderHover: c.bgHover,
    cardHeaderAgentHover: c.bgHover,
    historyBg: c.bg,
    historyHover: c.bgPanel,
    progressBg: c.border,
  }
}

/* ── LLM 调用溯源详情 ── */

/** 尝试解析 JSON，失败返回 null */
function tryParseJson(str: string): Record<string, unknown> | null {
  try { return JSON.parse(str) } catch { return null }
}

/** 渲染一个键值行 */
function TraceRow({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useStepTheme()
  return (
    <Box sx={{ display: 'flex', gap: 1, fontSize: 11, lineHeight: 1.5 }}>
      <Typography sx={{ fontSize: 11, color: t.dimText, flexShrink: 0, minWidth: 48, fontWeight: 600 }}>{label}</Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

/** 将 prompt/response 的 JSON 渲染为友好格式 */
function FriendlyContent({ text, maxHeight }: { text: string; maxHeight?: number }) {
  const t = useStepTheme()
  const c = useColors()
  const parsed = tryParseJson(text)

  if (!parsed) {
    // 纯文本，按段落渲染
    return (
      <Box sx={{ maxHeight: maxHeight ?? 200, overflowY: 'auto' }}>
        {text.split('\n\n').map((block, i) => {
          const trimmed = block.trim()
          if (!trimmed) return null
          const colonIdx = trimmed.indexOf('：')
          if (colonIdx > 0 && colonIdx < 8 && !trimmed.includes('\n')) {
            return (
              <Box key={i} sx={{ mb: 0.5 }}>
                <Typography component="span" sx={{ fontSize: 11, color: c.primary, fontWeight: 600 }}>
                  {trimmed.slice(0, colonIdx + 1)}
                </Typography>
                <Typography component="span" sx={{ fontSize: 11, color: t.bodyText }}>
                  {trimmed.slice(colonIdx + 1)}
                </Typography>
              </Box>
            )
          }
          return (
            <Typography key={i} sx={{ fontSize: 11, color: t.bodyText, whiteSpace: 'pre-wrap', mb: 0.5 }}>
              {trimmed.length > 500 ? trimmed.slice(0, 500) + '…' : trimmed}
            </Typography>
          )
        })}
      </Box>
    )
  }

  // JSON 对象，按字段渲染
  return (
    <Box sx={{ maxHeight: maxHeight ?? 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {Object.entries(parsed).map(([key, val]) => {
        // 跳过过长的 ID 列表
        if (key === 'visitedNodes' && Array.isArray(val)) {
          return (
            <TraceRow key={key} label="已访问">
              <Typography sx={{ fontSize: 11, color: t.mutedText }}>{(val as string[]).length} 个节点</Typography>
            </TraceRow>
          )
        }
        // candidates 列表
        if (key === 'candidates' && Array.isArray(val)) {
          return (
            <TraceRow key={key} label="候选">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {(val as Array<Record<string, unknown>>).map((cd, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: 11, flex: 1, color: t.bodyText }}>
                      {String(cd.targetTitle ?? cd.targetNodeTitle ?? '?')}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: t.dimText }}>
                      {typeof cd.perceivedDifficulty === 'number' ? `${(cd.perceivedDifficulty * 100).toFixed(0)}%` : ''}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </TraceRow>
          )
        }
        // currentNode 对象
        if (key === 'currentNode' && typeof val === 'object' && val) {
          const node = val as Record<string, unknown>
          return (
            <TraceRow key={key} label="当前节点">
              <Typography sx={{ fontSize: 11, color: t.bodyText, fontWeight: 500 }}>
                {String(node.title ?? '?')}
                <Typography component="span" sx={{ fontSize: 10, color: t.dimText, ml: 0.5 }}>({String(node.type ?? '')})</Typography>
              </Typography>
              {typeof node.content === 'string' && node.content && (
                <Typography sx={{ fontSize: 10, color: t.mutedText, mt: 0.25 }}>
                  {node.content.slice(0, 100)}{node.content.length > 100 ? '…' : ''}
                </Typography>
              )}
            </TraceRow>
          )
        }
        // retryHistory
        if (key === 'retryHistory' && Array.isArray(val)) {
          if (val.length === 0) return null
          return (
            <TraceRow key={key} label="重试历史">
              <Typography sx={{ fontSize: 11, color: t.mutedText }}>{val.length} 条记录</Typography>
            </TraceRow>
          )
        }
        // personality 数组
        if (key === 'personality' && Array.isArray(val)) {
          return (
            <TraceRow key={key} label="性格">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                {(val as Array<Record<string, unknown>>).map((dim, i) => {
                  const v = typeof dim.value === 'number' ? dim.value as number : 0.5
                  const barColor = v < 0.3 ? c.diffEasy : v < 0.7 ? c.diffMedium : c.stepLeader
                  return (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography sx={{ fontSize: 10, color: t.dimText, width: 52, flexShrink: 0 }}>{String(dim.name)}</Typography>
                      <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: t.chipBg, overflow: 'hidden', maxWidth: 80 }}>
                        <Box sx={{ width: `${v * 100}%`, height: '100%', borderRadius: 2, bgcolor: barColor }} />
                      </Box>
                      <Typography sx={{ fontSize: 10, color: t.bodyText, fontWeight: 600, width: 28, fontVariantNumeric: 'tabular-nums' }}>
                        {v.toFixed(2)}
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            </TraceRow>
          )
        }

        // 已知字段名映射
        const labelMap: Record<string, string> = {
          task: '任务', originalTask: '任务',
          totalSteps: '总步数', retryCount: '重试次数',
          agentResult: 'Agent结果', action: '动作', edgeId: '选择边',
          reason: '理由', thinking: '思考', passed: '通过', feedback: '反馈',
          isLoop: '循环', message: '消息', reply: '回复', status: '状态',
          command: '命令', content: '内容', description: '描述',
        }
        const label = labelMap[key] ?? key

        // 渲染值
        if (val === null || val === undefined) return null

        if (typeof val === 'string') {
          const truncated = val.length > 500 ? val.slice(0, 500) + '…' : val
          return (
            <TraceRow key={key} label={label}>
              <Typography sx={{ fontSize: 11, color: t.bodyText, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {truncated}
              </Typography>
            </TraceRow>
          )
        }
        if (typeof val === 'number') {
          const display = key.includes('ifficulty') ? `${(val * 100).toFixed(0)}%` : String(val)
          return (
            <TraceRow key={key} label={label}>
              <Typography sx={{ fontSize: 11, color: t.bodyText }}>{display}</Typography>
            </TraceRow>
          )
        }
        if (typeof val === 'boolean') {
          return (
            <TraceRow key={key} label={label}>
              <Typography sx={{ fontSize: 11, color: val ? c.success : c.error, fontWeight: 600 }}>{val ? '是' : '否'}</Typography>
            </TraceRow>
          )
        }
        // 对象或数组 fallback：递归渲染为缩进块
        if (typeof val === 'object') {
          const jsonStr = JSON.stringify(val, null, 2)
          return (
            <TraceRow key={key} label={label}>
              <Box
                component="pre"
                sx={{
                  fontSize: 10, color: t.mutedText, m: 0, p: 0.5,
                  bgcolor: t.chipBg, borderRadius: '4px',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 100, overflowY: 'auto',
                }}
              >
                {jsonStr.length > 300 ? jsonStr.slice(0, 300) + '…' : jsonStr}
              </Box>
            </TraceRow>
          )
        }

        return (
          <TraceRow key={key} label={label}>
            <Typography sx={{ fontSize: 11, color: t.bodyText }}>{String(val)}</Typography>
          </TraceRow>
        )
      })}
    </Box>
  )
}

function TraceDetail({ trace }: { trace?: LLMTrace }) {
  const t = useStepTheme()
  const c = useColors()
  const [open, setOpen] = useState(false)

  if (!trace) return null
  const hasContent = trace.prompt || trace.rawResponse || trace.model || trace.tokenUsage || trace.latencyMs
  if (!hasContent) return null

  return (
    <Box sx={{ mt: 1 }}>
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open) } }}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          cursor: 'pointer', userSelect: 'none',
          '&:hover': { '& .trace-label': { color: c.stepTool } },
        }}
      >
        <ExpandMoreIcon
          sx={{
            fontSize: 16, color: t.dimText,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
        <Typography className="trace-label" sx={{ fontSize: 11, color: t.dimText, transition: 'color 0.15s' }}>
          {open ? '收起溯源' : '溯源详情'}
        </Typography>
        {trace.model && (
          <Chip
            label={trace.model}
            size="small"
            sx={{
              height: 16, fontSize: 9, ml: 0.5,
              bgcolor: 'transparent', color: t.dimText,
              border: `1px solid ${t.chipBorder}`,
              '& .MuiChip-label': { px: 0.5 },
            }}
          />
        )}
        {trace.latencyMs != null && (
          <Typography sx={{ fontSize: 10, color: t.dimText, ml: 0.5, fontVariantNumeric: 'tabular-nums' }}>
            {trace.latencyMs}ms
          </Typography>
        )}
        {trace.tokenUsage && (
          <Typography sx={{ fontSize: 10, color: t.dimText, ml: 0.5, fontVariantNumeric: 'tabular-nums' }}>
            {trace.tokenUsage.prompt}+{trace.tokenUsage.completion}t
          </Typography>
        )}
      </Box>
      <Collapse in={open} timeout={200}>
        <Box sx={{ mt: 0.75, pl: 1, borderLeft: `2px solid ${t.chipBorder}`, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {trace.prompt && (
            <Box>
              <Typography sx={{ fontSize: 10, color: t.dimText, mb: 0.5, fontWeight: 600 }}>Prompt</Typography>
              <Box sx={{ pl: 0.5 }}>
                <FriendlyContent text={trace.prompt} />
              </Box>
            </Box>
          )}
          {trace.rawResponse && (
            <Box>
              <Typography sx={{ fontSize: 10, color: t.dimText, mb: 0.5, fontWeight: 600 }}>Response</Typography>
              <Box sx={{ pl: 0.5 }}>
                <FriendlyContent text={trace.rawResponse} />
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

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

/** 将连续的 leader_step + leader_decision 合并为路径选择组 */
interface MergedStep {
  kind: 'path_choice' | 'leader_return' | 'single'
  /** path_choice: leader_step + leader_decision */
  leaderStep?: ThinkingStep
  decision?: ThinkingStep
  /** single / leader_return: 其他类型 */
  step?: ThinkingStep
}

function mergeSteps(steps: ThinkingStep[]): MergedStep[] {
  const result: MergedStep[] = []
  let i = 0
  while (i < steps.length) {
    const cur = steps[i]
    if (cur.type === 'leader_step' && i + 1 < steps.length && steps[i + 1].type === 'leader_decision') {
      result.push({ kind: 'path_choice', leaderStep: cur, decision: steps[i + 1] })
      i += 2
    } else if (cur.type === 'leader_step') {
      // leader_step 还没有对应的 decision（正在思考中）
      result.push({ kind: 'path_choice', leaderStep: cur })
      i++
    } else if (cur.type === 'leader_decision') {
      // 孤立的 decision（不应该出现，兜底）
      result.push({ kind: 'single', step: cur })
      i++
    } else if (cur.type === 'leader_return') {
      result.push({ kind: 'leader_return', step: cur })
      i++
    } else {
      result.push({ kind: 'single', step: cur })
      i++
    }
  }
  return result
}

/* ── 路径选择卡片（合并 leader_step + leader_decision） ── */

function PathChoiceCard({
  leaderStep,
  decision,
  stepNumber,
  index,
  isHistory,
}: {
  leaderStep: ThinkingStep
  decision?: ThinkingStep
  stepNumber: number
  index: number
  isHistory?: boolean
}) {
  const c = useColors()
  const t = useStepTheme()
  const graphNodes = useGraphStore((s) => s.nodes)

  const stepData = leaderStep.data as LeaderStepPayload
  const decisionData = decision?.data as LeaderDecisionPayload | undefined
  const chosenEdgeId = decisionData?.chosenEdgeId
  const isDecisionStreaming = !!decisionData && decisionData.done === false
  const isStepStreaming = stepData.done === false
  const isDecisionFinal = !!decision && !isDecisionStreaming
  const [revealDecision, setRevealDecision] = useState(Boolean(isHistory && isDecisionFinal))

  useEffect(() => {
    if (!isDecisionFinal) {
      setRevealDecision(false)
      return
    }
    if (isHistory) {
      setRevealDecision(true)
      return
    }

    // 即使 LLM 很快返回最终选择，也保留一次清晰轮选窗口，避免结果“瞬间跳出”。
    setRevealDecision(false)
    const revealDelayMs = Math.min(1800, Math.max(900, stepData.candidates.length * 420))
    const timer = window.setTimeout(() => setRevealDecision(true), revealDelayMs)
    return () => window.clearTimeout(timer)
  }, [isDecisionFinal, isHistory, stepData.stepIndex, stepData.candidates.length, decisionData?.chosenEdgeId, decisionData?.totalSteps])

  const isDecided = isDecisionFinal && revealDecision
  const isStopped = isDecided && !chosenEdgeId

  // ── 显示状态直接跟随数据，无人为延时 ──
  // 候选列表始终显示；最终 decision 揭示前保持单项轮选高亮
  const isAwaiting = !isDecided
  const showDecision = isDecided
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0)

  useEffect(() => {
    if (!isAwaiting || stepData.candidates.length === 0) {
      setActiveCandidateIndex(0)
      return
    }

    setActiveCandidateIndex(0)
    const timer = window.setInterval(() => {
      setActiveCandidateIndex((current) => (current + 1) % stepData.candidates.length)
    }, 420)

    return () => window.clearInterval(timer)
  }, [isAwaiting, stepData.stepIndex, stepData.candidates.length])

  const accentColor = c.textMuted

  // 从图谱中查找当前节点标题
  const currentNodeTitle = graphNodes.find(n => n.id === stepData.currentNodeId)?.title
    ?? stepData.currentNodeId?.slice(0, 8) ?? '?'

  return (
    <Box
      sx={{
        pb: 1.5,
        background: 'transparent',
      }}
    >
      {/* 卡片主体 */}
      <div
        className="step-card"
        style={{
          borderRadius: 10,
          background: t.cardBg,
          border: `1px solid ${t.chipBorder}`,
          overflow: 'hidden',
          animationDelay: `${index * 0.06}s`,
        }}
      >

        {/* 标题栏：步骤编号 + 当前节点 + 时间 */}
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 2, py: 1,
            background: t.cardHeaderBg,
          }}
        >
          <RouteIcon sx={{ fontSize: 15, color: c.stepLeader }} />
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: t.bodyText, letterSpacing: '0.02em' }}>
            #{stepNumber}
          </Typography>
          {isAwaiting && (
            <Box
              aria-label="Leader 正在轮选候选路径"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: accentColor,
                animation: 'candidatePulse 1.2s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
          )}
          <Typography sx={{ fontSize: 13, color: t.bodyText, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {currentNodeTitle}
          </Typography>
          {stepData.candidates.length > 0 && (
            <Chip
              label={`${stepData.candidates.length} 条路径`}
              size="small"
              sx={{
                height: 18, fontSize: 11,
                bgcolor: t.chipBg, color: t.dimText,
                border: `1px solid ${t.chipBorder}`,
              }}
            />
          )}
          <Typography sx={{ fontSize: 12, color: t.dimText, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {formatTime(leaderStep.timestamp)}
          </Typography>
        </Box>

        {/* 岔路列表 */}
        <Box sx={{ px: 2, py: 1.5 }}>
          {stepData.candidates.length === 0 && (
            <Typography sx={{ fontSize: 13, color: t.mutedText, fontStyle: 'italic' }}>
              无出边，自动停止
            </Typography>
          )}
          {stepData.candidates.map((cd, cdIdx) => {
            const isChosen = showDecision && chosenEdgeId === cd.edgeId
            const isScanning = isAwaiting && stepData.candidates.length > 0
            const isActiveScan = isScanning && cdIdx === activeCandidateIndex

            return (
              <Box
                key={cd.edgeId}
                className="candidate-row"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.6,
                  px: 1,
                  mb: 0.5,
                  borderRadius: '6px',
                  border: `1px solid ${isChosen ? `${c.primary}40` : isActiveScan ? `${c.primary}55` : isScanning ? `${c.primary}14` : 'transparent'}`,
                  bgcolor: isChosen ? `${c.primary}08` : isActiveScan ? `${c.primary}14` : 'transparent',
                  transform: isActiveScan ? 'translate3d(3px, 0, 0)' : 'translate3d(0, 0, 0)',
                  transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms cubic-bezier(0.22, 1, 0.36, 1), border-color 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                  willChange: isScanning ? 'transform, background-color, border-color' : undefined,
                  // 已揭示决策但未被选中的候选项降低透明度
                  opacity: showDecision && !isChosen ? 0.5 : isScanning && !isActiveScan ? 0.72 : 1,
                  // 非等待态保留候选项交错入场；等待态交给 activeCandidateIndex 持续轮换
                  animation: isScanning ? undefined : 'stepSlideIn 0.25s cubic-bezier(0.22, 1, 0.36, 1) backwards',
                  animationDelay: isScanning ? undefined : `${cdIdx * 0.05}s`,
                }}
              >
                {/* 状态图标：决策前保持未选中；决策后只给被选中的项打勾 */}
                {isChosen ? (
                  <ChosenIcon className="candidate-check-in" sx={{ fontSize: 15, color: c.primary, flexShrink: 0 }} />
                ) : showDecision && isStopped ? (
                  <StopIcon sx={{ fontSize: 14, color: t.dimText, flexShrink: 0 }} />
                ) : showDecision ? (
                  <DotIcon sx={{ fontSize: 6, color: t.dimText, flexShrink: 0, mx: '4.5px' }} />
                ) : (
                  <ChevronRightIcon sx={{ fontSize: 16, color: isActiveScan ? c.primary : isScanning ? accentColor : t.dimText, flexShrink: 0, transition: 'color 220ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
                )}

                {/* 目标节点名 */}
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: isChosen ? 600 : 400,
                    color: isChosen ? c.primary : t.brightText,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cd.targetNodeTitle}
                </Typography>

                {/* 难度标签 */}
                <Chip
                  label={cd.perceivedDifficulty.toFixed(2)}
                  size="small"
                  sx={{
                    height: 18, fontSize: 11, flexShrink: 0,
                    bgcolor: isChosen ? `${c.primary}15` : `${accentColor}15`,
                    color: isChosen ? c.primary : accentColor,
                    border: `1px solid ${isChosen ? `${c.primary}30` : `${accentColor}30`}`,
                  }}
                />

                {/* 难度类型 */}
                {cd.difficultyTypes?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.3 }}>
                    {cd.difficultyTypes.slice(0, 2).map((dt) => (
                      <Chip
                        key={dt}
                        label={dt}
                        size="small"
                        sx={{
                          height: 16, fontSize: 10,
                          bgcolor: 'transparent', color: t.dimText,
                          border: `1px solid ${t.chipBorder}`,
                          '& .MuiChip-label': { px: 0.4 },
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            )
          })}

          {/* 溯源信息 */}
          <TraceDetail trace={stepData.trace} />
          {decisionData?.trace && <TraceDetail trace={decisionData.trace} />}
        </Box>
      </div>

      {/* 卡片外部：thinking + reason 简洁显示 */}
      {(stepData.thinking || decisionData?.reason) && (
        <Box sx={{ mt: 0.75, pl: 1.5 }}>
          {stepData.thinking && (
            <Typography sx={{ fontSize: 13, color: t.mutedText, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {stepData.thinking}
              {isStepStreaming && !decisionData?.reason && <span className="agent-cursor" />}
            </Typography>
          )}
          {decisionData?.reason && (
            <Typography sx={{ fontSize: 13, color: t.bodyText, whiteSpace: 'pre-wrap', lineHeight: 1.6, mt: stepData.thinking ? 0.5 : 0 }}>
              {decisionData.reason}
              {isDecisionStreaming && <span className="agent-cursor" />}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}

/* ── 通用步骤内容渲染（agent_stream / boss_verdict / learning_progress） ── */

function StepContent({ step }: { step: ThinkingStep }) {
  const c = useColors()
  const t = useStepTheme()
  switch (step.type) {
    case 'agent_stream': {
      const data = step.data as AgentStreamPayload
      return (
        <Box sx={{ position: 'relative' }}>
          <MarkdownRenderer content={data.chunk} color={t.agentText} />
          {!data.done && <span className="agent-cursor" />}
          {data.done && <TraceDetail trace={data.trace} />}
        </Box>
      )
    }
    case 'boss_verdict': {
      const data = step.data as BossVerdictPayload
      const isStreaming = data.done === false
      const isUncertain = data.uncertain || data.verdict === 'uncertain'
      const verdictColor = isStreaming ? c.textMuted : isUncertain ? c.warning : data.passed ? c.success : c.error
      const verdictLabel = isStreaming ? '评审中' : isUncertain ? '不确定' : data.passed ? '通过' : data.isLoop ? '循环' : '未通过'
      return (
        <>
          <Chip
            label={verdictLabel}
            size="small"
            sx={{
              height: 22, fontSize: 13, mb: 0.5,
              bgcolor: `${verdictColor}20`,
              color: verdictColor,
              border: `1px solid ${verdictColor}40`,
            }}
          />
          {!isStreaming && !data.passed && !isUncertain && (
            <Typography style={{ color: t.mutedText, fontSize: 14 }}>
              重试: {data.retryCount}
            </Typography>
          )}
          {!isStreaming && isUncertain && (
            <Typography style={{ color: t.mutedText, fontSize: 13, marginBottom: 4 }}>
              已停止自动重试，避免继续消耗 token
            </Typography>
          )}
          <Typography style={{ color: t.bodyText, fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {data.feedback || (isStreaming ? '等待 Boss 评审输出...' : '')}
            {isStreaming && <span className="agent-cursor" />}
          </Typography>
          {!isStreaming && <TraceDetail trace={data.trace} />}
        </>
      )
    }
    case 'learning_progress': {
      const data = step.data as LearningProgressPayload
      const phaseLabel: Record<string, string> = {
        analyzing: '分析中', generating: '生成中', creating_nodes: '创建节点',
        evaluating_edges: '评估连接', creating_edges: '创建连接', done: '完成', error: '错误',
      }
      const phaseColor = data.phase === 'done' ? c.success : data.phase === 'error' ? c.error : c.textMuted
      return (
        <>
          <Chip
            label={phaseLabel[data.phase] ?? data.phase}
            size="small"
            sx={{
              height: 22, fontSize: 13, mb: 0.5,
              bgcolor: `${phaseColor}20`, color: phaseColor,
              border: `1px solid ${phaseColor}40`,
            }}
          />
          <Typography style={{ color: t.bodyText, fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {data.message}
          </Typography>
          {data.totalNodes != null && data.nodesCreated != null && (
            <Box sx={{ mt: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={data.totalNodes > 0 ? (data.nodesCreated / data.totalNodes) * 100 : 0}
                sx={{
                  height: 4, borderRadius: 2,
                  bgcolor: t.progressBg,
                  '& .MuiLinearProgress-bar': {
                    bgcolor: c.textMuted,
                    borderRadius: 2,
                  },
                }}
              />
            </Box>
          )}
          <TraceDetail trace={data.trace} />
        </>
      )
    }
    default:
      return null
  }
}

/* ── 通用步骤卡片（非路径选择类型） ── */

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
  const t = useStepTheme()
  const stepColors = useStepColors()
  const [expanded, setExpanded] = useState(true)
  const icons = STEP_ICONS[step.type]
  const Icon = icons.icon

  const accentColor = stepColors[step.type]

  const isVerdict = step.type === 'boss_verdict'
  const isAgent = step.type === 'agent_stream'
  const agentData = isAgent ? step.data as AgentStreamPayload : null
  const isWaiting = isLast && isBusy && (!isAgent || agentData?.done === false)
  const cardClass = `step-card${isVerdict ? ' step-card--verdict' : ''}${isWaiting ? ' step-card--waiting' : ''}`

  return (
    <Box sx={{ pb: 1.5, background: 'transparent' }}>
      <div
        className={cardClass}
        style={{
          borderRadius: 10,
          background: t.cardBg,
          border: `1px solid ${t.chipBorder}`,
          overflow: 'hidden',
          animationDelay: `${index * 0.06}s`,
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) } }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', cursor: 'pointer',
            background: t.cardHeaderBg,
            transition: 'background 0.15s', position: 'relative',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.cardHeaderHover }}
          onMouseLeave={(e) => { e.currentTarget.style.background = t.cardHeaderBg }}
        >
          <Icon sx={{ fontSize: 16 }} style={{ color: accentColor }} />
          <span style={{ fontWeight: 600, color: t.bodyText, flex: 1, fontSize: 14, letterSpacing: '0.02em' }}>
            {icons.label}
          </span>
          <span style={{ color: t.dimText, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(step.timestamp)}
          </span>
          <ExpandMoreIcon
            sx={{
              fontSize: 18, color: t.dimText,
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
  session, isActive, isViewing, onClick, onDelete,
}: {
  session: ChatSession; isActive: boolean; isViewing: boolean; onClick: () => void; onDelete: () => void
}) {
  const c = useColors()
  const t = useStepTheme()
  const statusIcon = session.status === 'running'
    ? <RunningIcon sx={{ fontSize: 14, color: c.warning }} />
    : session.status === 'success'
      ? <SuccessIcon sx={{ fontSize: 14, color: c.success }} />
      : <ErrorIcon sx={{ fontSize: 14, color: c.error }} />

  const typeColor = session.type === 'learn' ? c.stepLearn : c.primary
  const displayPrompt = session.type === 'learn' && session.prompt.startsWith('学习: ')
    ? session.prompt.slice(4) : session.prompt

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`${session.type === 'learn' ? '学习' : '对话'}会话: ${displayPrompt}`}
      onClick={onClick}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
        cursor: 'pointer', borderRadius: '8px',
        border: `1px solid ${isViewing ? typeColor + '40' : 'transparent'}`,
        bgcolor: isViewing ? typeColor + '08' : isActive ? `${c.primary}05` : 'transparent',
        transition: 'all 0.15s',
        '&:hover': { bgcolor: isViewing ? typeColor + '12' : t.historyHover },
        mb: 0.5,
      }}
    >
      <Box sx={{ width: 3, height: 28, borderRadius: 2, bgcolor: typeColor, opacity: isViewing ? 1 : 0.4, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, color: isViewing ? c.text : c.textSecondary, fontWeight: isViewing ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {displayPrompt}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          {statusIcon}
          <Typography sx={{ fontSize: 12, color: c.textMuted }}>{formatSessionTime(session.timestamp)}</Typography>
          <Typography sx={{ fontSize: 12, color: c.textMuted }}>· {session.thinkingSteps.length} 步</Typography>
        </Box>
      </Box>
      {!isActive && (
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          sx={{ p: 0.25, minWidth: 36, minHeight: 36, color: c.textMuted, opacity: 0, '.MuiBox-root:hover > &': { opacity: 1 }, '&:hover': { color: c.error } }}
          aria-label="删除会话"
        >
          <DeleteIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  )
}

/* ── 空状态 ── */

function EmptyState() {
  const c = useColors()
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, userSelect: 'none' }}>
      <Box sx={{ position: 'relative', width: 64, height: 64 }}>
        <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${c.primary}`, animation: 'emptyRing 3s ease-in-out infinite' }} />
        <Box sx={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `1px solid ${c.primary}`, animation: 'emptyRing 3s ease-in-out infinite 0.4s' }} />
        <Box sx={{ position: 'absolute', inset: 16, borderRadius: '50%', bgcolor: `${c.primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'emptyPulse 3s ease-in-out infinite' }}>
          <ThinkIcon sx={{ fontSize: 20, color: c.primary, opacity: 0.6 }} />
        </Box>
      </Box>
      <Typography sx={{ color: c.textMuted, fontSize: 14, letterSpacing: '0.08em' }}>等待指令...</Typography>
    </Box>
  )
}

/* ── Leader 回退卡片 ── */

function LeaderReturnCard({ step }: { step: ThinkingStep }) {
  const c = useColors()
  const data = step.data as LeaderReturnPayload
  return (
    <Box sx={{
      mb: 1, p: 1.5, borderRadius: '8px',
      bgcolor: `${c.warning}08`, border: `1px solid ${c.warning}30`,
      display: 'flex', alignItems: 'center', gap: 1,
    }}>
      <UndoIcon sx={{ fontSize: 16, color: c.warning }} />
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: c.warning }}>
          回退到节点：{data.returnToNodeTitle}
        </Typography>
        <Typography sx={{ fontSize: 11, color: c.textSecondary, mt: 0.3 }}>
          {data.reason}（步骤 {data.returnToStepIndex + 1}）
        </Typography>
      </Box>
    </Box>
  )
}

/* ── 路径概览条 ── */

function PathOverview({ mergedSteps }: { mergedSteps: MergedStep[] }) {
  const c = useColors()
  const t = useStepTheme()
  const graphNodes = useGraphStore((s) => s.nodes)

  // 从 path_choice 步骤中提取路径节点
  const pathNodes: Array<{ nodeId: string; title: string; chosen: boolean; stopped: boolean }> = []

  for (const merged of mergedSteps) {
    if (merged.kind !== 'path_choice' || !merged.leaderStep) continue
    const stepData = merged.leaderStep.data as LeaderStepPayload
    const decisionData = merged.decision?.data as LeaderDecisionPayload | undefined
    const nodeTitle = graphNodes.find(n => n.id === stepData.currentNodeId)?.title ?? stepData.currentNodeId?.slice(0, 6)

    const chosenEdgeId = decisionData?.chosenEdgeId
    const chosenTarget = chosenEdgeId ? stepData.candidates.find(cd => cd.edgeId === chosenEdgeId) : null
    const isStopped = !!merged.decision && !chosenEdgeId

    pathNodes.push({ nodeId: stepData.currentNodeId, title: nodeTitle, chosen: !!chosenTarget, stopped: isStopped })

    // 如果是最后一步且选了目标，把目标也加上
    if (chosenTarget && merged === mergedSteps.filter(m => m.kind === 'path_choice').at(-1)) {
      pathNodes.push({ nodeId: chosenTarget.targetNodeId, title: chosenTarget.targetNodeTitle, chosen: false, stopped: false })
    }
  }

  if (pathNodes.length < 2) return null

  return (
    <Box sx={{
      mb: 1.5, px: 1.5, py: 1, borderRadius: '8px',
      bgcolor: `${c.primary}06`, border: `1px solid ${c.primary}15`,
      display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap',
      overflow: 'hidden',
    }}>
      <RouteIcon sx={{ fontSize: 13, color: c.primary, mr: 0.25, flexShrink: 0 }} />
      {pathNodes.map((node, i) => (
        <Box key={`${node.nodeId}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {i > 0 && (
            <Typography sx={{ fontSize: 11, color: node.stopped ? c.error : t.dimText, lineHeight: 1 }}>
              {node.stopped ? '✕' : '→'}
            </Typography>
          )}
          <Typography sx={{
            fontSize: 11, color: i === pathNodes.length - 1 && !node.stopped ? c.primary : t.bodyText,
            fontWeight: i === 0 || i === pathNodes.length - 1 ? 600 : 400,
            whiteSpace: 'nowrap',
          }}>
            {node.title}
          </Typography>
        </Box>
      ))}
      <Typography sx={{ fontSize: 10, color: t.dimText, ml: 'auto', flexShrink: 0 }}>
        {pathNodes.length - 1} 步
      </Typography>
    </Box>
  )
}

/* ── Prompt 区域（支持展开/收起） ── */

function PromptCard({ prompt, isHistory }: { prompt: string; isHistory: boolean }) {
  const c = useColors()
  const t = useStepTheme()
  const [expanded, setExpanded] = useState(true)
  const isLearn = prompt.startsWith('学习:') || prompt.startsWith('学习: ')
  const label = isLearn ? '学习主题' : '任务'
  const displayText = isLearn && prompt.startsWith('学习: ') ? prompt.slice(4) : prompt
  const isLong = displayText.length > 80

  return (
    <Box
      sx={{
        mb: 2, borderRadius: '10px',
        bgcolor: isHistory ? t.cardBg : `${c.primary}08`,
        border: `1px solid ${isHistory ? c.border : `${c.primary}20`}`,
        overflow: 'hidden',
      }}
    >
      <Box
        role="button"
        tabIndex={isLong ? 0 : undefined}
        aria-expanded={isLong ? expanded : undefined}
        onClick={() => isLong && setExpanded(!expanded)}
        onKeyDown={isLong ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) } } : undefined}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 2, py: 1.25,
          cursor: isLong ? 'pointer' : 'default',
        }}
      >
        <Typography sx={{ fontSize: 13, color: c.textMuted }}>{label}</Typography>
        <Box sx={{ flex: 1 }} />
        {isLong && (
          <ExpandMoreIcon
            sx={{
              fontSize: 16, color: c.textMuted,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        )}
      </Box>
      {isLong ? (
        <Collapse in={expanded} timeout={200}>
          <Box sx={{ px: 2, pb: 1.5 }}>
            <Typography sx={{ fontSize: 15, color: c.text, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
              {displayText}
            </Typography>
          </Box>
        </Collapse>
      ) : (
        <Box sx={{ px: 2, pb: 1.5, mt: -0.5 }}>
          <Typography sx={{ fontSize: 15, color: c.text, fontWeight: 500 }}>
            {displayText}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

/* ── 主面板 ── */

export function ThinkingPanel() {
  const c = useColors()
  const t = useStepTheme()
  const isRunning = useTaskExecutionStore((s) => s.isRunning)
  const isLearning = useTaskExecutionStore((s) => s.isLearning)
  const thinkingSteps = useTaskExecutionStore((s) => s.thinkingSteps)
  const currentTaskPrompt = useTaskExecutionStore((s) => s.currentTaskPrompt)
  const error = useTaskExecutionStore((s) => s.error)
  const pendingPlan = useTaskExecutionStore((s) => s.pendingPlan)
  const pendingStep = useTaskExecutionStore((s) => s.pendingStep)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const viewingSessionId = useSessionStore((s) => s.viewingSessionId)
  const viewSession = useSessionStore((s) => s.viewSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const queue = useQueueStore((s) => s.queue)
  const removeFromQueue = useQueueStore((s) => s.removeFromQueue)
  const approvePlan = useTaskStore((s) => s.approvePlan)
  const rejectPlan = useTaskStore((s) => s.rejectPlan)
  const approveStep = useTaskStore((s) => s.approveStep)
  const rejectStep = useTaskStore((s) => s.rejectStep)
  const returnToNode = useTaskStore((s) => s.returnToNode)
  const returnToPlanNode = useTaskStore((s) => s.returnToPlanNode)

  const retryCurrentTask = useTaskStore((s) => s.retryCurrentTask)

  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollContentRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)
  const historyScrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const historyScrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const shouldFollowOutputRef = useRef(true)
  const seenContentSizeRef = useRef(0)
  const scrollFrameRef = useRef<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [returnMenuOpen, setReturnMenuOpen] = useState(false)
  const [isFollowingOutput, setIsFollowingOutput] = useState(true)
  const [newContentSize, setNewContentSize] = useState(0)

  const busy = isRunning || isLearning
  const sessionsHasMore = useSessionStore((s) => s.sessionsHasMore)
  const sessionsLoading = useSessionStore((s) => s.sessionsLoading)
  const loadMoreSessions = useSessionStore((s) => s.loadMoreSessions)

  const viewingSession = useMemo(() => {
    if (!viewingSessionId) return null
    return sessions.find((s) => s.id === viewingSessionId) ?? null
  }, [viewingSessionId, sessions])

  const displaySteps = viewingSession ? viewingSession.thinkingSteps : thinkingSteps
  const displayPrompt = viewingSession ? viewingSession.prompt : currentTaskPrompt
  const isViewingHistory = viewingSession !== null

  const historySessions = useMemo(() => {
    return sessions.filter((s) => s.status !== 'running').reverse()
  }, [sessions])

  // 合并步骤
  const mergedSteps = useMemo(() => mergeSteps(displaySteps), [displaySteps])
  const latestStep = displaySteps.at(-1)
  const latestAgentData = latestStep?.type === 'agent_stream' ? latestStep.data as AgentStreamPayload : null
  const isLatestRoutingStep = latestStep?.type === 'leader_step' || latestStep?.type === 'leader_decision'
  const showWaitingResponse = busy && !isViewingHistory && !isLatestRoutingStep && (!latestStep || latestStep.type !== 'agent_stream' || latestAgentData?.done === true)
  const displayContentSize = useMemo(() => {
    return countTextContent(displayPrompt) + displaySteps.reduce((total, step) => total + countTextContent(step.data), 0)
  }, [displayPrompt, displaySteps])

  const scrollToOutputBottom = useCallback((force = false) => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return
    if (!force && !shouldFollowOutputRef.current) return

    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current)
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      scrollElement.scrollTop = scrollElement.scrollHeight
    })
  }, [])

  const handleOutputScroll = useCallback(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    const isNearBottom = isNearScrollBottom(scrollElement)
    shouldFollowOutputRef.current = isNearBottom
    setIsFollowingOutput(isNearBottom)

    if (isNearBottom) {
      seenContentSizeRef.current = displayContentSize
      setNewContentSize(0)
    } else if (seenContentSizeRef.current === 0) {
      seenContentSizeRef.current = displayContentSize
    }
  }, [displayContentSize, isViewingHistory])

  const handleJumpToLatest = useCallback(() => {
    shouldFollowOutputRef.current = true
    seenContentSizeRef.current = displayContentSize
    setIsFollowingOutput(true)
    setNewContentSize(0)
    scrollToOutputBottom(true)
  }, [displayContentSize, scrollToOutputBottom])

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isViewingHistory) return
    shouldFollowOutputRef.current = true
    setIsFollowingOutput(true)
    setNewContentSize(0)
    seenContentSizeRef.current = 0
    scrollToOutputBottom(true)
  }, [activeSessionId, currentTaskPrompt, isViewingHistory, scrollToOutputBottom])

  useLayoutEffect(() => {
    if (isViewingHistory) return

    if (shouldFollowOutputRef.current) {
      seenContentSizeRef.current = displayContentSize
      setNewContentSize(0)
      scrollToOutputBottom()
      return
    }

    if (displayContentSize < seenContentSizeRef.current) {
      seenContentSizeRef.current = displayContentSize
      setNewContentSize(0)
      return
    }

    setNewContentSize(displayContentSize - seenContentSizeRef.current)
  }, [displayContentSize, showWaitingResponse, pendingPlan, pendingStep, busy, isViewingHistory, scrollToOutputBottom])

  useEffect(() => {
    if (isViewingHistory) return
    const contentElement = scrollContentRef.current
    if (!contentElement) return

    const syncScroll = () => scrollToOutputBottom()
    const mutationObserver = new MutationObserver(syncScroll)
    mutationObserver.observe(contentElement, { childList: true, subtree: true, characterData: true })

    const resizeObserver = new ResizeObserver(syncScroll)
    resizeObserver.observe(contentElement)

    scrollToOutputBottom(true)

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [isViewingHistory, scrollToOutputBottom])

  useEffect(() => {
    if (isViewingHistory && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [viewingSessionId, isViewingHistory])

  // 渐进式滚动加载历史会话：滚动到历史列表顶部时加载更早记录
  useEffect(() => {
    const historyScroll = historyScrollRef.current
    const loadMoreMarker = loadMoreRef.current
    if (!historyOpen || !historyScroll || !loadMoreMarker) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && sessionsHasMore && !sessionsLoading) {
          historyScrollSnapshotRef.current = {
            scrollHeight: historyScroll.scrollHeight,
            scrollTop: historyScroll.scrollTop,
          }
          loadMoreSessions()
        }
      },
      { root: historyScroll, threshold: 0.1 },
    )
    observer.observe(loadMoreMarker)
    return () => observer.disconnect()
  }, [historyOpen, sessionsHasMore, sessionsLoading, loadMoreSessions])

  useLayoutEffect(() => {
    const snapshot = historyScrollSnapshotRef.current
    const historyScroll = historyScrollRef.current
    if (!snapshot || !historyScroll) return
    historyScroll.scrollTop = historyScroll.scrollHeight - snapshot.scrollHeight + snapshot.scrollTop
    historyScrollSnapshotRef.current = null
  }, [historySessions.length])

  const statusColor = useMemo(() => {
    if (isLearning) return c.textMuted
    if (isRunning) return c.textMuted
    return c.textMuted
  }, [isRunning, isLearning, c.primary, c.textMuted])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2.5 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexShrink: 0 }}>
        {isViewingHistory ? (
          <>
            <Tooltip title="返回当前">
              <IconButton size="small" onClick={() => viewSession(null)} sx={{ p: 0.25, color: c.textSecondary, '&:hover': { color: c.primary } }} aria-label="返回当前">
                <BackIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Typography sx={{ fontWeight: 600, color: c.textSecondary, fontSize: 16 }}>历史记录</Typography>
          </>
        ) : (
          <>
            <ThinkIcon sx={{ fontSize: 18, color: c.primary }} />
            <Typography sx={{ fontWeight: 600, color: c.text, fontSize: 16 }}>思考过程</Typography>
            <Box
              sx={{
                width: 7, height: 7, borderRadius: '50%', bgcolor: statusColor, ml: 0.5,
                '--status-color': statusColor,
                animation: busy ? 'statusPulse 1.5s ease-in-out infinite' : 'none',
                transition: 'background-color 0.3s',
              }}
            />
          </>
        )}
        <Box sx={{ flex: 1 }} />
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
              aria-label={historyOpen ? '收起历史' : '展开历史'}
            >
              <HistoryIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* 历史会话列表 */}
      <Collapse in={historyOpen && historySessions.length > 0} timeout={200}>
        <Box ref={historyScrollRef} sx={{ mb: 2, maxHeight: 320, overflowY: 'auto', borderRadius: '10px', border: `1px solid ${c.border}`, bgcolor: t.historyBg, p: 1, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, px: 0.5 }}>
            <Typography sx={{ fontSize: 11, color: c.textMuted, fontWeight: 500 }}>历史会话 ({historySessions.length}{sessionsHasMore ? '+' : ''})</Typography>
          </Box>
          {/* 顶部加载哨兵 */}
          <div ref={loadMoreRef} style={{ height: 1 }} />
          {sessionsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <CircularProgress size={18} thickness={4} sx={{ color: c.primary }} />
            </Box>
          )}
          {!sessionsHasMore && historySessions.length > 0 && (
            <Typography sx={{ fontSize: 11, color: c.textMuted, textAlign: 'center', py: 0.5 }}>
              已加载全部
            </Typography>
          )}
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
            mb: 1.5, borderRadius: 2, height: 2, bgcolor: 'transparent', flexShrink: 0,
            '& .MuiLinearProgress-bar': {
              bgcolor: isLearning ? c.textMuted : c.textMuted,
              boxShadow: 'none',
            },
          }}
        />
      )}

      {/* 排队任务 */}
      {queue.length > 0 && !isViewingHistory && (
        <Box sx={{ mb: 1.5, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <QueueIcon sx={{ fontSize: 14, color: c.warning }} />
            <Typography sx={{ fontSize: 11, color: c.textMuted, fontWeight: 500 }}>
              排队中 ({queue.length})
            </Typography>
          </Box>
          {queue.map((item) => (
            <Box
              key={item.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.5, py: 0.75, mb: 0.5,
                borderRadius: '6px',
                border: `1px solid ${c.warning}25`,
                bgcolor: `${c.warning}06`,
              }}
            >
              <Box sx={{ width: 3, height: 20, borderRadius: 2, bgcolor: item.type === 'learn' ? c.stepLearn : c.primary, opacity: 0.5, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12, color: c.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.prompt}
              </Typography>
              <IconButton
                size="small"
                onClick={() => removeFromQueue(item.id)}
                sx={{ p: 0.25, minWidth: 36, minHeight: 36, color: c.textMuted, '&:hover': { color: c.error } }}
                aria-label="移除"
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {error && !isViewingHistory && (
        <Alert
          severity="error"
          action={
            <Button
              size="small"
              onClick={retryCurrentTask}
              sx={{
                fontSize: 12, textTransform: 'none', fontWeight: 600,
                color: c.error, '&:hover': { bgcolor: `${c.error}15` },
              }}
            >
              重试
            </Button>
          }
          sx={{
            mb: 1.5, fontSize: 13, bgcolor: `${c.error}10`, color: c.error,
            border: `1px solid ${c.error}30`, '& .MuiAlert-icon': { color: c.error }, flexShrink: 0,
          }}
        >
          {error}
        </Alert>
      )}

      {/* 计划审批卡片 */}
      {pendingPlan && (
        <Box sx={{
          mb: 1.5, p: 2, borderRadius: '10px', flexShrink: 0,
          bgcolor: `${c.secondary}08`, border: `1px solid ${c.secondary}30`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <RouteIcon sx={{ fontSize: 16, color: c.secondary }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: c.secondary }}>执行计划待确认</Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: c.textSecondary, mb: 1 }}>
            任务：{pendingPlan.taskPrompt}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
            {pendingPlan.path.map((node, i) => (
              <Box key={node.nodeId} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                {i > 0 && <Typography sx={{ fontSize: 11, color: c.textMuted }}>→</Typography>}
                <Tooltip title={`回退到此节点重新选择`} arrow>
                  <Chip
                    label={node.nodeTitle}
                    size="small"
                    clickable
                    onClick={() => {
                      returnToPlanNode(node.nodeId)
                    }}
                    sx={{
                      height: 22, fontSize: 11, cursor: 'pointer',
                      bgcolor: node.nodeType === 'personality' ? `${c.primary}15` : `${c.secondary}15`,
                      color: node.nodeType === 'personality' ? c.primary : c.secondary,
                      border: `1px solid ${node.nodeType === 'personality' ? `${c.primary}30` : `${c.secondary}30`}`,
                      '&:hover': { bgcolor: `${c.warning}20`, borderColor: `${c.warning}50` },
                    }}
                  />
                </Tooltip>
              </Box>
            ))}
          </Box>
          <Typography sx={{ fontSize: 11, color: c.textMuted, mb: 0.5 }}>
            共 {pendingPlan.totalSteps} 步，{pendingPlan.path.length} 个节点
          </Typography>
          <Typography sx={{ fontSize: 10, color: c.textDim, mb: 1.5 }}>
            点击路径中的节点可回退到该节点重新选择路径
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained" size="small"
              onClick={approvePlan}
              sx={{ fontSize: 12, textTransform: 'none', bgcolor: c.success, '&:hover': { bgcolor: c.successHover } }}
            >
              批准执行
            </Button>
            <Button
              variant="outlined" size="small"
              onClick={rejectPlan}
              sx={{ fontSize: 12, textTransform: 'none', borderColor: c.error, color: c.error, '&:hover': { bgcolor: `${c.error}10` } }}
            >
              拒绝
            </Button>
          </Box>
        </Box>
      )}

      {/* 步骤确认卡片 */}
      {pendingStep && (
        <Box sx={{
          mb: 1.5, p: 1.5, borderRadius: '8px', flexShrink: 0,
          bgcolor: `${c.warning}08`, border: `1px solid ${c.warning}30`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: pendingStep.returnableNodes?.length ? 1 : 0 }}>
            <Typography sx={{ fontSize: 12, color: c.text, flex: 1 }}>
              {pendingStep.description}
            </Typography>
            <Button size="small" variant="contained" onClick={approveStep}
              sx={{ fontSize: 11, textTransform: 'none', minWidth: 50, bgcolor: c.success, '&:hover': { bgcolor: c.successHover } }}>
              允许
            </Button>
            <Button size="small" variant="outlined" onClick={rejectStep}
              sx={{ fontSize: 11, textTransform: 'none', minWidth: 50, borderColor: c.error, color: c.error }}>
              拒绝
            </Button>
            {pendingStep.returnableNodes && pendingStep.returnableNodes.length > 0 && (
              <Button size="small" variant="outlined" onClick={() => setReturnMenuOpen(!returnMenuOpen)}
                startIcon={<UndoIcon sx={{ fontSize: 14 }} />}
                sx={{ fontSize: 11, textTransform: 'none', minWidth: 70, borderColor: c.warning, color: c.warning, '&:hover': { bgcolor: `${c.warning}10` } }}>
                回退
              </Button>
            )}
          </Box>
          <Collapse in={returnMenuOpen}>
            {pendingStep.returnableNodes && pendingStep.returnableNodes.length > 0 && (
              <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${c.warning}20` }}>
                <Typography sx={{ fontSize: 11, color: c.textSecondary, mb: 0.5 }}>选择回退目标节点：</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {pendingStep.returnableNodes.map((node) => (
                    <Chip
                      key={node.nodeId}
                      label={`${node.stepIndex + 1}. ${node.nodeTitle}`}
                      size="small"
                      clickable
                      onClick={() => {
                        returnToNode(node.nodeId)
                        setReturnMenuOpen(false)
                      }}
                      sx={{
                        height: 22, fontSize: 11, cursor: 'pointer',
                        bgcolor: `${c.warning}10`, color: c.warning,
                        border: `1px solid ${c.warning}30`,
                        '&:hover': { bgcolor: `${c.warning}25` },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Collapse>
        </Box>
      )}

      {/* 滚动区域 */}
      <Box className="thinking-scroll-container" sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Box ref={scrollRef} onScroll={handleOutputScroll} sx={{ height: '100%', overflowY: 'auto', pr: 0.5, pt: 0.5 }}>
          <Box ref={scrollContentRef}>
            {displayPrompt && <PromptCard prompt={displayPrompt} isHistory={isViewingHistory} />}

            {/* 路径概览条 */}
            <PathOverview mergedSteps={mergedSteps} />

            {mergedSteps.length === 0 && !displayPrompt ? (
              <EmptyState />
            ) : (
              (() => {
                let pathStepNum = 0
                return mergedSteps.map((merged, i) => {
                  const isLast = i === mergedSteps.length - 1
                  if (merged.kind === 'path_choice' && merged.leaderStep) {
                    pathStepNum++
                    return (
                      <PathChoiceCard
                        key={merged.leaderStep.id}
                        leaderStep={merged.leaderStep}
                        decision={merged.decision}
                        stepNumber={pathStepNum}
                        index={i}
                        isHistory={isViewingHistory}
                      />
                    )
                  }
                  if (merged.kind === 'leader_return' && merged.step) {
                    return <LeaderReturnCard key={merged.step.id} step={merged.step} />
                  }
                  if (merged.step) {
                    // tool_call 类型直接渲染为 ToolCallCard（自带卡片样式）
                    if (merged.step.type === 'tool_call') {
                      return (
                        <Box key={merged.step.id} sx={{ pb: 1 }}>
                          <ToolCallCard data={merged.step.data as ToolCallPayload} />
                        </Box>
                      )
                    }
                    return (
                      <StepCard
                        key={merged.step.id}
                        step={merged.step}
                        index={i}
                        isLast={isLast}
                        isBusy={!isViewingHistory && busy}
                      />
                    )
                  }
                  return null
                })
              })()
            )}

            {/* WaitingResponseCard 已移除 */}

            <div ref={bottomAnchorRef} />
          </Box>
        </Box>

        {!isFollowingOutput && (
          <Box
            sx={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 0.75,
              pointerEvents: 'none',
            }}
          >
            {!isViewingHistory && newContentSize > 0 && (
            <Box
              sx={{
                px: 1,
                py: 0.35,
                borderRadius: '999px',
                bgcolor: c.bgCard,
                color: c.textSecondary,
                border: `1px solid ${c.border}`,
                boxShadow: `0 8px 24px ${c.shadow}`,
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              {formatNewContentSize(newContentSize)}
            </Box>
            )}
            <Tooltip title="快速到底部" placement="left">
              <Button
                onClick={handleJumpToLatest}
                size="small"
                variant="contained"
                startIcon={<JumpDownIcon sx={{ fontSize: 16 }} />}
                sx={{
                  pointerEvents: 'auto',
                  minHeight: 34,
                  px: 1.35,
                  borderRadius: '999px',
                  textTransform: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  bgcolor: c.primary,
                  color: c.textInverse,
                  boxShadow: `0 10px 28px ${c.shadow}`,
                  '&:hover': { bgcolor: c.primaryDark },
                }}
                aria-label={`${formatNewContentSize(newContentSize)}，快速到底部`}
              >
                到底部
              </Button>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  )
}
