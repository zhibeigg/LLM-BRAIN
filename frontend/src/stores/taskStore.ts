import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/shallow'
import type {
  LeaderStepPayload,
  LeaderDecisionPayload,
  AgentStreamPayload,
  BossVerdictPayload,
  LearningProgressPayload,
  ToolCallPayload,
  QueueItem,
  ExecutionMode,
  PlanReadyPayload,
  StepConfirmPayload,
} from '../types'
import { taskApi, learnApi, chatSessionsApi } from '../services/api'
import type { ChatSessionDTO } from '../services/api'
import { useBrainStore } from './brainStore'
import { useSettingsStore } from './settingsStore'
import { wsClient } from '../services/websocket'

// ============================================================================
// 共享类型定义
// ============================================================================

export interface ThinkingStep {
  id: string
  type: 'leader_step' | 'leader_decision' | 'agent_stream' | 'boss_verdict' | 'learning_progress' | 'tool_call'
  timestamp: number
  data:
    | LeaderStepPayload
    | LeaderDecisionPayload
    | AgentStreamPayload
    | BossVerdictPayload
    | LearningProgressPayload
    | ToolCallPayload
}

export interface ChatSession {
  id: string
  type: 'task' | 'learn'
  prompt: string
  agentOutput: string
  thinkingSteps: ThinkingStep[]
  status: 'running' | 'success' | 'error'
  timestamp: number
}

function dtoToSession(dto: ChatSessionDTO): ChatSession {
  return {
    id: dto.id,
    type: dto.type,
    prompt: dto.prompt,
    agentOutput: dto.agentOutput,
    thinkingSteps: dto.thinkingSteps as ThinkingStep[],
    status: dto.status,
    timestamp: dto.createdAt,
  }
}

// ============================================================================
// Store 1: 任务执行状态 (TaskExecutionStore)
// ============================================================================

interface TaskExecutionState {
  isRunning: boolean
  isLearning: boolean
  currentTaskPrompt: string | null
  thinkingSteps: ThinkingStep[]
  agentOutput: string
  activeEdgeIds: Set<string>
  activeNodeId: string | null
  error: string | null
  pendingPlan: PlanReadyPayload | null
  pendingStep: StepConfirmPayload | null
}

