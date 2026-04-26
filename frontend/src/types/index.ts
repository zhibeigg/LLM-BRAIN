// ===== 大脑类型 =====

export interface Brain {
  id: string
  name: string
  description: string
  projectPath: string
  createdAt: number
  updatedAt: number
}

// ===== 节点类型 =====

export type NodeType = 'personality' | 'memory'

export interface MemoryNode {
  id: string
  brainId: string
  type: NodeType
  title: string
  content: string
  tags: string[]
  confidence: number
  sourcePathId?: string
  personalityLabel?: string
  positionX: number
  positionY: number
  createdAt: number
  updatedAt: number
}

// ===== 边类型 =====

export type DifficultyType =
  | 'computation'
  | 'reasoning'
  | 'creativity'
  | 'retrieval'
  | 'analysis'
  | 'synthesis'

export const DIFFICULTY_TYPE_LABELS: Record<DifficultyType, string> = {
  computation: '计算密集',
  reasoning: '推理密集',
  creativity: '创意发散',
  retrieval: '知识检索',
  analysis: '分析归纳',
  synthesis: '综合整合',
}

export const ALL_DIFFICULTY_TYPES: DifficultyType[] = [
  'computation', 'reasoning', 'creativity', 'retrieval', 'analysis', 'synthesis',
]

export interface MemoryEdge {
  id: string
  sourceId: string
  targetId: string
  baseDifficulty: number
  difficultyTypes: DifficultyType[]
  difficultyTypeWeights: Record<string, number>
  perceivedDifficulty?: number
  usageCount: number
  lastUsedAt?: number
  createdAt: number
}

// ===== 性格类型 =====

export interface PersonalityDimension {
  id: string
  brainId: string
  name: string
  description: string
  value: number // 0.0 ~ 1.0
  isBuiltin: boolean
  sortOrder: number
}

export interface Personality {
  dimensions: PersonalityDimension[]
  maxDimensions: number
}

export const BUILTIN_DIMENSIONS: Omit<PersonalityDimension, 'id' | 'brainId'>[] = [
  {
    name: '勤快度',
    description: '对复杂路径的容忍程度。高=愿意走长路径，低=只走最短路径',
    value: 0.5,
    isBuiltin: true,
    sortOrder: 0,
  },
  {
    name: '探索度',
    description: '对陌生路径的接受程度。高=愿意尝试新路径，低=只走熟悉路径',
    value: 0.5,
    isBuiltin: true,
    sortOrder: 1,
  },
  {
    name: '严谨度',
    description: '对不确定性的容忍程度。高=只接受高置信度路径，低=可接受模糊推理',
    value: 0.5,
    isBuiltin: true,
    sortOrder: 2,
  },
]

// ===== LLM 类型 =====

export type LLMProviderType = 'openai' | 'anthropic'

export type LLMApiMode = 'auto' | 'openai-chat' | 'openai-responses' | 'anthropic-messages'

export interface LLMProvider {
  id: string
  name: string
  providerType: LLMProviderType
  apiMode: LLMApiMode
  baseUrl: string
  apiKey: string
  models: string[]
}

export type LLMRole = 'leader' | 'agent' | 'boss' | 'evaluator' | 'personality_parser' | 'scholar'

export const LLM_ROLE_LABELS: Record<LLMRole, string> = {
  leader: 'Leader（路径决策）',
  agent: 'Agent（任务执行）',
  boss: 'Boss（任务验证）',
  evaluator: '难度评定员',
  personality_parser: '性格解析器',
  scholar: 'Scholar（知识学习）',
}

export interface LLMRoleConfig {
  role: LLMRole
  providerId: string
  model: string
  temperature: number
  maxTokens: number
}

// ===== 难度-性格映射 =====

export interface DifficultyPersonalityMapping {
  difficultyType: DifficultyType
  dimensionId: string
  direction: number // -1 = 该维度高则难度感知降低
  weight: number
}

// ===== 执行历史 =====

export type ExecutionStatus = 'success' | 'failure' | 'loop_detected'

export interface ExecutionHistory {
  id: string
  taskPrompt: string
  pathTaken: string[] // node IDs
  result?: string
  status: ExecutionStatus
  bossFeedback?: string
  retryCount: number
  createdAt: number
}

