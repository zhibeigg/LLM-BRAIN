import { describe, it, expect } from 'vitest'
import { computePerceivedDifficulty, computeToleranceThreshold } from './engine.js'
import type { MemoryEdge, PersonalityDimension, DifficultyPersonalityMapping } from '../../types/index.js'

// 构造测试用的边
function makeEdge(overrides: Partial<MemoryEdge> = {}): MemoryEdge {
  return {
    id: 'e1',
    sourceId: 'n1',
    targetId: 'n2',
    baseDifficulty: 0.5,
    difficultyTypes: ['reasoning'],
    difficultyTypeWeights: { reasoning: 1.0 },
    usageCount: 0,
    createdAt: Date.now(),
    ...overrides,
  }
}

function makeDimension(name: string, value: number, id = name): PersonalityDimension {
  return { id, brainId: 'b1', name, value, description: '', isBuiltin: true, sortOrder: 0 }
}

describe('difficulty engine', () => {
  describe('computePerceivedDifficulty', () => {
    it('无难度类型时返回基础难度', () => {
      const edge = makeEdge({ difficultyTypes: [], difficultyTypeWeights: {} })
      const result = computePerceivedDifficulty(edge, [], [])
      expect(result).toBe(0.5)
    })

    it('无映射时感知难度接近基础难度', () => {
      const edge = makeEdge()
      const dims = [makeDimension('勤快度', 0.5)]
      const result = computePerceivedDifficulty(edge, dims, [])
      // 无映射 → adjustment 全为 0 → softmax 均匀 → factor ≈ 1.0
      expect(result).toBeCloseTo(0.5, 1)
    })

    it('高勤快度 + 正向映射降低感知难度', () => {
      const edge = makeEdge({ baseDifficulty: 0.6 })
      const dims = [makeDimension('勤快度', 0.9, 'dim-diligence')]
      const mappings: DifficultyPersonalityMapping[] = [{
        difficultyType: 'reasoning',
        dimensionId: 'dim-diligence',
        direction: -1,
        weight: 1.0,
      }]
      const result = computePerceivedDifficulty(edge, dims, mappings)
      // direction=-1, dimValue=0.9 → adjustment = -1 * (0.9-0.5) * 1.0 = -0.4
      // factor = clamp(1 + (-0.4), 0.3, 1.7) = 0.6
      // perceived = 0.6 * 0.6 = 0.36
      expect(result).toBeCloseTo(0.36, 2)
    })

    it('结果 clamp 到 [0.01, 1.0]', () => {
      const edge = makeEdge({ baseDifficulty: 0.95 })
      const dims = [makeDimension('严谨度', 0.1, 'dim-rigor')]
      const mappings: DifficultyPersonalityMapping[] = [{
        difficultyType: 'reasoning',
        dimensionId: 'dim-rigor',
        direction: 1,
        weight: 3.0,
      }]
      const result = computePerceivedDifficulty(edge, dims, mappings)
      expect(result).toBeGreaterThanOrEqual(0.01)
      expect(result).toBeLessThanOrEqual(1.0)
    })

    it('多种难度类型的 softmax 加权', () => {
      const edge = makeEdge({
        difficultyTypes: ['reasoning', 'creativity'],
        difficultyTypeWeights: { reasoning: 0.7, creativity: 0.3 },
      })
      const dims = [makeDimension('探索度', 0.8, 'dim-explore')]
      const mappings: DifficultyPersonalityMapping[] = [
        { difficultyType: 'reasoning', dimensionId: 'dim-explore', direction: -1, weight: 1.0 },
        { difficultyType: 'creativity', dimensionId: 'dim-explore', direction: 1, weight: 1.0 },
      ]
      const result = computePerceivedDifficulty(edge, dims, mappings)
      // 两种类型有不同方向的调整，结果应在合理范围内
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(1.0)
    })
  })

  describe('computeToleranceThreshold', () => {
    it('默认维度值 (0.5, 0.5) → 阈值 0.6', () => {
      const dims = [
        makeDimension('勤快度', 0.5),
        makeDimension('探索度', 0.5),
      ]
      const result = computeToleranceThreshold(dims)
      // 0.3 + 0.4*0.5 + 0.2*0.5 = 0.3 + 0.2 + 0.1 = 0.6
      expect(result).toBeCloseTo(0.6, 5)
    })

    it('最高勤快度和探索度 → 阈值 0.9', () => {
      const dims = [
        makeDimension('勤快度', 1.0),
        makeDimension('探索度', 1.0),
      ]
      const result = computeToleranceThreshold(dims)
      // 0.3 + 0.4*1.0 + 0.2*1.0 = 0.9
      expect(result).toBeCloseTo(0.9, 5)
    })

    it('最低值 → 阈值 clamp 到 0.3', () => {
      const dims = [
        makeDimension('勤快度', 0.0),
        makeDimension('探索度', 0.0),
      ]
      const result = computeToleranceThreshold(dims)
      // 0.3 + 0 + 0 = 0.3
      expect(result).toBeCloseTo(0.3, 5)
    })

    it('缺少维度时使用默认值 0.5', () => {
      const result = computeToleranceThreshold([])
      // 0.3 + 0.4*0.5 + 0.2*0.5 = 0.6
      expect(result).toBeCloseTo(0.6, 5)
    })

    it('结果 clamp 到 [0.2, 0.95]', () => {
      const dims = [
        makeDimension('勤快度', 1.0),
        makeDimension('探索度', 1.0),
      ]
      const result = computeToleranceThreshold(dims)
      expect(result).toBeGreaterThanOrEqual(0.2)
      expect(result).toBeLessThanOrEqual(0.95)
    })
  })
})
