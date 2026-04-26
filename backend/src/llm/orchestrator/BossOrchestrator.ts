import { BossRole } from '../roles/boss.js'
import { broadcast } from '../../ws/server.js'
import { getHistoryByTaskPrompt, createHistory } from '../../db/execution-history.js'
import { getRoleConfig } from '../../db/llm-config.js'
import type { BossVerdictPayload, LLMTrace } from '../../types/index.js'

/**
 * Boss 验证编排器
 * 职责：Boss 角色对 Agent 执行结果进行验证
 */
export class BossOrchestrator {
  private boss = new BossRole()

  /**
   * 验证 Agent 执行结果
   * @param taskPrompt 原始任务提示
   * @param agentResult Agent 执行结果
   * @param visitedPath 访问的路径
   * @returns 验证结果
   */
  async verify(
    taskPrompt: string,
    agentResult: string,
    visitedPath: string[]
  ): Promise<{
    passed: boolean
    feedback: string
    isLoop: boolean
    status: 'success' | 'failure' | 'loop_detected'
  }> {
    // 前置检查：Boss LLM 是否已配置
    if (!getRoleConfig('boss')) {
      broadcast('error', { message: '请先在设置中为 Boss 角色配置 LLM 模型' })
      return { passed: true, feedback: 'Boss 未配置，默认通过', isLoop: false, status: 'success' }
    }

    const retryHistory = getHistoryByTaskPrompt(taskPrompt)
    const bossInput = JSON.stringify({
      originalTask: taskPrompt, agentResult,
      retryHistory: retryHistory.slice(-5).map(h => ({ result: h.result?.substring(0, 200), status: h.status, feedback: h.bossFeedback })),
      retryCount: retryHistory.length,
    })

    const bossStartTime = Date.now()
    const bossResult = await this.boss.chat(bossInput)
    const bossLatency = Date.now() - bossStartTime
    let verdict: { passed: boolean; feedback: string; isLoop: boolean }

    const parseBossVerdict = (raw: unknown): typeof verdict => {
      const obj = raw as Record<string, unknown>
      return {
        passed: (obj.passed ?? obj.pass ?? obj.approved ?? true) as boolean,
        feedback: (obj.feedback ?? obj.comment ?? obj.reason ?? '') as string,
        isLoop: (obj.isLoop ?? obj.is_loop ?? obj.loop ?? false) as boolean,
      }
    }

    try {
      verdict = parseBossVerdict(JSON.parse(bossResult.content))
    } catch {
      const cleaned = bossResult.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        try { verdict = parseBossVerdict(JSON.parse(jsonMatch[0])) }
        catch { verdict = { passed: true, feedback: '验证格式错误，默认通过', isLoop: false } }
      } else {
        verdict = { passed: true, feedback: '验证格式错误，默认通过', isLoop: false }
      }
    }

    broadcast('boss_verdict', {
      passed: verdict.passed,
      feedback: verdict.feedback,
      isLoop: verdict.isLoop,
      retryCount: retryHistory.length,
      trace: {
        model: bossResult.model,
        prompt: bossInput,
        rawResponse: bossResult.content,
        latencyMs: bossLatency,
        ...(bossResult.usage ? { tokenUsage: { prompt: bossResult.usage.promptTokens, completion: bossResult.usage.completionTokens } } : {}),
      },
    } satisfies BossVerdictPayload)

    const status = verdict.isLoop ? 'loop_detected' : verdict.passed ? 'success' : 'failure'
    createHistory({ taskPrompt, pathTaken: visitedPath, result: agentResult, status, bossFeedback: verdict.feedback, retryCount: retryHistory.length })

    return {
      passed: verdict.passed,
      feedback: verdict.feedback,
      isLoop: verdict.isLoop,
      status,
    }
  }
}
