import { create } from 'zustand'
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

interface TaskState {
  isRunning: boolean
  isLearning: boolean
  currentTaskPrompt: string | null
  thinkingSteps: ThinkingStep[]
  agentOutput: string
  activeEdgeIds: Set<string>
  activeNodeId: string | null
  error: string | null

  sessions: ChatSession[]
  activeSessionId: string | null
  viewingSessionId: string | null
  queue: QueueItem[]
  executionMode: ExecutionMode
  autoReview: boolean
  pendingPlan: PlanReadyPayload | null
  pendingStep: StepConfirmPayload | null

  // 分页状态
  sessionsHasMore: boolean
  sessionsLoading: boolean
  sessionsCursor: number | null

  startTask: (prompt: string) => Promise<void>
  learnTopic: (topic: string) => Promise<void>
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

  viewSession: (id: string | null) => void
  deleteSession: (id: string) => void
  clearSessions: () => void
  loadSessions: () => Promise<void>
  loadMoreSessions: () => Promise<void>
  setQueue: (queue: QueueItem[]) => void
  removeFromQueue: (id: string) => Promise<void>
  setExecutionMode: (mode: ExecutionMode) => void
  setAutoReview: (auto: boolean) => void
  setPendingPlan: (plan: PlanReadyPayload | null) => void
  setPendingStep: (step: StepConfirmPayload | null) => void
  approvePlan: () => void
  rejectPlan: () => void
  approveStep: () => void
  rejectStep: () => void
}

let agentStepIdCounter = 0

/** 持久化当前会话到后端 */
async function persistSession(state: TaskState) {
  if (!state.activeSessionId) return
  try {
    await chatSessionsApi.update(state.activeSessionId, {
      agentOutput: state.agentOutput,
      thinkingSteps: state.thinkingSteps,
      status: state.error ? 'error' : 'success',
    })
  } catch (e) {
    console.error('持久化会话失败:', e)
  }
}

const initialState = {
  isRunning: false,
  isLearning: false,
  currentTaskPrompt: null as string | null,
  thinkingSteps: [] as ThinkingStep[],
  agentOutput: '',
  activeEdgeIds: new Set<string>(),
  activeNodeId: null as string | null,
  error: null as string | null,
  sessions: [] as ChatSession[],
  activeSessionId: null as string | null,
  viewingSessionId: null as string | null,
  queue: [] as QueueItem[],
  executionMode: (localStorage.getItem('llm-brain-exec-mode') as ExecutionMode) || 'auto' as ExecutionMode,
  autoReview: localStorage.getItem('llm-brain-auto-review') === 'true',
  pendingPlan: null as PlanReadyPayload | null,
  pendingStep: null as StepConfirmPayload | null,
  sessionsHasMore: true,
  sessionsLoading: false,
  sessionsCursor: null as number | null,
}

