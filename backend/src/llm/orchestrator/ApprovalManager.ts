import { onClientMessage } from '../../ws/server.js'
import type { PlanReadyPayload, StepConfirmPayload, ApprovalAction, ApprovalResponsePayload, ExecutionSnapshot } from '../../types/index.js'
import { broadcast } from '../../ws/server.js'
import { randomUUID } from 'crypto'

const CONFIRM_TIMEOUT = 300_000 // 5 分钟超时

/** 审批结果：approve / reject / return_to（附带目标节点） */
export interface ApprovalResult {
  action: ApprovalAction
  returnToNodeId?: string
}

/**
 * 审批管理器
 * 职责：处理前端的审批响应，支持 plan 和 step 级别的确认，以及回退到历史节点
 */
export class ApprovalManager {
  private _pendingResolves = new Map<string, (result: ApprovalResult) => void>()

  constructor() {
    // 监听前端的审批响应（兼容旧格式 { approved } 和新格式 { action }）
    const handleResponse = (payload: unknown) => {
      const raw = payload as Record<string, unknown>
      const requestId = raw.requestId as string | undefined
      if (!requestId || !this._pendingResolves.has(requestId)) return

      const resolve = this._pendingResolves.get(requestId)!
      this._pendingResolves.delete(requestId)

      // 新格式：{ action, requestId, returnToNodeId? }
      if ('action' in raw) {
        const p = raw as unknown as ApprovalResponsePayload
        resolve({ action: p.action, returnToNodeId: p.returnToNodeId })
        return
      }

      // 旧格式兼容：{ approved: boolean, requestId }
      const approved = raw.approved as boolean
      resolve({ action: approved ? 'approve' : 'reject' })
    }

    onClientMessage('plan_response', handleResponse)
    onClientMessage('step_response', handleResponse)
  }

  /**
   * 等待前端确认（三态）
   * @returns ApprovalResult
   */
  waitForApproval(requestId: string): Promise<ApprovalResult> {
    return new Promise((resolve) => {
      this._pendingResolves.set(requestId, resolve)
      setTimeout(() => {
        if (this._pendingResolves.has(requestId)) {
          this._pendingResolves.delete(requestId)
          resolve({ action: 'reject' })
        }
      }, CONFIRM_TIMEOUT)
    })
  }

  /**
   * 请求步骤审批（supervised 模式），附带可回退节点列表
   */
  async requestStepApproval(
    description: string,
    snapshots?: ExecutionSnapshot[]
  ): Promise<ApprovalResult> {
    const requestId = `step-${randomUUID()}`
    const returnableNodes = snapshots?.map(s => ({
      nodeId: s.nodeId,
      nodeTitle: s.nodeTitle,
      stepIndex: s.stepIndex,
    }))
    broadcast('step_confirm', {
      stepId: requestId,
      type: 'leader_decision',
      description,
      requestId,
      returnableNodes,
    } satisfies StepConfirmPayload)
    return this.waitForApproval(requestId)
  }

  /**
   * 请求计划审批（plan 模式）
   */
  async requestPlanApproval(planPayload: Omit<PlanReadyPayload, 'requestId'>): Promise<ApprovalResult> {
    const requestId = `plan-${randomUUID()}`
    broadcast('plan_ready', { ...planPayload, requestId })
    return this.waitForApproval(requestId)
  }

  /**
   * 取消所有待处理的审批请求
   */
  cancelAllPending(): void {
    for (const [requestId, resolve] of this._pendingResolves) {
      this._pendingResolves.delete(requestId)
      resolve({ action: 'reject' })
    }
  }
}
