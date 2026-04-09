import { onClientMessage } from '../../ws/server.js'
import type { PlanReadyPayload, StepConfirmPayload } from '../../types/index.js'
import { broadcast } from '../../ws/server.js'
import { randomUUID } from 'crypto'

const CONFIRM_TIMEOUT = 300_000 // 5 分钟超时

/**
 * 审批管理器
 * 职责：处理前端的审批响应，支持 plan 和 step 级别的确认
 */
export class ApprovalManager {
  private _pendingResolves = new Map<string, (approved: boolean) => void>()

  constructor() {
    // 监听前端的审批响应
    onClientMessage('plan_response', (payload: unknown) => {
      const { approved, requestId } = payload as { approved: boolean; requestId?: string }
      if (requestId && this._pendingResolves.has(requestId)) {
        const resolve = this._pendingResolves.get(requestId)!
        this._pendingResolves.delete(requestId)
        resolve(approved)
      }
    })

    onClientMessage('step_response', (payload: unknown) => {
      const { approved, requestId } = payload as { approved: boolean; requestId?: string }
      if (requestId && this._pendingResolves.has(requestId)) {
        const resolve = this._pendingResolves.get(requestId)!
        this._pendingResolves.delete(requestId)
        resolve(approved)
      }
    })
  }

  /**
   * 等待前端确认
   * @param requestId 请求ID
   * @returns true=批准 false=拒绝
   */
  waitForApproval(requestId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this._pendingResolves.set(requestId, resolve)
      // 超时默认拒绝（安全考虑）
      setTimeout(() => {
        if (this._pendingResolves.has(requestId)) {
          this._pendingResolves.delete(requestId)
          resolve(false) // 默认拒绝
        }
      }, CONFIRM_TIMEOUT)
    })
  }

  /**
   * 请求步骤审批（supervised 模式）
   * @param description 审批描述
   * @returns 审批结果
   */
  async requestStepApproval(description: string): Promise<boolean> {
    const requestId = `step-${randomUUID()}`
    broadcast('step_confirm', {
      stepId: requestId,
      type: 'leader_decision',
      description,
    } satisfies StepConfirmPayload)
    return this.waitForApproval(requestId)
  }

  /**
   * 请求计划审批（plan 模式）
   * @param planPayload 计划载荷
   * @returns 审批结果
   */
  async requestPlanApproval(planPayload: Omit<PlanReadyPayload, 'requestId'>): Promise<boolean> {
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
      resolve(false) // 默认拒绝
    }
  }
}
