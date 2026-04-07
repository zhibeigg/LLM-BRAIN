import { useEffect } from 'react'
import { wsClient } from '../services/websocket'
import { useTaskStore } from '../stores/taskStore'
import { useGraphStore } from '../stores/graphStore'
import type {
  WSMessage,
  LeaderStepPayload,
  LeaderDecisionPayload,
  AgentStreamPayload,
  BossVerdictPayload,
  LearningProgressPayload,
  NodeExtractedPayload,
} from '../types'

let idCounter = 0
const nextId = () => `step-${Date.now()}-${++idCounter}`

export function useWebSocket() {
  const addThinkingStep = useTaskStore((s) => s.addThinkingStep)
  const mergeAgentStream = useTaskStore((s) => s.mergeAgentStream)
  const appendAgentOutput = useTaskStore((s) => s.appendAgentOutput)
  const setActiveEdge = useTaskStore((s) => s.setActiveEdge)
  const setActiveNode = useTaskStore((s) => s.setActiveNode)
  const setIsRunning = useTaskStore((s) => s.setIsRunning)
  const setIsLearning = useTaskStore((s) => s.setIsLearning)
  const setError = useTaskStore((s) => s.setError)
  const fetchGraph = useGraphStore((s) => s.fetchGraph)
  const addNewNodeId = useGraphStore((s) => s.addNewNodeId)

  useEffect(() => {
    wsClient.connect()

    const unsubLeaderStep = wsClient.on('leader_step', (msg: WSMessage) => {
      const payload = msg.payload as LeaderStepPayload
      addThinkingStep({
        id: nextId(),
        type: 'leader_step',
        timestamp: msg.timestamp,
        data: payload,
      })
      setActiveNode(payload.currentNodeId)
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
    })

    const unsubAgentStream = wsClient.on('agent_stream', (msg: WSMessage) => {
      const payload = msg.payload as AgentStreamPayload
      appendAgentOutput(payload.chunk)
      // 合并连续的 agent_stream 到同一个步骤中
      mergeAgentStream(payload, msg.timestamp)
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

    const unsubError = wsClient.on('error', (msg: WSMessage) => {
      const payload = msg.payload as { message: string }
      setError(payload.message)
    })

    return () => {
      unsubLeaderStep()
      unsubLeaderDecision()
      unsubAgentStream()
      unsubBossVerdict()
      unsubLearningProgress()
      unsubGraphUpdate()
      unsubEvolution()
      unsubNodeExtracted()
      unsubExtractionDone()
      unsubError()
      wsClient.disconnect()
    }
  }, [addThinkingStep, mergeAgentStream, appendAgentOutput, setActiveEdge, setActiveNode, setIsRunning, setIsLearning, setError, fetchGraph, addNewNodeId])
}
