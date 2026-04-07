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
  perceivedDifficulty?: number // 运行时计算，不持久化
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

export interface LLMProvider {
  id: string
  name: string
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

// ===== WebSocket 消息类型 =====

export type WSMessageType =
  | 'leader_step'
  | 'leader_decision'
  | 'agent_stream'
  | 'boss_verdict'
  | 'evolution_update'
  | 'graph_update'
  | 'learning_progress'
  | 'node_extracted'
  | 'extraction_done'
  | 'error'

export interface WSMessage {
  type: WSMessageType
  payload: unknown
  timestamp: number
}

export interface LeaderStepPayload {
  currentNodeId: string
  candidates: Array<{
    edgeId: string
    targetNodeId: string
    targetNodeTitle: string
    perceivedDifficulty: number
    difficultyTypes: DifficultyType[]
    filtered: boolean // 是否被性格过滤掉
  }>
  thinking: string // Leader 的思考内容
}

export interface LeaderDecisionPayload {
  chosenEdgeId: string | null // null = 停止
  reason: string
  totalSteps: number
}

export interface AgentStreamPayload {
  chunk: string
  done: boolean
}

export interface BossVerdictPayload {
  passed: boolean
  feedback: string
  isLoop: boolean
  retryCount: number
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
}
