import { useEffect } from 'react'
import { wsClient } from '../services/websocket'
import { useTaskStore, useTaskExecutionStore, useSessionStore } from '../stores/taskStore'
import { useGraphStore } from '../stores/graphStore'
import type {
  WSMessage,
  LeaderStepPayload,
  LeaderDecisionPayload,
  LeaderReturnPayload,
  AgentStreamPayload,
  BossVerdictPayload,
  LearningProgressPayload,
  NodeExtractedPayload,
  ToolCallPayload,
  QueueItem,
  PlanReadyPayload,
  StepConfirmPayload,
} from '../types'

let idCounter = 0
const nextId = () => `step-${Date.now()}-${++idCounter}`

export function useWebSocket() {
  const addThinkingStep = useTaskStore((s) => s.addThinkingStep)
  const mergeAgentStream = useTaskStore((s) => s.mergeAgentStream)
  const addToolCall = useTaskStore((s) => s.addToolCall)
  const updateToolCall = useTaskStore((s) => s.updateToolCall)
  const appendAgentOutput = useTaskStore((s) => s.appendAgentOutput)
  const setActiveEdge = useTaskStore((s) => s.setActiveEdge)
  const setActiveNode = useTaskStore((s) => s.setActiveNode)
  const pushLeaderPathNode = useTaskStore((s) => s.pushLeaderPathNode)
  const setLeaderPathEdge = useTaskStore((s) => s.setLeaderPathEdge)
  const setIsRunning = useTaskStore((s) => s.setIsRunning)
  const setIsLearning = useTaskStore((s) => s.setIsLearning)
  const setError = useTaskStore((s) => s.setError)
  const setQueue = useTaskStore((s) => s.setQueue)
  const setPendingPlan = useTaskStore((s) => s.setPendingPlan)
  const setPendingStep = useTaskStore((s) => s.setPendingStep)
  const persistCurrentSession = useTaskStore((s) => s.persistCurrentSession)
  const schedulePersistCurrentSession = useTaskStore((s) => s.schedulePersistCurrentSession)
  const fetchGraph = useGraphStore((s) => s.fetchGraph)
  const addNewNodeId = useGraphStore((s) => s.addNewNodeId)

  useEffect(() => {
    wsClient.connect()

    /**
     * 刷新恢复：WS 重连后收到执行事件时，如果前端不在运行状态，
     * 自动关联 running 会话并恢复 isRunning，让 UI 切换到实时模式。
     */
    const ensureRunning = () => {
      const exec = useTaskExecutionStore.getState()
      if (exec.isRunning || exec.isLearning) return
      const sessionState = useSessionStore.getState()
      const runningSession = sessionState.sessions.find((s) => s.status === 'running')
      if (runningSession) {
        // 关联会话
        useSessionStore.setState({
          activeSessionId: runningSession.id,
          viewingSessionId: null,
        })
        exec.setCurrentTaskPrompt(runningSession.prompt)
        if (runningSession.type === 'learn') {
          exec.setIsLearning(true)
        } else {
          exec.setIsRunning(true)
        }
      } else {
        // 没有 running 会话但收到了事件，直接标记为运行中
        exec.setIsRunning(true)
      }
    }

    const unsubLeaderStep = wsClient.on('leader_step', (msg: WSMessage) => {
      ensureRunning()
      const payload = msg.payload as LeaderStepPayload
      addThinkingStep({
        id: nextId(),
        type: 'leader_step',
        timestamp: msg.timestamp,
        data: payload,
      })
      setActiveNode(payload.currentNodeId)
      pushLeaderPathNode(payload.currentNodeId)
      schedulePersistCurrentSession('running')
    })

    const unsubLeaderDecision = wsClient.on('leader_decision', (msg: WSMessage) => {
      const payload = msg.payload as LeaderDecisionPayload
      addThinkingStep({
        id: nextId(),
        type: 'leader_decision',
        timestamp: msg.timestamp,
        data: payload,
      })
      setActiveEdge(payload.chosenEdgeId)
      if (payload.chosenEdgeId) {
        setLeaderPathEdge(payload.chosenEdgeId)
      }
      schedulePersistCurrentSession('running')
    })

    const unsubLeaderReturn = wsClient.on('leader_return', (msg: WSMessage) => {
      const payload = msg.payload as LeaderReturnPayload
      addThinkingStep({
        id: nextId(),
        type: 'leader_return',
        timestamp: msg.timestamp,
        data: payload,
      })
      setActiveNode(payload.returnToNodeId)
      schedulePersistCurrentSession('running')
    })

    const unsubAgentStream = wsClient.on('agent_stream', (msg: WSMessage) => {
      ensureRunning()
      const payload = msg.payload as AgentStreamPayload
      appendAgentOutput(payload.chunk)
      // 合并连续的 agent_stream 到同一个步骤中
      mergeAgentStream(payload, msg.timestamp)
      schedulePersistCurrentSession('running')
    })

    const unsubToolCall = wsClient.on('tool_call', (msg: WSMessage) => {
      const payload = msg.payload as ToolCallPayload
      if (payload.phase === 'start') {
        addToolCall(payload, msg.timestamp)
      } else {
        updateToolCall(payload.callId, payload, msg.timestamp)
      }
      schedulePersistCurrentSession('running')
    })

    const unsubBossVerdict = wsClient.on('boss_verdict', (msg: WSMessage) => {
      const payload = msg.payload as BossVerdictPayload
      addThinkingStep({
        id: nextId(),
        type: 'boss_verdict',
        timestamp: msg.timestamp,
        data: payload,
      })
      if (payload.passed) {
        setIsRunning(false)
        persistCurrentSession('success')
      } else {
        schedulePersistCurrentSession('running')
      }
    })

    const unsubLearningProgress = wsClient.on('learning_progress', (msg: WSMessage) => {
      const payload = msg.payload as LearningProgressPayload
      addThinkingStep({
        id: nextId(),
        type: 'learning_progress',
        timestamp: msg.timestamp,
        data: payload,
      })
      if (payload.phase === 'done' || payload.phase === 'error') {
        setIsLearning(false)
        persistCurrentSession(payload.phase === 'error' ? 'error' : 'success')
      } else {
        schedulePersistCurrentSession('running')
      }
    })

    const unsubGraphUpdate = wsClient.on('graph_update', () => {
      fetchGraph()
    })

    const unsubEvolution = wsClient.on('evolution_update', () => {
      fetchGraph()
    })

    const unsubNodeExtracted = wsClient.on('node_extracted', (msg: WSMessage) => {
      const payload = msg.payload as NodeExtractedPayload
      addNewNodeId(payload.nodeId)
      fetchGraph()
    })

    const unsubExtractionDone = wsClient.on('extraction_done', () => {
      fetchGraph()
    })

    const unsubQueueUpdate = wsClient.on('queue_update', (msg: WSMessage) => {
      const payload = msg.payload as { queue: QueueItem[] }
      setQueue(payload.queue)
    })

    const unsubPlanReady = wsClient.on('plan_ready', (msg: WSMessage) => {
      const payload = msg.payload as PlanReadyPayload
      // 如果 autoReview 开启，自动批准
      const state = useTaskStore.getState()
      if (state.autoReview) {
        const requestId = payload.requestId || `plan-${Date.now()}`
        wsClient.send('plan_response', { approved: true, requestId })
      } else {
        setPendingPlan(payload)
      }
    })

    const unsubStepConfirm = wsClient.on('step_confirm', (msg: WSMessage) => {
      const payload = msg.payload as StepConfirmPayload
      const state = useTaskStore.getState()
      if (state.autoReview) {
        const requestId = payload.requestId || payload.stepId || `step-${Date.now()}`
        wsClient.send('step_response', { approved: true, requestId })
      } else {
        setPendingStep(payload)
      }
    })

    const unsubError = wsClient.on('error', (msg: WSMessage) => {
      const payload = msg.payload as { message: string }
      setError(payload.message)
      persistCurrentSession('error')
    })

    const unsubTaskComplete = wsClient.on('task_complete', (msg: WSMessage) => {
      const payload = msg.payload as { status: 'success' | 'error'; type: 'task' | 'learn'; prompt: string }
      if (payload.type === 'learn') {
        setIsLearning(false)
      } else {
        setIsRunning(false)
      }
      // 如果 boss_verdict 已经处理了 success，这里做兜底确保状态一致
      persistCurrentSession(payload.status)
    })

    return () => {
      unsubLeaderStep()
      unsubLeaderDecision()
      unsubLeaderReturn()
      unsubAgentStream()
      unsubToolCall()
      unsubBossVerdict()
      unsubLearningProgress()
      unsubGraphUpdate()
      unsubEvolution()
      unsubNodeExtracted()
      unsubExtractionDone()
      unsubQueueUpdate()
      unsubPlanReady()
      unsubStepConfirm()
      unsubError()
      unsubTaskComplete()
      wsClient.disconnect()
    }
  }, [addThinkingStep, mergeAgentStream, addToolCall, updateToolCall, appendAgentOutput, setActiveEdge, setActiveNode, pushLeaderPathNode, setLeaderPathEdge, setIsRunning, setIsLearning, setError, setQueue, setPendingPlan, setPendingStep, persistCurrentSession, schedulePersistCurrentSession, fetchGraph, addNewNodeId])
}