interface TaskExecutionActions {
  setIsRunning: (running: boolean) => void
  setIsLearning: (learning: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
  addThinkingStep: (step: ThinkingStep) => void
  mergeAgentStream: (payload: AgentStreamPayload, timestamp: number) => void
  addToolCall: (payload: ToolCallPayload, timestamp: number) => void
  updateToolCall: (callId: string, payload: ToolCallPayload, timestamp: number) => void
  appendAgentOutput: (chunk: string) => void
  setActiveEdge: (edgeId: string | null) => void
  setActiveNode: (nodeId: string | null) => void
  setPendingPlan: (plan: PlanReadyPayload | null) => void
  setPendingStep: (step: StepConfirmPayload | null) => void
  approvePlan: () => void
  rejectPlan: () => void
  approveStep: () => void
  rejectStep: () => void
}

type TaskExecutionStore = TaskExecutionState & TaskExecutionActions

const initialExecutionState: TaskExecutionState = {
  isRunning: false,
  isLearning: false,
  currentTaskPrompt: null,
  thinkingSteps: [],
  agentOutput: '',
  activeEdgeIds: new Set<string>(),
  activeNodeId: null,
  error: null,
  pendingPlan: null,
  pendingStep: null,
}

let agentStepIdCounter = 0

export const useTaskExecutionStore = create<TaskExecutionStore>()(
  immer((set, get) => ({
    ...initialExecutionState,

    setIsRunning: (running) =>
      set((state) => {
        state.isRunning = running
      }),

    setIsLearning: (learning) =>
      set((state) => {
        state.isLearning = learning
      }),

    setError: (error) =>
      set((state) => {
        state.error = error
        if (error) {
          state.isRunning = false
          state.isLearning = false
        }
      }),

    reset: () =>
      set((state) => {
        Object.assign(state, {
          ...initialExecutionState,
          activeEdgeIds: new Set<string>(),
        })
      }),

    addThinkingStep: (step) =>
      set((state) => {
        state.thinkingSteps.push(step)
      }),

    mergeAgentStream: (payload, timestamp) =>
      set((state) => {
        const steps = state.thinkingSteps
        const lastStep = steps[steps.length - 1]

        if (lastStep && lastStep.type === 'agent_stream') {
          const prevData = lastStep.data as AgentStreamPayload
          lastStep.timestamp = timestamp
          lastStep.data = {
            chunk: prevData.chunk + payload.chunk,
            done: payload.done,
            trace: payload.trace ?? prevData.trace,
          }
        } else {
          steps.push({
            id: `agent-stream-${Date.now()}-${++agentStepIdCounter}`,
            type: 'agent_stream',
            timestamp,
            data: payload,
          })
        }
      }),

    addToolCall: (payload, timestamp) =>
      set((state) => {
        state.thinkingSteps.push({
          id: `tool-call-${payload.callId}`,
          type: 'tool_call',
          timestamp,
          data: payload,
        })
      }),

    updateToolCall: (callId, payload, timestamp) =>
      set((state) => {
        const step = state.thinkingSteps.find(
          (s: ThinkingStep) => s.type === 'tool_call' && (s.data as ToolCallPayload).callId === callId
        )
        if (step) {
          step.timestamp = timestamp
          step.data = payload
        }
      }),

    appendAgentOutput: (chunk) =>
      set((state) => {
        state.agentOutput += chunk
      }),

    setActiveEdge: (edgeId) =>
      set((state) => {
        if (edgeId) {
          state.activeEdgeIds.add(edgeId)
        } else {
          state.activeEdgeIds.clear()
        }
      }),

    setActiveNode: (nodeId) =>
      set((state) => {
        state.activeNodeId = nodeId
      }),

    setPendingPlan: (plan) =>
      set((state) => {
        state.pendingPlan = plan
      }),

    setPendingStep: (step) =>
      set((state) => {
        state.pendingStep = step
      }),

    approvePlan: () => {
      const { pendingPlan } = get()
      const requestId = pendingPlan?.requestId || `plan-${Date.now()}`
      wsClient.send('plan_response', { approved: true, requestId })
      set((state) => {
        state.pendingPlan = null
      })
    },

    rejectPlan: () => {
      const { pendingPlan } = get()
      const requestId = pendingPlan?.requestId || `plan-${Date.now()}`
      wsClient.send('plan_response', { approved: false, requestId })
      set((state) => {
        state.pendingPlan = null
      })
    },

    approveStep: () => {
      const { pendingStep } = get()
      const requestId = pendingStep?.requestId || pendingStep?.stepId || `step-${Date.now()}`
      wsClient.send('step_response', { approved: true, requestId })
      set((state) => {
        state.pendingStep = null
      })
    },

    rejectStep: () => {
      const { pendingStep } = get()
      const requestId = pendingStep?.requestId || pendingStep?.stepId || `step-${Date.now()}`
      wsClient.send('step_response', { approved: false, requestId })
      set((state) => {
        state.pendingStep = null
      })
    },
  }))
)

// ============================================================================
// Store 2: 会话管理状态 (SessionStore)
// ============================================================================

interface SessionState {
  sessions: ChatSession[]
  activeSessionId: string | null
  viewingSessionId: string | null
  sessionsHasMore: boolean
  sessionsLoading: boolean
  sessionsCursor: number | null
}

interface SessionActions {
  viewSession: (id: string | null) => void
  deleteSession: (id: string) => Promise<void>
  clearSessions: () => void
  loadSessions: () => Promise<void>
  loadMoreSessions: () => Promise<void>
  addSession: (session: ChatSession) => void
  updateSession: (id: string, updates: Partial<ChatSession>) => void
}

type SessionStore = SessionState & SessionActions

const initialSessionState: SessionState = {
  sessions: [],
  activeSessionId: null,
  viewingSessionId: null,
  sessionsHasMore: true,
  sessionsLoading: false,
  sessionsCursor: null,
}

export const useSessionStore = create<SessionStore>()(
  immer((set, get) => ({
    ...initialSessionState,

    viewSession: (id) =>
      set((state) => {
        state.viewingSessionId = id
      }),

    deleteSession: async (id) => {
      try {
        await chatSessionsApi.delete(id)
      } catch (e) {
        console.error('删除会话失败:', e)
      }
      set((state) => {
        state.sessions = state.sessions.filter((s: ChatSession) => s.id !== id)
        if (state.viewingSessionId === id) {
          state.viewingSessionId = null
        }
      })
    },

    clearSessions: () =>
      set((state) => {
        state.sessions = []
        state.viewingSessionId = null
      }),

    loadSessions: async () => {
      const brainId = useBrainStore.getState().currentBrainId
      set((state) => {
        state.sessionsLoading = true
      })
      try {
        const result = await chatSessionsApi.getPage(brainId ?? undefined)
        set((state) => {
          state.sessions = result.items.map(dtoToSession)
          state.sessionsHasMore = result.hasMore
          state.sessionsCursor = result.nextCursor ?? null
          state.sessionsLoading = false
        })
      } catch (e) {
        console.error('加载会话历史失败:', e)
        set((state) => {
          state.sessionsLoading = false
        })
      }
    },

    loadMoreSessions: async () => {
      const { sessionsHasMore, sessionsLoading, sessionsCursor } = get()
      if (!sessionsHasMore || sessionsLoading) return
      const brainId = useBrainStore.getState().currentBrainId
      set((state) => {
        state.sessionsLoading = true
      })
      try {
        const result = await chatSessionsApi.getPage(brainId ?? undefined, sessionsCursor ?? undefined)
        set((state) => {
          state.sessions.push(...result.items.map(dtoToSession))
          state.sessionsHasMore = result.hasMore
          state.sessionsCursor = result.nextCursor ?? null
          state.sessionsLoading = false
        })
      } catch (e) {
        console.error('加载更多会话失败:', e)
        set((state) => {
          state.sessionsLoading = false
        })
      }
    },

    addSession: (session) =>
      set((state) => {
        const existingIndex = state.sessions.findIndex((s: ChatSession) => s.id === session.id)
        if (existingIndex >= 0) {
          state.sessions[existingIndex] = session
        } else {
          state.sessions = state.sessions.filter((s: ChatSession) => s.status !== 'running')
          state.sessions.push(session)
        }
        state.activeSessionId = session.id
        state.viewingSessionId = null
      }),

    updateSession: (id, updates) =>
      set((state) => {
        const session = state.sessions.find((s: ChatSession) => s.id === id)
        if (session) {
          Object.assign(session, updates)
        }
      }),
  }))
)

// ============================================================================
// Store 3: 队列管理状态 (QueueStore)
// ============================================================================

interface QueueState {
  queue: QueueItem[]
  executionMode: ExecutionMode
  autoReview: boolean
}

interface QueueActions {
  setQueue: (queue: QueueItem[]) => void
  removeFromQueue: (id: string) => Promise<void>
  setExecutionMode: (mode: ExecutionMode) => void
  setAutoReview: (auto: boolean) => void
}

type QueueStore = QueueState & QueueActions

const initialQueueState: QueueState = {
  queue: [],
  executionMode: (localStorage.getItem('llm-brain-exec-mode') as ExecutionMode) || 'auto',
  autoReview: localStorage.getItem('llm-brain-auto-review') === 'true',
}

export const useQueueStore = create<QueueStore>()(
  immer((set) => ({
    ...initialQueueState,

    setQueue: (queue) =>
      set((state) => {
        state.queue = queue
      }),

    removeFromQueue: async (id) => {
      try {
        await taskApi.removeFromQueue(id)
      } catch (e) {
        console.error('取消排队失败:', e)
      }
      set((state) => {
        state.queue = state.queue.filter((q: QueueItem) => q.id !== id)
      })
    },

    setExecutionMode: (mode) => {
      localStorage.setItem('llm-brain-exec-mode', mode)
      set((state) => {
        state.executionMode = mode
      })
    },

    setAutoReview: (auto) => {
      localStorage.setItem('llm-brain-auto-review', String(auto))
      set((state) => {
        state.autoReview = auto
      })
    },
  }))
)

// ============================================================================
// 统一兼容层 - useTaskStore
// ============================================================================

interface LegacyTaskStoreState {
  // TaskExecutionStore
  isRunning: boolean
  isLearning: boolean
  currentTaskPrompt: string | null
  thinkingSteps: ThinkingStep[]
  agentOutput: string
  activeEdgeIds: Set<string>
  activeNodeId: string | null
  error: string | null
  pendingPlan: PlanReadyPayload | null
  pendingStep: StepConfirmPayload | null
  // SessionStore
  sessions: ChatSession[]
  activeSessionId: string | null
  viewingSessionId: string | null
  sessionsHasMore: boolean
  sessionsLoading: boolean
  sessionsCursor: number | null
  // QueueStore
  queue: QueueItem[]
  executionMode: ExecutionMode
  autoReview: boolean
}

interface LegacyTaskStoreActions {
  addThinkingStep: (step: ThinkingStep) => void
  mergeAgentStream: (payload: AgentStreamPayload, timestamp: number) => void
  addToolCall: (payload: ToolCallPayload, timestamp: number) => void
  updateToolCall: (callId: string, payload: ToolCallPayload, timestamp: number) => void
  appendAgentOutput: (chunk: string) => void
  setActiveEdge: (edgeId: string | null) => void
  setActiveNode: (nodeId: string | null) => void
  setIsRunning: (running: boolean) => void
  setIsLearning: (learning: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
  setPendingPlan: (plan: PlanReadyPayload | null) => void
  setPendingStep: (step: StepConfirmPayload | null) => void
  approvePlan: () => void
  rejectPlan: () => void
  approveStep: () => void
  rejectStep: () => void
  viewSession: (id: string | null) => void
  deleteSession: (id: string) => Promise<void>
  clearSessions: () => void
  loadSessions: () => Promise<void>
  loadMoreSessions: () => Promise<void>
  setQueue: (queue: QueueItem[]) => void
  removeFromQueue: (id: string) => Promise<void>
  setExecutionMode: (mode: ExecutionMode) => void
  setAutoReview: (auto: boolean) => void
  startTask: (prompt: string) => Promise<void>
  learnTopic: (topic: string) => Promise<void>
  persistCurrentSession: () => Promise<void>
}

type LegacyTaskStore = LegacyTaskStoreState & LegacyTaskStoreActions

async function persistSession(
  sessionId: string,
  agentOutput: string,
  thinkingSteps: ThinkingStep[],
  status: 'success' | 'error'
) {
  try {
    await chatSessionsApi.update(sessionId, {
      agentOutput,
      thinkingSteps,
      status,
    })
  } catch (e) {
    console.error('持久化会话失败:', e)
  }
}

// 创建统一的 legacy store
const legacyStore = create<LegacyTaskStore>()(
  immer(() => ({
    // TaskExecutionStore state
    get isRunning() {
      return useTaskExecutionStore.getState().isRunning
    },
    get isLearning() {
      return useTaskExecutionStore.getState().isLearning
    },
    get currentTaskPrompt() {
      return useTaskExecutionStore.getState().currentTaskPrompt
    },
    get thinkingSteps() {
      return useTaskExecutionStore.getState().thinkingSteps
    },
    get agentOutput() {
      return useTaskExecutionStore.getState().agentOutput
    },
    get activeEdgeIds() {
      return useTaskExecutionStore.getState().activeEdgeIds
    },
    get activeNodeId() {
      return useTaskExecutionStore.getState().activeNodeId
    },
    get error() {
      return useTaskExecutionStore.getState().error
    },
    get pendingPlan() {
      return useTaskExecutionStore.getState().pendingPlan
    },
    get pendingStep() {
      return useTaskExecutionStore.getState().pendingStep
    },
    // SessionStore state
    get sessions() {
      return useSessionStore.getState().sessions
    },
    get activeSessionId() {
      return useSessionStore.getState().activeSessionId
    },
    get viewingSessionId() {
      return useSessionStore.getState().viewingSessionId
    },
    get sessionsHasMore() {
      return useSessionStore.getState().sessionsHasMore
    },
    get sessionsLoading() {
      return useSessionStore.getState().sessionsLoading
    },
    get sessionsCursor() {
      return useSessionStore.getState().sessionsCursor
    },
    // QueueStore state
    get queue() {
      return useQueueStore.getState().queue
    },
    get executionMode() {
      return useQueueStore.getState().executionMode
    },
    get autoReview() {
      return useQueueStore.getState().autoReview
    },
    // Actions - delegate to respective stores
    addThinkingStep: (step) => useTaskExecutionStore.getState().addThinkingStep(step),
    mergeAgentStream: (payload, timestamp) => useTaskExecutionStore.getState().mergeAgentStream(payload, timestamp),
    addToolCall: (payload, timestamp) => useTaskExecutionStore.getState().addToolCall(payload, timestamp),
    updateToolCall: (callId, payload, timestamp) => useTaskExecutionStore.getState().updateToolCall(callId, payload, timestamp),
    appendAgentOutput: (chunk) => useTaskExecutionStore.getState().appendAgentOutput(chunk),
    setActiveEdge: (edgeId) => useTaskExecutionStore.getState().setActiveEdge(edgeId),
    setActiveNode: (nodeId) => useTaskExecutionStore.getState().setActiveNode(nodeId),
    setIsRunning: (running) => useTaskExecutionStore.getState().setIsRunning(running),
    setIsLearning: (learning) => useTaskExecutionStore.getState().setIsLearning(learning),
    setError: (error) => useTaskExecutionStore.getState().setError(error),
    reset: () => useTaskExecutionStore.getState().reset(),
    setPendingPlan: (plan) => useTaskExecutionStore.getState().setPendingPlan(plan),
    setPendingStep: (step) => useTaskExecutionStore.getState().setPendingStep(step),
    approvePlan: () => useTaskExecutionStore.getState().approvePlan(),
    rejectPlan: () => useTaskExecutionStore.getState().rejectPlan(),
    approveStep: () => useTaskExecutionStore.getState().approveStep(),
    rejectStep: () => useTaskExecutionStore.getState().rejectStep(),
    viewSession: (id) => useSessionStore.getState().viewSession(id),
    deleteSession: (id) => useSessionStore.getState().deleteSession(id),
    clearSessions: () => useSessionStore.getState().clearSessions(),
    loadSessions: () => useSessionStore.getState().loadSessions(),
    loadMoreSessions: () => useSessionStore.getState().loadMoreSessions(),
    setQueue: (queue) => useQueueStore.getState().setQueue(queue),
    removeFromQueue: (id) => useQueueStore.getState().removeFromQueue(id),
    setExecutionMode: (mode) => useQueueStore.getState().setExecutionMode(mode),
    setAutoReview: (auto) => useQueueStore.getState().setAutoReview(auto),
    // TaskActions
    startTask: async (prompt) => {
      const brainId = useBrainStore.getState().currentBrainId
      if (!brainId) {
        useTaskExecutionStore.getState().setError('请先选择一个大脑')
        return
      }

      const execState = useTaskExecutionStore.getState()
      const sessionState = useSessionStore.getState()
      if (sessionState.activeSessionId && (execState.isRunning || execState.isLearning)) {
        await persistSession(
          sessionState.activeSessionId,
          execState.agentOutput,
          execState.thinkingSteps,
          'success'
        )
      }

      let serverSession: ChatSessionDTO
      try {
        serverSession = await chatSessionsApi.create({ brainId, type: 'task', prompt })
      } catch (e) {
        useTaskExecutionStore.getState().setError(e instanceof Error ? e.message : '创建会话失败')
        return
      }

      const newSession: ChatSession = dtoToSession(serverSession)

      useTaskExecutionStore.getState().reset()
      useTaskExecutionStore.getState().setIsRunning(true)
      useTaskExecutionStore.getState().setError(null)
      useSessionStore.getState().addSession(newSession)

      try {
        await taskApi.execute(prompt, brainId, useQueueStore.getState().executionMode, useSettingsStore.getState().enabledTools)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : '任务执行失败'
        useTaskExecutionStore.getState().setError(errMsg)
        chatSessionsApi.update(newSession.id, { status: 'error' }).catch(() => {})
        useSessionStore.getState().updateSession(newSession.id, { status: 'error' })
      }
    },
    learnTopic: async (topic) => {
      const brainId = useBrainStore.getState().currentBrainId
      if (!brainId) {
        useTaskExecutionStore.getState().setError('请先选择一个大脑')
        return
      }

      const execState = useTaskExecutionStore.getState()
      const sessionState = useSessionStore.getState()
      if (sessionState.activeSessionId && (execState.isRunning || execState.isLearning)) {
        await persistSession(
          sessionState.activeSessionId,
          execState.agentOutput,
          execState.thinkingSteps,
          'success'
        )
      }

      const displayPrompt = `学习: ${topic}`
      let serverSession: ChatSessionDTO
      try {
        serverSession = await chatSessionsApi.create({ brainId, type: 'learn', prompt: displayPrompt })
      } catch (e) {
        useTaskExecutionStore.getState().setError(e instanceof Error ? e.message : '创建会话失败')
        return
      }

      const newSession: ChatSession = dtoToSession(serverSession)

      useTaskExecutionStore.getState().reset()
      useTaskExecutionStore.getState().setIsLearning(true)
      useTaskExecutionStore.getState().setError(null)
      useSessionStore.getState().addSession(newSession)

      try {
        await learnApi.learn(topic, brainId)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : '学习失败'
        useTaskExecutionStore.getState().setError(errMsg)
        chatSessionsApi.update(newSession.id, { status: 'error' }).catch(() => {})
        useSessionStore.getState().updateSession(newSession.id, { status: 'error' })
      }
    },
    persistCurrentSession: async () => {
      const execState = useTaskExecutionStore.getState()
      const sessionState = useSessionStore.getState()
      if (sessionState.activeSessionId && (execState.isRunning || execState.isLearning)) {
        await persistSession(
          sessionState.activeSessionId,
          execState.agentOutput,
          execState.thinkingSteps,
          execState.error ? 'error' : 'success'
        )
      }
    },
  }))
)

// 导出 legacy store 作为 useTaskStore
// 使用类型断言来处理 TypeScript 类型限制
export const useTaskStore = legacyStore as unknown as (typeof legacyStore & {
  getState: () => LegacyTaskStore
})

// 添加 getState 方法
const legacyGetState = (): LegacyTaskStore => {
  const execState = useTaskExecutionStore.getState()
  const sessionState = useSessionStore.getState()
  const queueState = useQueueStore.getState()
  return {
    isRunning: execState.isRunning,
    isLearning: execState.isLearning,
    currentTaskPrompt: execState.currentTaskPrompt,
    thinkingSteps: execState.thinkingSteps,
    agentOutput: execState.agentOutput,
    activeEdgeIds: execState.activeEdgeIds,
    activeNodeId: execState.activeNodeId,
    error: execState.error,
    pendingPlan: execState.pendingPlan,
    pendingStep: execState.pendingStep,
    sessions: sessionState.sessions,
    activeSessionId: sessionState.activeSessionId,
    viewingSessionId: sessionState.viewingSessionId,
    sessionsHasMore: sessionState.sessionsHasMore,
    sessionsLoading: sessionState.sessionsLoading,
    sessionsCursor: sessionState.sessionsCursor,
    queue: queueState.queue,
    executionMode: queueState.executionMode,
    autoReview: queueState.autoReview,
    addThinkingStep: execState.addThinkingStep,
    mergeAgentStream: execState.mergeAgentStream,
    addToolCall: execState.addToolCall,
    updateToolCall: execState.updateToolCall,
    appendAgentOutput: execState.appendAgentOutput,
    setActiveEdge: execState.setActiveEdge,
    setActiveNode: execState.setActiveNode,
    setIsRunning: execState.setIsRunning,
    setIsLearning: execState.setIsLearning,
    setError: execState.setError,
    reset: execState.reset,
    setPendingPlan: execState.setPendingPlan,
    setPendingStep: execState.setPendingStep,
    approvePlan: execState.approvePlan,
    rejectPlan: execState.rejectPlan,
    approveStep: execState.approveStep,
    rejectStep: execState.rejectStep,
    viewSession: sessionState.viewSession,
    deleteSession: sessionState.deleteSession,
    clearSessions: sessionState.clearSessions,
    loadSessions: sessionState.loadSessions,
    loadMoreSessions: sessionState.loadMoreSessions,
    setQueue: queueState.setQueue,
    removeFromQueue: queueState.removeFromQueue,
    setExecutionMode: queueState.setExecutionMode,
    setAutoReview: queueState.setAutoReview,
    startTask: (useTaskStore as unknown as LegacyTaskStore).startTask,
    learnTopic: (useTaskStore as unknown as LegacyTaskStore).learnTopic,
    persistCurrentSession: (useTaskStore as unknown as LegacyTaskStore).persistCurrentSession,
  }
}
Object.assign(useTaskStore, { getState: legacyGetState })

// ============================================================================
// 派生状态缓存 Hooks
// ============================================================================

/**
 * 获取当前活动的会话
 */
export function useActiveSession() {
  return useSessionStore(
    useShallow((state) => state.sessions.find((s) => s.id === state.activeSessionId))
  )
}

/**
 * 获取当前查看的会话
 */
export function useViewingSession() {
  return useSessionStore(
    useShallow((state) => {
      const id = state.viewingSessionId ?? state.activeSessionId
      return state.sessions.find((s) => s.id === id)
    })
  )
}

/**
 * 获取会话列表（排除running状态）
 */
export function useCompletedSessions() {
  return useSessionStore(
    useShallow((state) => state.sessions.filter((s) => s.status !== 'running'))
  )
}

/**
 * 获取正在运行的会话
 */
export function useRunningSession() {
  return useSessionStore(
    useShallow((state) => state.sessions.find((s) => s.status === 'running'))
  )
}

/**
 * 获取执行状态的简写
 */
export function useExecutionState() {
  return useTaskExecutionStore(
    useShallow((state) => ({
      isRunning: state.isRunning,
      isLearning: state.isLearning,
      error: state.error,
    }))
  )
}

/**
 * 获取思考步骤的统计信息
 */
export function useThinkingStepsStats() {
  return useTaskExecutionStore(
    useShallow((state) => {
      const stats = {
        totalSteps: state.thinkingSteps.length,
        leaderSteps: 0,
        agentStreams: 0,
        toolCalls: 0,
        decisions: 0,
      }
      for (const step of state.thinkingSteps) {
        switch (step.type) {
          case 'leader_step':
            stats.leaderSteps++
            break
          case 'agent_stream':
            stats.agentStreams++
            break
          case 'tool_call':
            stats.toolCalls++
            break
          case 'leader_decision':
            stats.decisions++
            break
        }
      }
      return stats
    })
  )
}
