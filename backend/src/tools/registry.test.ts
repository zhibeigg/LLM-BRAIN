import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all tool implementations before importing registry
vi.mock('./implementations/web-search.js', () => ({
  executeWebSearch: vi.fn().mockResolvedValue({ success: true, output: 'search result' }),
}))

vi.mock('./implementations/url-reader.js', () => ({
  executeUrlReader: vi.fn().mockResolvedValue({ success: true, output: 'url content' }),
}))

vi.mock('./implementations/code-executor.js', () => ({
  executeCode: vi.fn().mockResolvedValue({ success: true, output: 'code result' }),
}))

vi.mock('./implementations/memory-search.js', () => ({
  executeMemorySearch: vi.fn().mockResolvedValue({ success: true, output: 'memory result' }),
}))

vi.mock('./implementations/memory-write.js', () => ({
  executeMemoryWrite: vi.fn().mockResolvedValue({ success: true, output: 'write result' }),
}))

vi.mock('./implementations/calculator.js', () => ({
  executeCalculator: vi.fn().mockResolvedValue({ success: true, output: '42' }),
}))

vi.mock('./implementations/terminal.js', () => ({
  executeTerminal: vi.fn().mockResolvedValue({ success: true, output: 'terminal result' }),
}))

vi.mock('./implementations/share-file.js', () => ({
  executeShareFile: vi.fn().mockResolvedValue({ success: true, output: 'file shared' }),
}))

vi.mock('./implementations/browser.js', () => ({
  executeBrowser: vi.fn().mockResolvedValue({ success: true, output: 'browser result' }),
}))

vi.mock('./implementations/node-control.js', () => ({
  executeNodeEdit: vi.fn().mockResolvedValue({ success: true, output: 'node edited' }),
  executeNodeDelete: vi.fn().mockResolvedValue({ success: true, output: 'node deleted' }),
  executeNodeList: vi.fn().mockResolvedValue({ success: true, output: 'node list' }),
}))

import {
  getAllTools,
  getToolById,
  buildOpenAITools,
  executeTool,
} from './registry.js'
import type { ToolContext } from '../types/index.js'

