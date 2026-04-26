import { describe, it, expect } from 'vitest'

/**
 * 测试边衰减公式的纯数学逻辑
 * decayFactor = 1 + 0.01 * ln(daysSinceUse / 7)
 * newDifficulty = min(1.0, baseDifficulty * decayFactor)
 */

function computeDecay(baseDifficulty: number, daysSinceUse: number): number {
  if (daysSinceUse <= 7) return baseDifficulty
  const decayFactor = 1 + 0.01 * Math.log(daysSinceUse / 7)
  return Math.min(1.0, baseDifficulty * decayFactor)
}

describe('evolution engine - decay formula', () => {
  it('7天内不衰减', () => {
    expect(computeDecay(0.5, 0)).toBe(0.5)
    expect(computeDecay(0.5, 3)).toBe(0.5)
    expect(computeDecay(0.5, 7)).toBe(0.5)
  })

  it('14天时轻微衰减', () => {
    const result = computeDecay(0.5, 14)
    // ln(2) ≈ 0.693, factor ≈ 1.00693, result ≈ 0.50347
    expect(result).toBeGreaterThan(0.5)
    expect(result).toBeCloseTo(0.5035, 3)
  })

  it('70天时适度衰减', () => {
    const result = computeDecay(0.5, 70)
    // ln(10) ≈ 2.303, factor ≈ 1.02303, result ≈ 0.51151
    expect(result).toBeCloseTo(0.5115, 3)
  })

  it('365天时仍然温和', () => {
    const result = computeDecay(0.5, 365)
    // ln(365/7) ≈ ln(52.14) ≈ 3.954, factor ≈ 1.03954, result ≈ 0.51977
    expect(result).toBeCloseTo(0.5198, 3)
  })

  it('上限不超过 1.0', () => {
    const result = computeDecay(0.99, 3650)
    expect(result).toBeLessThanOrEqual(1.0)
  })

  it('低基础难度衰减后仍然很低', () => {
    const result = computeDecay(0.1, 30)
    expect(result).toBeGreaterThan(0.1)
    expect(result).toBeLessThan(0.15)
  })

  it('衰减是单调递增的（时间越长难度越高）', () => {
    const d14 = computeDecay(0.5, 14)
    const d30 = computeDecay(0.5, 30)
    const d90 = computeDecay(0.5, 90)
    const d365 = computeDecay(0.5, 365)
    expect(d14).toBeLessThan(d30)
    expect(d30).toBeLessThan(d90)
    expect(d90).toBeLessThan(d365)
  })
})
