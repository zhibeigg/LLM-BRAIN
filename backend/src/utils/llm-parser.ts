/**
 * LLM响应解析工具函数
 * 统一处理LLM返回的JSON解析，包括markdown代码块清理和正则提取
 */

export interface ParseResult<T> {
  ok: boolean
  value?: T
  error?: string
  raw?: string
}

/**
 * 解析LLM返回的JSON内容
 * @param raw LLM原始响应
 * @returns 解析结果
 */
export function parseLLMJson<T>(raw: string): ParseResult<T> {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, error: '输入为空或不是字符串', raw }
  }

  try {
    // 尝试直接解析
    const parsed = JSON.parse(raw)
    return { ok: true, value: parsed as T, raw }
  } catch {
    // 清理markdown代码块
    const cleaned = raw
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
    
    // 尝试解析清理后的内容
    try {
      const parsed = JSON.parse(cleaned)
      return { ok: true, value: parsed as T, raw }
    } catch {
      // 提取JSON对象
      const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          return { ok: true, value: parsed as T, raw }
        } catch {
          // 提取JSON数组
          const arrayMatch = cleaned.match(/\[[\s\S]*?\]/)
          if (arrayMatch) {
            try {
              const parsed = JSON.parse(arrayMatch[0])
              return { ok: true, value: parsed as T, raw }
            } catch {
              return { 
                ok: false, 
                error: '找到JSON格式但解析失败', 
                raw 
              }
            }
          }
          
          return { 
            ok: false, 
            error: '找到JSON对象但解析失败', 
            raw 
          }
        }
      }
      
      return { 
        ok: false, 
        error: '未找到有效的JSON内容', 
        raw 
      }
    }
  }
}

/**
 * 解析Leader决策
 * @param raw LLM原始响应
 * @returns 解析结果
 */
export function parseLeaderDecision(raw: string): ParseResult<{
  action: string
  edgeId: string | null
  reason: string
  thinking: string
}> {
  const result = parseLLMJson<Record<string, unknown>>(raw)
  
  if (!result.ok) {
    return result as ParseResult<any>
  }
  
  const obj = result.value!
  
  // 检测是否是有效的决策 JSON（必须有 action 或 edgeId）
  const hasAction = 'action' in obj
  const hasEdgeId = 'edgeId' in obj || 'selectedEdgeId' in obj || 'edge_id' in obj || 'chosenEdgeId' in obj
  
  if (!hasAction && !hasEdgeId) {
    return {
      ok: false,
      error: 'LLM返回了无关内容（如对话回复），视为无效决策',
      raw
    }
  }
  
  let edgeId = (obj.edgeId ?? obj.selectedEdgeId ?? obj.edge_id ?? obj.chosenEdgeId ?? obj.recommendedEdgeId ?? null) as string | null
  const action = (obj.action as string) ?? (edgeId ? 'continue' : 'stop')
  const reason = (obj.reason ?? obj.reasoning ?? obj.explanation ?? '') as string
  const thinking = (obj.thinking ?? obj.thought ?? obj.analysis ?? '') as string
  
  return {
    ok: true,
    value: { action, edgeId, reason, thinking },
    raw
  }
}

/**
 * 解析Scholar/Learning结果
 * @param raw LLM原始响应
 * @returns 解析结果
 */
export function parseScholarResult(raw: string): ParseResult<{
  nodes: Array<{
    title: string
    content: string
    type: string
    tags?: string[]
    confidence?: number
  }>
  edges: Array<{
    sourceTitle: string
    targetTitle: string
    difficultyTypes?: Record<string, number>
  }>
  existingNodeEdges: Array<{
    existingNodeId: string
    targetTitle: string
    difficultyTypes?: Record<string, number>
  }>
}> {
  return parseLLMJson(raw)
}

/**
 * 解析工具调用参数
 * @param raw LLM原始响应
 * @returns 解析结果
 */
export function parseToolCallArgs<T>(raw: string): ParseResult<T> {
  return parseLLMJson<T>(raw)
}

/**
 * 安全地获取对象属性
 * @param obj 对象
 * @param key 键名
 * @param defaultValue 默认值
 * @returns 属性值
 */
export function safeGet<T>(obj: Record<string, unknown>, key: string, defaultValue: T): T {
  const value = obj[key]
  return value !== undefined ? (value as T) : defaultValue
}

/**
 * 验证决策对象
 * @param decision 决策对象
 * @param validEdgeIds 有效的边ID集合
 * @returns 是否有效
 */
export function validateDecision(
  decision: { action: string; edgeId: string | null },
  validEdgeIds: Set<string>
): boolean {
  if (decision.action === 'stop') {
    return decision.edgeId === null
  }
  
  if (decision.action === 'continue') {
    return decision.edgeId !== null && validEdgeIds.has(decision.edgeId)
  }
  
  return false
}