// ===== LLM 调用溯源 =====

export interface LLMTrace {
  model?: string
  prompt?: string
  rawResponse?: string
  tokenUsage?: { prompt: number; completion: number }
  latencyMs?: number
}

// ===== WebSocket 消息类型 =====

export type WSMessageType =
  | 'leader_step'
  | 'leader_decision'
  | 'leader_return'
  | 'agent_stream'
  | 'tool_call'
  | 'boss_verdict'
  | 'evolution_update'
  | 'graph_update'
  | 'learning_progress'
  | 'node_extracted'
  | 'extraction_done'
  | 'queue_update'
  | 'plan_ready'
  | 'step_confirm'
  | 'task_complete'
  | 'error'

export interface WSMessage {
  type: WSMessageType
  payload: unknown
  timestamp: number
}

export interface LeaderStepPayload {
  stepIndex: number
  currentNodeId: string
  candidates: Array<{
    edgeId: string
    targetNodeId: string
    targetNodeTitle: string
    perceivedDifficulty: number
    difficultyTypes: DifficultyType[]
  }>
  thinking: string
  trace?: LLMTrace
}

export interface LeaderDecisionPayload {
  chosenEdgeId: string | null
  reason: string
  totalSteps: number
  trace?: LLMTrace
}

export interface AgentStreamPayload {
  chunk: string
  done: boolean
  trace?: LLMTrace
}

export interface ToolCallPayload {
  callId: string
  toolName: string
  arguments: string
  phase: 'start' | 'end'
  result?: string
  success?: boolean
  durationMs?: number
}

export interface BossVerdictPayload {
  passed: boolean
  feedback: string
  isLoop: boolean
  retryCount: number
  trace?: LLMTrace
}

export interface EvolutionUpdatePayload {
  newNodeId?: string
  updatedEdges: Array<{ edgeId: string; newBaseDifficulty: number }>
  newEdges: Array<{ sourceId: string; targetId: string }>
}

export interface NodeExtractedPayload {
  nodeId: string
  title: string
  contentPreview: string
  tags: string[]
  confidence: number
}

export interface ExtractionDonePayload {
  totalNodes: number
  totalEdges: number
}

export interface LearningProgressPayload {
  phase: 'analyzing' | 'generating' | 'creating_nodes' | 'evaluating_edges' | 'creating_edges' | 'done' | 'error'
  message: string
  nodesCreated?: number
  edgesCreated?: number
  totalNodes?: number
  totalEdges?: number
  trace?: LLMTrace
}

// ===== 任务队列 =====

export interface QueueItem {
  id: string
  type: 'task' | 'learn'
  prompt: string
  brainId: string
  createdAt: number
}

// ===== 执行模式 =====

export type ExecutionMode = 'auto' | 'plan' | 'supervised' | 'readonly'

export interface PlanReadyPayload {
  planId: string
  taskPrompt: string
  path: Array<{ nodeId: string; nodeTitle: string; nodeType: string; stepIndex: number }>
  memoryContext: string
  totalSteps: number
  requestId?: string
}

export interface StepConfirmPayload {
  stepId: string
  type: 'leader_decision' | 'agent_execute'
  description: string
  requestId?: string
  /** 可回退的历史节点列表 */
  returnableNodes?: Array<{ nodeId: string; nodeTitle: string; stepIndex: number }>
}

/** 前端审批响应的 action 类型 */
export type ApprovalAction = 'approve' | 'reject' | 'return_to'

/** leader_return 事件 payload */
export interface LeaderReturnPayload {
  returnToNodeId: string
  returnToNodeTitle: string
  returnToStepIndex: number
  reason: string
}

// ===== 工具系统 =====

export interface ToolDefinition {
  id: string
  name: string
  description: string
  defaultEnabled: boolean
  category: 'search' | 'code' | 'memory' | 'utility' | 'coding'
}

// ===== 开发工具管理 =====

export interface DevToolInfo {
  id: string
  name: string
  description: string
  version: string
  installMethod: 'npm' | 'system'
  purpose: string
  installed: boolean
  installedVersion?: string
  path?: string
}

export interface DevToolInstallPayload {
  toolId: string
  phase: 'downloading' | 'installing' | 'done' | 'error'
  progress?: number
  message?: string
  version?: string
}
