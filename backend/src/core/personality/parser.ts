import { PersonalityParserRole } from '../../llm/roles/personality-parser.js'
import { getAllDimensions, createDimension, updateDimension, getMaxDimensions } from '../../db/personality.js'
import type { PersonalityDimension } from '../../types/index.js'

export async function parsePersonalityFromChat(
  userDescription: string,
  brainId: string
): Promise<{
  updates: Array<{ name: string; value: number; dimensionId: string }>
  newDimensions: Array<{ name: string; description: string; value: number; dimensionId: string }>
}> {
  // 1. 获取当前所有维度
  const existingDimensions = getAllDimensions().filter(d => d.brainId === brainId)
  const dimensionNames = existingDimensions.map(d => d.name)

  // 2. 创建解析器并调用 LLM
  // 构造强制格式的 user message，让 LLM 只需填数字
  const parser = new PersonalityParserRole(dimensionNames)
  const templateUpdates = existingDimensions.map(d => `{"name":"${d.name}","value":__}`).join(',')
  const forcedUserMessage = `用户描述：${userDescription}

请直接输出 JSON，把 __ 替换为 0.0~1.0 的数字。如果有新维度也加到 newDimensions 里。
{"updates":[${templateUpdates}],"newDimensions":[]}`

  const result = await parser.chat(forcedUserMessage)

  // 3. 解析返回的 JSON
  let parsed: {
    updates?: Array<{ name: string; value: number }>
    newDimensions?: Array<{ name: string; description: string; value: number }>
  }
  try {
    parsed = JSON.parse(result.content)
  } catch {
    const cleaned = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        console.error('PersonalityParser: JSON parse failed, raw:', result.content.substring(0, 500))
        return { updates: [], newDimensions: [] }
      }
    } else {
      console.error('PersonalityParser: No JSON found, raw:', result.content.substring(0, 500))
      return { updates: [], newDimensions: [] }
    }
  }

  // 兜底：如果 LLM 返回了非标准结构，递归扫描所有数值字段
  if (!parsed.updates && !parsed.newDimensions) {
    const updates: Array<{ name: string; value: number }> = []
    const newDims: Array<{ name: string; description: string; value: number }> = []

    // 递归扫描 JSON 中所有 key:number 对
    function scan(obj: unknown) {
      if (obj === null || typeof obj !== 'object') return
      if (Array.isArray(obj)) { obj.forEach(scan); return }
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof val === 'number' && val >= 0 && val <= 1) {
          if (existingDimensions.some(d => d.name === key)) {
            updates.push({ name: key, value: val })
          } else if (key.length >= 2 && key.length <= 20) {
            newDims.push({ name: key, description: '', value: val })
          }
        } else if (typeof val === 'object') {
          scan(val)
        }
      }
    }
    scan(parsed)

    if (updates.length > 0 || newDims.length > 0) {
      parsed = { updates, newDimensions: newDims }
    }
  }

  const appliedUpdates: Array<{ name: string; value: number; dimensionId: string }> = []
  const appliedNew: Array<{ name: string; description: string; value: number; dimensionId: string }> = []

  // 4. 处理 updates：找到对应维度并更新
  if (parsed.updates) {
    for (const u of parsed.updates) {
      const dim = existingDimensions.find(d => d.name === u.name)
      if (!dim) continue

      const value = Math.max(0, Math.min(1, u.value))
      const updated = updateDimension(dim.id, { value })
      if (updated) {
        appliedUpdates.push({ name: u.name, value, dimensionId: dim.id })
      }
    }
  }

  // 5. 处理 newDimensions：检查上限后创建
  if (parsed.newDimensions) {
    const max = getMaxDimensions()

    for (const nd of parsed.newDimensions) {
      if (existingDimensions.length + appliedNew.length >= max) break
      // 跳过已存在的同名维度
      if (existingDimensions.some(d => d.name === nd.name)) continue

      const value = Math.max(0, Math.min(1, nd.value))
      const created = createDimension({
        brainId,
        name: nd.name,
        description: nd.description ?? '',
        value,
        isBuiltin: false,
        sortOrder: existingDimensions.length + appliedNew.length,
      })
      appliedNew.push({
        name: nd.name,
        description: nd.description ?? '',
        value,
        dimensionId: created.id,
      })
    }
  }

  return { updates: appliedUpdates, newDimensions: appliedNew }
}