describe('tools registry', () => {
  const mockContext: ToolContext = { brainId: 'test-brain' }

  describe('getAllTools', () => {
    it('should return all tool definitions', () => {
      const tools = getAllTools()

      expect(tools.length).toBeGreaterThan(0)
      expect(tools.some(t => t.id === 'web_search')).toBe(true)
      expect(tools.some(t => t.id === 'url_reader')).toBe(true)
      expect(tools.some(t => t.id === 'code_executor')).toBe(true)
      expect(tools.some(t => t.id === 'memory_search')).toBe(true)
      expect(tools.some(t => t.id === 'memory_write')).toBe(true)
      expect(tools.some(t => t.id === 'calculator')).toBe(true)
      expect(tools.some(t => t.id === 'terminal')).toBe(true)
      expect(tools.some(t => t.id === 'share_file')).toBe(true)
      expect(tools.some(t => t.id === 'browser')).toBe(true)
      expect(tools.some(t => t.id === 'node_edit')).toBe(true)
      expect(tools.some(t => t.id === 'node_delete')).toBe(true)
      expect(tools.some(t => t.id === 'node_list')).toBe(true)
    })

    it('should have valid tool structure', () => {
      const tools = getAllTools()

      for (const tool of tools) {
        expect(tool.id).toBeDefined()
        expect(tool.name).toBeDefined()
        expect(tool.description).toBeDefined()
        expect(tool.parameters).toBeDefined()
        expect(tool.parameters.type).toBe('object')
        expect(tool.parameters.properties).toBeDefined()
        expect(typeof tool.defaultEnabled).toBe('boolean')
        expect(['search', 'code', 'memory', 'utility']).toContain(tool.category)
      }
    })
  })

  describe('getToolById', () => {
    it('should return tool by id', () => {
      const tool = getToolById('web_search')

      expect(tool).toBeDefined()
      expect(tool?.id).toBe('web_search')
      expect(tool?.name).toBe('网页搜索')
    })

    it('should return undefined for non-existent tool', () => {
      const tool = getToolById('nonexistent')

      expect(tool).toBeUndefined()
    })

    it('should return calculator tool', () => {
      const tool = getToolById('calculator')

      expect(tool).toBeDefined()
      expect(tool?.id).toBe('calculator')
      expect(tool?.name).toBe('计算器')
      expect(tool?.parameters.properties.expression).toBeDefined()
    })
  })

  describe('buildOpenAITools', () => {
    it('should return empty array when no tools enabled', () => {
      const tools = buildOpenAITools([])

      expect(tools).toEqual([])
    })

    it('should return tools for enabled ids', () => {
      const tools = buildOpenAITools(['web_search', 'calculator'])

      expect(tools).toHaveLength(2)
      expect(tools[0].type).toBe('function')
      expect(tools[0].function.name).toBe('web_search')
      expect(tools[1].function.name).toBe('calculator')
    })

    it('should include description and parameters', () => {
      const tools = buildOpenAITools(['web_search'])

      expect(tools[0].function.description).toBeDefined()
      expect(tools[0].function.parameters).toBeDefined()
    })

    it('should handle duplicate enabled ids', () => {
      const tools = buildOpenAITools(['web_search', 'web_search', 'calculator'])

      expect(tools).toHaveLength(2)
    })

    it('should ignore non-existent tool ids', () => {
      const tools = buildOpenAITools(['web_search', 'nonexistent', 'calculator'])

      expect(tools).toHaveLength(2)
    })

    it('should return empty for all non-existent ids', () => {
      const tools = buildOpenAITools(['fake1', 'fake2'])

      expect(tools).toEqual([])
    })
  })

  describe('executeTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await executeTool('unknown_tool', '{}', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('未知工具')
    })

    it('should return error for invalid JSON args', async () => {
      const result = await executeTool('calculator', 'not json', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('JSON 解析失败')
    })

    it('should execute calculator tool with valid args', async () => {
      const result = await executeTool('calculator', '{"expression": "2+2"}', mockContext)

      expect(result.success).toBe(true)
    })

    it('should have all required tool fields', async () => {
      const tools = getAllTools()

      for (const tool of tools) {
        // parameters.required can be undefined for tools with no required params
        expect(tool.parameters.type).toBe('object')
        expect(tool.parameters.properties).toBeDefined()
      }
    })
  })

  describe('tool categories', () => {
    it('should have tools in search category', () => {
      const tools = getAllTools().filter(t => t.category === 'search')

      expect(tools.length).toBeGreaterThan(0)
      expect(tools.some(t => t.id === 'web_search')).toBe(true)
      expect(tools.some(t => t.id === 'url_reader')).toBe(true)
      expect(tools.some(t => t.id === 'browser')).toBe(true)
    })

    it('should have tools in code category', () => {
      const tools = getAllTools().filter(t => t.category === 'code')

      expect(tools.length).toBeGreaterThan(0)
      expect(tools.some(t => t.id === 'code_executor')).toBe(true)
      expect(tools.some(t => t.id === 'terminal')).toBe(true)
    })

    it('should have tools in memory category', () => {
      const tools = getAllTools().filter(t => t.category === 'memory')

      expect(tools.length).toBeGreaterThan(0)
      expect(tools.some(t => t.id === 'memory_search')).toBe(true)
      expect(tools.some(t => t.id === 'memory_write')).toBe(true)
      expect(tools.some(t => t.id === 'node_edit')).toBe(true)
      expect(tools.some(t => t.id === 'node_delete')).toBe(true)
      expect(tools.some(t => t.id === 'node_list')).toBe(true)
    })

    it('should have tools in utility category', () => {
      const tools = getAllTools().filter(t => t.category === 'utility')

      expect(tools.length).toBeGreaterThan(0)
      expect(tools.some(t => t.id === 'calculator')).toBe(true)
      expect(tools.some(t => t.id === 'share_file')).toBe(true)
    })
  })

  describe('tool default enabled states', () => {
    it('should have web_search enabled by default', () => {
      const tool = getToolById('web_search')
      expect(tool?.defaultEnabled).toBe(true)
    })

    it('should have code_executor disabled by default', () => {
      const tool = getToolById('code_executor')
      expect(tool?.defaultEnabled).toBe(false)
    })

    it('should have terminal disabled by default', () => {
      const tool = getToolById('terminal')
      expect(tool?.defaultEnabled).toBe(false)
    })

    it('should have memory_write disabled by default', () => {
      const tool = getToolById('memory_write')
      expect(tool?.defaultEnabled).toBe(false)
    })
  })
})
