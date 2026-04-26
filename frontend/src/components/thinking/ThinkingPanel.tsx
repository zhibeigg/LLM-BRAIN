import { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react'
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
} from '@mui/icons-material'
import { useQueueStore, useSessionStore, useTaskExecutionStore, useTaskStore } from '../../stores/taskStore'
import { useGraphStore } from '../../stores/graphStore'
import type { ThinkingStep, ChatSession } from '../../stores/taskStore'
import type {
  LeaderStepPayload,
  LeaderDecisionPayload,
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
  agent_stream: { icon: AgentIcon, label: 'Agent 输出' },
  boss_verdict: { icon: BossIcon, label: 'Boss 评审' },
  learning_progress: { icon: LearnIcon, label: '知识学习' },
  tool_call: { icon: BuildIcon, label: '工具调用' },
} as const

function useStepColors() {
  const c = useColors()
  return {
    leader_step: c.stepLeader,
    leader_decision: c.primary,
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
  kind: 'path_choice' | 'single'
  /** path_choice: leader_step + leader_decision */
  leaderStep?: ThinkingStep
  decision?: ThinkingStep
  /** single: 其他类型 */
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
  isLast,
  isBusy,
}: {
  leaderStep: ThinkingStep
  decision?: ThinkingStep
  stepNumber: number
  index: number
  isLast: boolean
  isBusy: boolean
}) {
  const c = useColors()
  const t = useStepTheme()
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const graphNodes = useGraphStore((s) => s.nodes)

  const stepData = leaderStep.data as LeaderStepPayload
  const decisionData = decision?.data as LeaderDecisionPayload | undefined
  const chosenEdgeId = decisionData?.chosenEdgeId
  const isDecided = !!decision
  const isStopped = isDecided && !chosenEdgeId

  // ── 流式揭示：分阶段展示卡片内容 ──
  // phase 0: 刚挂载，只显示标题栏
  // phase 1: 展示候选列表（延迟 ~150ms）
  // phase 2: 展示决策结果（decision 到达后再延迟 ~300ms）
  // 如果挂载时 decision 已存在（历史数据 / 回放），直接跳到 phase 2
  const [phase, setPhase] = useState(() => isDecided ? 2 : 0)
  const mountedRef = useRef(false)

  useEffect(() => {
    // 历史数据已经在 phase 2，跳过
    if (mountedRef.current) return
    mountedRef.current = true
    if (isDecided) return // 挂载时已有 decision，无需动画
    // phase 0 → 1：展示候选列表
    const t1 = setTimeout(() => setPhase(1), 150)
    return () => clearTimeout(t1)
  }, [isDecided])

  useEffect(() => {
    if (phase < 1 || !isDecided || phase >= 2) return
    // phase 1 → 2：decision 到达后延迟展示结果
    const t2 = setTimeout(() => setPhase(2), 300)
    return () => clearTimeout(t2)
  }, [phase, isDecided])

  // 真正的等待态：候选列表已展示(phase>=1)，但决策结果还没展示(phase<2)
  const isAwaiting = phase >= 1 && phase < 2
  // 决策结果是否已揭示
  const showDecision = phase >= 2 && isDecided

  const accentColor = c.textMuted

  // 从图谱中查找当前节点标题
  const currentNodeTitle = graphNodes.find(n => n.id === stepData.currentNodeId)?.title
    ?? stepData.currentNodeId?.slice(0, 8) ?? '?'

  // 找到被选中的目标节点名
  const chosenTarget = chosenEdgeId
    ? stepData.candidates.find(cd => cd.edgeId === chosenEdgeId)
    : null

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
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: t.bodyText, letterSpacing: '0.02em' }}>
            #{stepNumber}
          </Typography>
          {/* 等待决策时在编号旁显示 spinner */}
          {isAwaiting && (
            <CircularProgress size={12} thickness={5} sx={{ color: accentColor }} />
          )}
          <Typography sx={{ fontSize: 12, color: t.bodyText, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {currentNodeTitle}
          </Typography>
          {stepData.candidates.length > 0 && (
            <Chip
              label={`${stepData.candidates.length} 条路径`}
              size="small"
              sx={{
                height: 18, fontSize: 10,
                bgcolor: t.chipBg, color: t.dimText,
                border: `1px solid ${t.chipBorder}`,
              }}
            />
          )}
          <Typography sx={{ fontSize: 11, color: t.dimText, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {formatTime(leaderStep.timestamp)}
          </Typography>
        </Box>

        {/* 岔路列表 —— phase >= 1 时展示 */}
        <Collapse in={phase >= 1} timeout={250}>
        <Box sx={{ px: 2, py: 1.5 }}>
          {stepData.candidates.length === 0 && (
            <Typography sx={{ fontSize: 12, color: t.mutedText, fontStyle: 'italic' }}>
              无出边，自动停止
            </Typography>
          )}
          {stepData.candidates.map((cd, cdIdx) => {
            const isChosen = showDecision && chosenEdgeId === cd.edgeId

            return (
              <Box
                key={cd.edgeId}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.6,
                  px: 1,
                  mb: 0.5,
                  borderRadius: '6px',
                  border: `1px solid ${isChosen ? `${c.primary}40` : 'transparent'}`,
                  bgcolor: isChosen ? `${c.primary}08` : 'transparent',
                  transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                  // 已揭示决策但未被选中的候选项降低透明度
                  opacity: showDecision && !isChosen ? 0.5 : 1,
                  // 候选项交错入场
                  animation: 'stepSlideIn 0.25s cubic-bezier(0.22, 1, 0.36, 1) backwards',
                  animationDelay: `${cdIdx * 0.05}s`,
                }}
              >
                {/* 状态图标：等待态 → 脉冲点 | 选中 → 打勾弹入 | 停止 → stop | 未选中 → 灰点 */}
                {isChosen ? (
                  <ChosenIcon className="candidate-check-in" sx={{ fontSize: 15, color: c.primary, flexShrink: 0 }} />
                ) : showDecision && isStopped ? (
                  <StopIcon sx={{ fontSize: 14, color: t.dimText, flexShrink: 0 }} />
                ) : showDecision ? (
                  <DotIcon sx={{ fontSize: 6, color: t.dimText, flexShrink: 0, mx: '4.5px' }} />
                ) : isAwaiting ? (
                  <DotIcon className="candidate-pulse" sx={{ fontSize: 8, color: accentColor, flexShrink: 0, mx: '3.5px' }} />
                ) : (
                  <ChevronRightIcon sx={{ fontSize: 16, color: t.dimText, flexShrink: 0 }} />
                )}

                {/* 目标节点名 */}
                <Typography
                  sx={{
                    fontSize: 13,
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
                    height: 18, fontSize: 10, flexShrink: 0,
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
                          height: 16, fontSize: 9,
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

          {/* 等待态：spinner + 文案 */}
          {isAwaiting && stepData.candidates.length > 0 && (
            <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${t.chipBorder}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CircularProgress size={13} thickness={5} sx={{ color: accentColor }} />
                <Typography sx={{ fontSize: 12, color: t.mutedText }}>
                  Leader 正在决策…
                </Typography>
              </Box>
            </Box>
          )}
          {/* 决策结果揭示 */}
          {showDecision && (
            <Box sx={{
              mt: 1, px: 1.5, py: 1, borderRadius: '6px',
              bgcolor: isStopped ? `${c.warning}08` : `${c.primary}08`,
              border: `1px solid ${isStopped ? `${c.warning}20` : `${c.primary}20`}`,
              animation: 'stepSlideIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                {isStopped ? (
                  <>
                    <StopIcon sx={{ fontSize: 14, color: c.warning }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: c.warning }}>
                      停止遍历
                    </Typography>
                  </>
                ) : (
                  <>
                    <RouteIcon sx={{ fontSize: 14, color: c.primary }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: c.primary }}>
                      → {chosenTarget?.targetNodeTitle ?? '未知'}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: t.dimText }}>
                      继续第 {(decisionData?.totalSteps ?? stepNumber) + 1} 步
                    </Typography>
                  </>
                )}
              </Box>
              {decisionData?.reason && (
                <Typography sx={{ fontSize: 11, color: t.mutedText, mt: 0.5 }}>
                  {decisionData.reason.length > 80 ? decisionData.reason.slice(0, 80) + '…' : decisionData.reason}
                </Typography>
              )}
            </Box>
          )}

          {/* 二级展开：thinking + reason */}
          {(stepData.thinking || decisionData?.reason) && (
            <Box sx={{ mt: 1 }}>
              <Box
                role="button"
                tabIndex={0}
                aria-expanded={thinkingOpen}
                onClick={() => setThinkingOpen(!thinkingOpen)}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setThinkingOpen(!thinkingOpen) } }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  cursor: 'pointer', userSelect: 'none',
                  '&:hover': { '& .expand-label': { color: accentColor } },
                }}
              >
                <ExpandMoreIcon
                  sx={{
                    fontSize: 16, color: t.dimText,
                    transform: thinkingOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
                <Typography className="expand-label" sx={{ fontSize: 11, color: t.dimText, transition: 'color 0.15s' }}>
                  {thinkingOpen ? '收起推理过程' : '展开推理过程'}
                </Typography>
              </Box>
              <Collapse in={thinkingOpen} timeout={200}>
                <Box sx={{ mt: 0.75, pl: 1, borderLeft: `2px solid ${t.chipBorder}` }}>
                  {stepData.thinking && (
                    <Box sx={{ mb: decisionData?.reason ? 1 : 0 }}>
                      {tryParseJson(stepData.thinking) ? (
                        <FriendlyContent text={stepData.thinking} maxHeight={150} />
                      ) : (
                        <Typography sx={{ fontSize: 12, color: t.mutedText, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                          {stepData.thinking}
                        </Typography>
                      )}
                    </Box>
                  )}
                  {decisionData?.reason && (
                    <Typography sx={{ fontSize: 12, color: t.bodyText, whiteSpace: 'pre-wrap' }}>
                      {decisionData.reason}
                    </Typography>
                  )}
                </Box>
              </Collapse>
            </Box>
          )}

          {/* 溯源信息 */}
          <TraceDetail trace={stepData.trace} />
          {decisionData?.trace && <TraceDetail trace={decisionData.trace} />}
        </Box>
        </Collapse>
      </div>
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
            <Typography style={{ color: t.mutedText, fontSize: 13 }}>
              重试: {data.retryCount}
            </Typography>
          )}
          <Typography style={{ color: t.bodyText, fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {data.feedback}
          </Typography>
          <TraceDetail trace={data.trace} />
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
              height: 22, fontSize: 12, mb: 0.5,
              bgcolor: `${phaseColor}20`, color: phaseColor,
              border: `1px solid ${phaseColor}40`,
            }}
          />
          <Typography style={{ color: t.bodyText, fontSize: 13, whiteSpace: 'pre-wrap' }}>
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
  const c = useColors()
  const t = useStepTheme()
  const stepColors = useStepColors()
  const [expanded, setExpanded] = useState(true)
  const icons = STEP_ICONS[step.type]
  const Icon = icons.icon

  const accentColor = stepColors[step.type]

  const isVerdict = step.type === 'boss_verdict'
  const isAgent = step.type === 'agent_stream'
  const cardClass = 'step-card'

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
          <span style={{ fontWeight: 600, color: t.bodyText, flex: 1, fontSize: 13, letterSpacing: '0.02em' }}>
            {icons.label}
          </span>
          <span style={{ color: t.dimText, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
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
        <Typography sx={{ fontSize: 12.5, color: isViewing ? c.text : c.textSecondary, fontWeight: isViewing ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {displayPrompt}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          {statusIcon}
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>{formatSessionTime(session.timestamp)}</Typography>
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>· {session.thinkingSteps.length} 步</Typography>
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
      <Typography sx={{ color: c.textMuted, fontSize: 13, letterSpacing: '0.08em' }}>等待指令...</Typography>
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
        <Typography sx={{ fontSize: 12, color: c.textMuted }}>{label}</Typography>
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
            <Typography sx={{ fontSize: 14, color: c.text, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
              {displayText}
            </Typography>
          </Box>
        </Collapse>
      ) : (
        <Box sx={{ px: 2, pb: 1.5, mt: -0.5 }}>
          <Typography sx={{ fontSize: 14, color: c.text, fontWeight: 500 }}>
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

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)
  const historyScrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const historyScrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

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

  useEffect(() => {
    if (!isViewingHistory && bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [thinkingSteps.length, isViewingHistory])

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
            <Typography sx={{ fontWeight: 600, color: c.textSecondary, fontSize: 15 }}>历史记录</Typography>
          </>
        ) : (
          <>
            <ThinkIcon sx={{ fontSize: 18, color: c.primary }} />
            <Typography sx={{ fontWeight: 600, color: c.text, fontSize: 15 }}>思考过程</Typography>
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
                <Chip
                  label={node.nodeTitle}
                  size="small"
                  sx={{
                    height: 22, fontSize: 11,
                    bgcolor: node.nodeType === 'personality' ? `${c.primary}15` : `${c.secondary}15`,
                    color: node.nodeType === 'personality' ? c.primary : c.secondary,
                    border: `1px solid ${node.nodeType === 'personality' ? `${c.primary}30` : `${c.secondary}30`}`,
                  }}
                />
              </Box>
            ))}
          </Box>
          <Typography sx={{ fontSize: 11, color: c.textMuted, mb: 1.5 }}>
            共 {pendingPlan.totalSteps} 步，{pendingPlan.path.length} 个节点
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
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
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
        </Box>
      )}

      {/* 滚动区域 */}
      <Box className="thinking-scroll-container" sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Box ref={scrollRef} sx={{ height: '100%', overflowY: 'auto', pr: 0.5, pt: 0.5 }}>
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
                      isLast={isLast}
                      isBusy={!isViewingHistory && busy}
                    />
                  )
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

          <div ref={bottomAnchorRef} />
        </Box>
      </Box>
    </Box>
  )
}