export const useTaskStore = create<TaskState>((set, get) => ({
  ...initialState,

  startTask: async (prompt) => {
    const brainId = useBrainStore.getState().currentBrainId
    if (!brainId) {
      set({ error: '请先选择一个大脑' })
      return
    }

    // 先持久化上一轮
    const prev = get()
    if (prev.activeSessionId && (prev.isRunning || prev.isLearning)) {
      await persistSession(prev)
    }

    // 在后端创建新会话
    let serverSession: ChatSessionDTO
    try {
      serverSession = await chatSessionsApi.create({ brainId, type: 'task', prompt })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '创建会话失败' })
      return
    }

    const newSession: ChatSession = dtoToSession(serverSession)

    set((s) => ({
      sessions: [...s.sessions.filter((ss) => ss.status !== 'running'), newSession],
      activeSessionId: newSession.id,
      viewingSessionId: null,
      isRunning: true,
      currentTaskPrompt: prompt,
      thinkingSteps: [],
      agentOutput: '',
      activeEdgeIds: new Set<string>(),
      activeNodeId: null,
      error: null,
    }))

    try {
      await taskApi.execute(prompt, brainId, get().executionMode, useSettingsStore.getState().enabledTools)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '任务执行失败'
      set({ isRunning: false, error: errMsg })
      // 更新后端状态
      chatSessionsApi.update(newSession.id, { status: 'error' }).catch(() => {})
      set((s) => ({
        sessions: s.sessions.map((ss) =>
          ss.id === newSession.id ? { ...ss, status: 'error' as const } : ss,
        ),
      }))
    }
  },

  learnTopic: async (topic) => {
    const brainId = useBrainStore.getState().currentBrainId
    if (!brainId) {
      set({ error: '请先选择一个大脑' })
      return
    }

    const prev = get()
    if (prev.activeSessionId && (prev.isRunning || prev.isLearning)) {
      await persistSession(prev)
    }

    const displayPrompt = `学习: ${topic}`
    let serverSession: ChatSessionDTO
    try {
      serverSession = await chatSessionsApi.create({ brainId, type: 'learn', prompt: displayPrompt })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '创建会话失败' })
      return
    }

    const newSession: ChatSession = dtoToSession(serverSession)

    set((s) => ({
      sessions: [...s.sessions.filter((ss) => ss.status !== 'running'), newSession],
      activeSessionId: newSession.id,
      viewingSessionId: null,
      isLearning: true,
      currentTaskPrompt: displayPrompt,
      thinkingSteps: [],
      agentOutput: '',
      activeEdgeIds: new Set<string>(),
      activeNodeId: null,
      error: null,
    }))

    try {
      await learnApi.learn(topic, brainId)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '学习失败'
      set({ isLearning: false, error: errMsg })
      chatSessionsApi.update(newSession.id, { status: 'error' }).catch(() => {})
      set((s) => ({
        sessions: s.sessions.map((ss) =>
          ss.id === newSession.id ? { ...ss, status: 'error' as const } : ss,
        ),
      }))
    }
  },

  addThinkingStep: (step) =>
    set((state) => ({
      thinkingSteps: [...state.thinkingSteps, step],
    })),

  mergeAgentStream: (payload, timestamp) =>
    set((state) => {
      const steps = state.thinkingSteps
      const lastStep = steps[steps.length - 1]

      if (lastStep && lastStep.type === 'agent_stream') {
        const prevData = lastStep.data as AgentStreamPayload
        const merged: ThinkingStep = {
          ...lastStep,
          timestamp,
          data: {
            chunk: prevData.chunk + payload.chunk,
            done: payload.done,
            trace: payload.trace ?? prevData.trace,
          },
        }
        return { thinkingSteps: [...steps.slice(0, -1), merged] }
      }

      return {
        thinkingSteps: [
          ...steps,
          {
            id: `agent-stream-${Date.now()}-${++agentStepIdCounter}`,
            type: 'agent_stream' as const,
            timestamp,
            data: payload,
          },
        ],
      }
    }),

  addToolCall: (payload, timestamp) =>
    set((state) => ({
      thinkingSteps: [
        ...state.thinkingSteps,
        {
          id: `tool-call-${payload.callId}`,
          type: 'tool_call' as const,
          timestamp,
          data: payload,
        },
      ],
    })),

  updateToolCall: (callId, payload, timestamp) =>
    set((state) => ({
      thinkingSteps: state.thinkingSteps.map((step) =>
        step.type === 'tool_call' && (step.data as ToolCallPayload).callId === callId
          ? { ...step, timestamp, data: payload }
          : step,
      ),
    })),

  appendAgentOutput: (chunk) =>
    set((state) => ({
      agentOutput: state.agentOutput + chunk,
    })),

  setActiveEdge: (edgeId) =>
    set((state) => ({
      activeEdgeIds: edgeId
        ? new Set([...state.activeEdgeIds, edgeId])
        : state.activeEdgeIds,
    })),

  setActiveNode: (nodeId) =>
    set({ activeNodeId: nodeId }),

  setIsRunning: (running) => {
    if (!running) {
      const state = get()
      // 任务结束，持久化到后端
      if (state.activeSessionId) {
        chatSessionsApi.update(state.activeSessionId, {
          agentOutput: state.agentOutput,
          thinkingSteps: state.thinkingSteps,
          status: 'success',
        }).catch(() => {})
      }
      set((s) => ({
        isRunning: false,
        sessions: s.sessions.map((ss) =>
          ss.id === s.activeSessionId
            ? { ...ss, status: 'success' as const, thinkingSteps: s.thinkingSteps, agentOutput: s.agentOutput }
            : ss,
        ),
      }))
    } else {
      set({ isRunning: true })
    }
  },

  setIsLearning: (learning) => {
    if (!learning) {
      const state = get()
      if (state.activeSessionId) {
        chatSessionsApi.update(state.activeSessionId, {
          agentOutput: state.agentOutput,
          thinkingSteps: state.thinkingSteps,
          status: 'success',
        }).catch(() => {})
      }
      set((s) => ({
        isLearning: false,
        sessions: s.sessions.map((ss) =>
          ss.id === s.activeSessionId
            ? { ...ss, status: 'success' as const, thinkingSteps: s.thinkingSteps, agentOutput: s.agentOutput }
            : ss,
        ),
      }))
    } else {
      set({ isLearning: true })
    }
  },

  setError: (error) => {
    const state = get()
    if (state.activeSessionId) {
      chatSessionsApi.update(state.activeSessionId, {
        agentOutput: state.agentOutput,
        thinkingSteps: state.thinkingSteps,
        status: 'error',
      }).catch(() => {})
    }
    set((s) => ({
      isRunning: false,
      error,
      sessions: s.activeSessionId
        ? s.sessions.map((ss) =>
            ss.id === s.activeSessionId
              ? { ...ss, status: 'error' as const, thinkingSteps: s.thinkingSteps, agentOutput: s.agentOutput }
              : ss,
          )
        : s.sessions,
    }))
  },

  reset: () => set({ ...initialState, activeEdgeIds: new Set<string>() }),

  viewSession: (id) =>
    set({ viewingSessionId: id }),

  deleteSession: (id) => {
    chatSessionsApi.delete(id).catch(() => {})
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      viewingSessionId: state.viewingSessionId === id ? null : state.viewingSessionId,
    }))
  },

  clearSessions: () =>
    set({ sessions: [], viewingSessionId: null }),

  loadSessions: async () => {
    const brainId = useBrainStore.getState().currentBrainId
    set({ sessionsLoading: true })
    try {
      const result = await chatSessionsApi.getPage(brainId ?? undefined)
      set({
        sessions: result.items.map(dtoToSession),
        sessionsHasMore: result.hasMore,
        sessionsCursor: result.nextCursor ?? null,
        sessionsLoading: false,
      })
    } catch (e) {
      console.error('加载会话历史失败:', e)
      set({ sessionsLoading: false })
    }
  },

  loadMoreSessions: async () => {
    const { sessionsHasMore, sessionsLoading, sessionsCursor } = get()
    if (!sessionsHasMore || sessionsLoading) return
    const brainId = useBrainStore.getState().currentBrainId
    set({ sessionsLoading: true })
    try {
      const result = await chatSessionsApi.getPage(brainId ?? undefined, sessionsCursor ?? undefined)
      set((s) => ({
        sessions: [...s.sessions, ...result.items.map(dtoToSession)],
        sessionsHasMore: result.hasMore,
        sessionsCursor: result.nextCursor ?? null,
        sessionsLoading: false,
      }))
    } catch (e) {
      console.error('加载更多会话失败:', e)
      set({ sessionsLoading: false })
    }
  },

  setQueue: (queue) => set({ queue }),

  removeFromQueue: async (id) => {
    try {
      await taskApi.removeFromQueue(id)
      set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }))
    } catch (e) {
      console.error('取消排队失败:', e)
    }
  },

  setExecutionMode: (mode) => {
    localStorage.setItem('llm-brain-exec-mode', mode)
    set({ executionMode: mode })
  },

  setAutoReview: (auto) => {
    localStorage.setItem('llm-brain-auto-review', String(auto))
    set({ autoReview: auto })
  },

  setPendingPlan: (plan) => set({ pendingPlan: plan }),
  setPendingStep: (step) => set({ pendingStep: step }),

  approvePlan: () => {
    wsClient.send('plan_response', { approved: true })
    set({ pendingPlan: null })
  },

  rejectPlan: () => {
    wsClient.send('plan_response', { approved: false })
    set({ pendingPlan: null })
  },

  approveStep: () => {
    wsClient.send('step_response', { approved: true })
    set({ pendingStep: null })
  },

  rejectStep: () => {
    wsClient.send('step_response', { approved: false })
    set({ pendingStep: null })
  },
}))
