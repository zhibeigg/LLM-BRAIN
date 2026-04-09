/**
 * Orchestrator 模块
 * 
 * 该模块将原来的 Orchestrator 类拆分为多个职责单一的类：
 * - TaskQueue: 队列管理
 * - LeaderOrchestrator: Leader 决策循环
 * - AgentOrchestrator: Agent 执行调度
 * - BossOrchestrator: Boss 验证逻辑
 * - ApprovalManager: 审批等待管理
 * - DifficultyAdjuster: 路径难度调整
 * 
 * 为保持向后兼容，本文件重新导出新模块的内容。
 */

// 重新导出所有类
export { TaskQueue } from './orchestrator/TaskQueue.js'
export { LeaderOrchestrator, DifficultyAdjuster } from './orchestrator/LeaderOrchestrator.js'
export { AgentOrchestrator } from './orchestrator/AgentOrchestrator.js'
export { BossOrchestrator } from './orchestrator/BossOrchestrator.js'
export { ApprovalManager } from './orchestrator/ApprovalManager.js'

// 重新导出 Orchestrator 主类（向后兼容）
export { Orchestrator, orchestrator } from './orchestrator/index.js'

// 保留原有的类型导出
export type {
  QueueItem,
  ExecutionMode,
  PlanReadyPayload,
  StepConfirmPayload,
} from '../types/index.js'
