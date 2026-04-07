import { LLMRoleBase } from './base.js'
import type { LLMRole } from '../../types/index.js'

export class PersonalityParserRole extends LLMRoleBase {
  readonly role: LLMRole = 'personality_parser'
  readonly systemPrompt: string
  readonly jsonMode = true

  constructor(existingDimensions: string[]) {
    super()
    const dims = existingDimensions.length > 0 ? existingDimensions.join('、') : '无'
    this.systemPrompt = `你是一个性格维度数值转换器。

已有维度：${dims}

用户输入一段性格描述，你输出对应的维度数值。

示例输入："性格开朗，做事马虎"
示例输出：{"updates":[{"name":"严谨度","value":0.2}],"newDimensions":[{"name":"开朗度","description":"情绪积极程度","value":0.85}]}

注意：
- value 范围 0.0~1.0
- updates 只能用已有维度名：${dims}
- newDimensions 用于已有维度无法表达的特征
- 只输出 JSON，不要输出任何其他文字`
  }
}
