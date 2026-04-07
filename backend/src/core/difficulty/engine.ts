import type { MemoryEdge, PersonalityDimension, DifficultyPersonalityMapping, DifficultyType } from '../../types/index.js'
import { getAllDimensions } from '../../db/personality.js'
import { getMappings } from '../../db/difficulty-mapping.js'
import { getAllEdges } from '../../db/edges.js'

// ===== 辅助函数 =====

/** 按名称查找维度值，找不到返回 0.5 */
function getDimensionValue(dimensions: PersonalityDimension[], name: string): number {
  const dim = dimensions.find(d => d.name === name)
  return dim?.value ?? 0.5
}

/** 标准 softmax，减去最大值保证数值稳定性 */
function softmax(values: number[]): number[] {
  if (values.length === 0) return []
  const max = Math.max(...values)
  const exps = values.map(v => Math.exp(v - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / sum)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ===== 核心函数 =====

/**
 * 计算单条边的感知难度（方案 B：softmax 加权归一化）
 *
 * 算法：
 * 1. 对边的每种难度类型，查找对应的性格维度映射
 * 2. 对每种难度类型，计算性格调整值 adjustment = Σ(direction × (dimValue - 0.5) × weight)
 * 3. 对所有难度类型的 adjustment 做 softmax 归一化，防止单一维度主导
 * 4. 加权求和：totalAdjustment = Σ(softmaxWeight_i × difficultyTypeWeight_i × adjustment_i)
 * 5. adjustmentFactor = clamp(1 + totalAdjustment, 0.3, 1.7)
 * 6. perceivedDifficulty = clamp(baseDifficulty × adjustmentFactor, 0.01, 1.0)
 */
export function computePerceivedDifficulty(
  edge: MemoryEdge,
  dimensions: PersonalityDimension[],
  mappings: DifficultyPersonalityMapping[]
): number {
  const { baseDifficulty, difficultyTypes, difficultyTypeWeights } = edge

  // 没有难度类型，直接返回基础难度
  if (difficultyTypes.length === 0) return baseDifficulty

  // 按维度 id 建立快速查找表
  const dimById = new Map(dimensions.map(d => [d.id, d]))

  // 步骤 1-2：对每种难度类型计算 adjustment
  const adjustments: number[] = []
  const typeWeights: number[] = []

  for (const dtype of difficultyTypes) {
    const typeMappings = mappings.filter(m => m.difficultyType === dtype)

    let adjustment = 0
    for (const mapping of typeMappings) {
      const dim = dimById.get(mapping.dimensionId)
      const dimValue = dim?.value ?? 0.5
      adjustment += mapping.direction * (dimValue - 0.5) * mapping.weight
    }

    adjustments.push(adjustment)
    typeWeights.push(difficultyTypeWeights[dtype] ?? 1.0)
  }

  // 步骤 3：softmax 归一化
  const smWeights = softmax(adjustments)

  // 步骤 4：加权求和
  let totalAdjustment = 0
  for (let i = 0; i < adjustments.length; i++) {
    totalAdjustment += smWeights[i] * typeWeights[i] * adjustments[i]
  }

  // 步骤 5-6：计算最终感知难度
  const adjustmentFactor = clamp(1 + totalAdjustment, 0.3, 1.7)
  return clamp(baseDifficulty * adjustmentFactor, 0.01, 1.0)
}

/**
 * 批量计算所有边的感知难度
 * @returns edgeId → perceivedDifficulty 的 Map
 */
export function computeAllPerceivedDifficulties(
  edges: MemoryEdge[],
  dimensions?: PersonalityDimension[],
  mappings?: DifficultyPersonalityMapping[]
): Map<string, number> {
  const dims = dimensions ?? getAllDimensions()
  const maps = mappings ?? getMappings()

  const result = new Map<string, number>()
  for (const edge of edges) {
    result.set(edge.id, computePerceivedDifficulty(edge, dims, maps))
  }
  return result
}

/**
 * 计算性格的难度容忍阈值
 *
 * 主要由"勤快度"决定，"探索度"辅助：
 * threshold = 0.3 + 0.4 × diligence + 0.2 × exploration
 * 结果 clamp 到 [0.2, 0.95]
 */
export function computeToleranceThreshold(
  dimensions: PersonalityDimension[]
): number {
  const diligence = getDimensionValue(dimensions, '勤快度')
  const exploration = getDimensionValue(dimensions, '探索度')
  const threshold = 0.3 + 0.4 * diligence + 0.2 * exploration
  return clamp(threshold, 0.2, 0.95)
}
