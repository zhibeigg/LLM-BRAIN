import { describe, it, expect } from 'vitest'

/**
 * 测试 extraction engine 的标题去重逻辑（纯函数测试）
 */

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\-_.,;:!?'"()[\]{}\/\\]/g, '')
    .replace(/[，。；：！？、""''（）【】《》]/g, '')
    .trim()
}

function isDuplicateTitle(newTitle: string, existingTitles: string[]): boolean {
  const newNorm = normalizeTitle(newTitle)
  return existingTitles.some(existing => {
    const existNorm = normalizeTitle(existing)
    return existNorm === newNorm || existNorm.includes(newNorm) || newNorm.includes(existNorm)
  })
}

describe('extraction engine - title dedup', () => {
  describe('normalizeTitle', () => {
    it('转小写', () => {
      expect(normalizeTitle('Hello World')).toBe('helloworld')
    })

    it('去除英文标点和空格', () => {
      expect(normalizeTitle('hello, world!')).toBe('helloworld')
    })

    it('去除中文标点', () => {
      expect(normalizeTitle('你好，世界！')).toBe('你好世界')
    })

    it('去除连字符和下划线', () => {
      expect(normalizeTitle('my-node_title')).toBe('mynodetitle')
    })

    it('空字符串', () => {
      expect(normalizeTitle('')).toBe('')
    })
  })

  describe('isDuplicateTitle', () => {
    const existing = [
      'React 组件生命周期',
      'TypeScript 泛型约束',
      'WebSocket 实时通信',
    ]

    it('完全相同标题判定为重复', () => {
      expect(isDuplicateTitle('React 组件生命周期', existing)).toBe(true)
    })

    it('大小写不同判定为重复', () => {
      expect(isDuplicateTitle('react 组件生命周期', existing)).toBe(true)
    })

    it('标点差异判定为重复', () => {
      expect(isDuplicateTitle('React组件生命周期', existing)).toBe(true)
    })

    it('已有标题包含新标题判定为重复', () => {
      expect(isDuplicateTitle('泛型约束', existing)).toBe(true)
    })

    it('新标题包含已有标题判定为重复', () => {
      expect(isDuplicateTitle('React 组件生命周期详解', existing)).toBe(true)
    })

    it('完全不同的标题不重复', () => {
      expect(isDuplicateTitle('Vue 响应式原理', existing)).toBe(false)
    })

    it('空已有列表不重复', () => {
      expect(isDuplicateTitle('任何标题', [])).toBe(false)
    })

    it('部分词汇重叠但含义不同不重复', () => {
      expect(isDuplicateTitle('React Native 导航', existing)).toBe(false)
    })
  })
})
