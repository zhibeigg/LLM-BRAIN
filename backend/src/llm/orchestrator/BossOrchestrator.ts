import { BossRole } from '../roles/boss.js'
import type { ChatCompletionResult } from '../providers/base.js'
import { broadcast } from '../../ws/server.js'
import { getHistoryByTaskPrompt, createHistory } from '../../db/execution-history.js'
import { getRoleConfig } from '../../db/llm-config.js'
import type { BossVerdict, BossVerdictPayload, LLMTrace } from '../../types/index.js'
import { extractPartialJsonBooleanField, extractPartialJsonStringField } from '../../utils/stream-json.js'

/**
 * Boss 验证编排器
 * 职责：Boss 角色对 Agent 执行结果进行验证
 */
type ParsedBossVerdict = {
  verdict: BossVerdict
  passed: boolean
  feedback: string
  isLoop: boolean
  uncertain: boolean
}

function normalizeBossVerdict(raw: unknown, passed?: boolean, isLoop?: boolean, uncertain?: boolean): BossVerdict {
  const value = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (value === 'passed' || value === 'pass' || value === 'success') return 'passed'
  if (value === 'failed' || value === 'fail' || value === 'failure') return 'failed'
  if (value === 'uncertain' || value === 'unknown' || value === 'ambiguous' || value === 'needs_clarification') return 'uncertain'
  if (value === 'loop' || value === 'loop_detected') return 'loop'
  if (isLoop) return 'loop'
  if (uncertain) return 'uncertain'
  if (passed === true) return 'passed'
  if (passed === false) return 'failed'
  return 'uncertain'
}

function payloadFromVerdict(verdict: BossVerdict, feedback: string, retryCount: number, done: boolean, trace?: LLMTrace): BossVerdictPayload {
  return {
    verdict,
    passed: verdict === 'passed',
    uncertain: verdict === 'uncertain',
    feedback,
    isLoop: verdict === 'loop',
    retryCount,
    done,
    ...(trace ? { trace } : {}),
  }
}

export class BossOrchestrator {
  private boss = new BossRole()

  private async streamBossVerdict(bossInput: string, retryCount: number): Promise<ChatCompletionResult & { streamed: boolean }> {
    let content = ''
    let lastFeedback = ''
    let streamed = false

    broadcast('boss_verdict', payloadFromVerdict('uncertain', '', retryCount, false))

    for await (const chunk of this.boss.chatStream(bossInput)) {
      content += chunk.content
      const feedback = extractPartialJsonStringField(content, ['feedback', 'comment', 'reason'])
      const passed = extractPartialJsonBooleanField(content, ['passed', 'pass', 'approved'])
      const isLoop = extractPartialJsonBooleanField(content, ['isLoop', 'is_loop', 'loop'])
      const uncertain = extractPartialJsonBooleanField(content, ['uncertain', 'unknown', 'needsClarification', 'needs_clarification'])
      const partialVerdict = extractPartialJsonStringField(content, ['verdict', 'status', 'result'])
      const verdict = normalizeBossVerdict(partialVerdict, passed, isLoop, uncertain)

      if (feedback !== undefined && feedback !== lastFeedback) {
        lastFeedback = feedback
        streamed = true
        broadcast('boss_verdict', payloadFromVerdict(verdict, lastFeedback, retryCount, false))
      }
    }

    return { content, streamed }
  }

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
    verdict: BossVerdict
    passed: boolean
    feedback: string
    isLoop: boolean
    uncertain: boolean
    status: 'success' | 'failure' | 'uncertain' | 'loop_detected'
  }> {
    // 前置检查：Boss LLM 是否已配置
    const bossConfig = getRoleConfig('boss')
    if (!bossConfig) {
      broadcast('error', { message: '请先在设置中为 Boss 角色配置 LLM 模型' })
      return { verdict: 'passed', passed: true, feedback: 'Boss 未配置，默认通过', isLoop: false, uncertain: false, status: 'success' }
    }

    const retryHistory = getHistoryByTaskPrompt(taskPrompt)
    const bossInput = JSON.stringify({
      originalTask: taskPrompt, agentResult,
      retryHistory: retryHistory.slice(-5).map(h => ({ result: h.result?.substring(0, 200), status: h.status, feedback: h.bossFeedback })),
      retryCount: retryHistory.length,
    })

    const bossStartTime = Date.now()
    let bossResult: ChatCompletionResult & { streamed?: boolean }
    try {
      bossResult = await this.streamBossVerdict(bossInput, retryHistory.length)
      bossResult.model = bossConfig.model
      if (!bossResult.content) {
        bossResult = await this.boss.chat(bossInput)
      }
    } catch (err) {
      console.warn(`[Boss] stream verdict failed, fallback to non-stream chat: ${err instanceof Error ? err.message : String(err)}`)
      bossResult = await this.boss.chat(bossInput)
    }
    const bossLatency = Date.now() - bossStartTime
    let verdict: ParsedBossVerdict

    const parseBossVerdict = (raw: unknown): ParsedBossVerdict => {
      const obj = raw as Record<string, unknown>
      const passed = (obj.passed ?? obj.pass ?? obj.approved) as boolean | undefined
      const isLoop = (obj.isLoop ?? obj.is_loop ?? obj.loop) as boolean | undefined
      const uncertain = (obj.uncertain ?? obj.unknown ?? obj.needsClarification ?? obj.needs_clarification) as boolean | undefined
      const normalizedVerdict = normalizeBossVerdict(obj.verdict ?? obj.status ?? obj.result, passed, isLoop, uncertain)

      return {
        verdict: normalizedVerdict,
        passed: normalizedVerdict === 'passed',
        feedback: (obj.feedback ?? obj.comment ?? obj.reason ?? '') as string,
        isLoop: normalizedVerdict === 'loop',
        uncertain: normalizedVerdict === 'uncertain',
      }
    }

    try {
      verdict = parseBossVerdict(JSON.parse(bossResult.content))
    } catch {
      const cleaned = bossResult.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        try { verdict = parseBossVerdict(JSON.parse(jsonMatch[0])) }
        catch { verdict = { verdict: 'uncertain', passed: false, feedback: 'Boss 输出格式无法解析，已停止自动重试以避免额外 token 消耗。', isLoop: false, uncertain: true } }
      } else {
        verdict = { verdict: 'uncertain', passed: false, feedback: 'Boss 输出格式无法解析，已停止自动重试以避免额外 token 消耗。', isLoop: false, uncertain: true }
      }
    }

    broadcast('boss_verdict', payloadFromVerdict(verdict.verdict, verdict.feedback, retryHistory.length, true, {
      model: bossResult.model,
      prompt: bossInput,
      rawResponse: bossResult.content,
      latencyMs: bossLatency,
      ...(bossResult.usage ? { tokenUsage: { prompt: bossResult.usage.promptTokens, completion: bossResult.usage.completionTokens } } : {}),
    }))

    const status = verdict.isLoop ? 'loop_detected' : verdict.uncertain ? 'uncertain' : verdict.passed ? 'success' : 'failure'
    createHistory({ taskPrompt, pathTaken: visitedPath, result: agentResult, status, bossFeedback: verdict.feedback, retryCount: retryHistory.length })

    return {
      verdict: verdict.verdict,
      passed: verdict.passed,
      feedback: verdict.feedback,
      isLoop: verdict.isLoop,
      uncertain: verdict.uncertain,
      status,
    }
  }
}
