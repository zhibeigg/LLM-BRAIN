import { describe, it, expect } from 'vitest'
import { sugiyamaLayout, type LayoutNode, type LayoutEdge, type LayoutOptions } from './layout.js'

describe('layout', () => {
  describe('sugiyamaLayout', () => {
    it('should return empty map for empty nodes', () => {
      const positions = sugiyamaLayout([], [])
      expect(positions.size).toBe(0)
    })

    it('should handle single node', () => {
      const nodes: LayoutNode[] = [{ id: 'n1', positionX: 0, positionY: 0 }]
      const edges: LayoutEdge[] = []

      const positions = sugiyamaLayout(nodes, edges)

      expect(positions.size).toBe(1)
      expect(positions.get('n1')).toBeDefined()
    })

    it('should place single node at origin', () => {
      const nodes: LayoutNode[] = [{ id: 'n1', positionX: 0, positionY: 0 }]
      const positions = sugiyamaLayout(nodes, [], { originX: 100, originY: 200 })

      expect(positions.get('n1')).toEqual({ x: 100, y: 200 })
    })

    it('should layout linear chain correctly', () => {
      const nodes: LayoutNode[] = [
        { id: 'n1', positionX: 0, positionY: 0 },
        { id: 'n2', positionX: 0, positionY: 0 },
        { id: 'n3', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = [
        { sourceId: 'n1', targetId: 'n2' },
        { sourceId: 'n2', targetId: 'n3' },
      ]

      const positions = sugiyamaLayout(nodes, edges, { layerGapX: 300, nodeGapY: 100 })

      // n1 should be in layer 0
      const n1Pos = positions.get('n1')!
      expect(n1Pos.x).toBe(100) // originX

      // n2 should be in layer 1
      const n2Pos = positions.get('n2')!
      expect(n2Pos.x).toBe(400) // originX + layerGapX

      // n3 should be in layer 2
      const n3Pos = positions.get('n3')!
      expect(n3Pos.x).toBe(700) // originX + 2 * layerGapX

      // All nodes should have Y positions (may or may not be same within a layer for disconnected nodes)
      expect(typeof n1Pos.y).toBe('number')
      expect(typeof n2Pos.y).toBe('number')
      expect(typeof n3Pos.y).toBe('number')
    })

    it('should handle diamond graph', () => {
      const nodes: LayoutNode[] = [
        { id: 'top', positionX: 0, positionY: 0 },
        { id: 'left', positionX: 0, positionY: 0 },
        { id: 'right', positionX: 0, positionY: 0 },
        { id: 'bottom', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = [
        { sourceId: 'top', targetId: 'left' },
        { sourceId: 'top', targetId: 'right' },
        { sourceId: 'left', targetId: 'bottom' },
        { sourceId: 'right', targetId: 'bottom' },
      ]

      const positions = sugiyamaLayout(nodes, edges, { layerGapX: 300, nodeGapY: 100 })

      // top should be in layer 0
      expect(positions.get('top')!.x).toBe(100)

      // left and right should be in layer 1
      expect(positions.get('left')!.x).toBe(400)
      expect(positions.get('right')!.x).toBe(400)

      // bottom should be in layer 2
      expect(positions.get('bottom')!.x).toBe(700)

      // left and right should have different Y positions
      expect(positions.get('left')!.y).not.toBe(positions.get('right')!.y)
    })

    it('should handle multiple roots', () => {
      const nodes: LayoutNode[] = [
        { id: 'a', positionX: 0, positionY: 0 },
        { id: 'b', positionX: 0, positionY: 0 },
        { id: 'c', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = []

      const positions = sugiyamaLayout(nodes, edges)

      // All nodes should be in layer 0
      expect(positions.get('a')!.x).toBe(100)
      expect(positions.get('b')!.x).toBe(100)
      expect(positions.get('c')!.x).toBe(100)
    })

    it('should handle disconnected nodes', () => {
      const nodes: LayoutNode[] = [
        { id: 'a', positionX: 0, positionY: 0 },
        { id: 'b', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = []

      const positions = sugiyamaLayout(nodes, edges)

      expect(positions.size).toBe(2)
    })

    it('should use custom layer gap', () => {
      const nodes: LayoutNode[] = [
        { id: 'n1', positionX: 0, positionY: 0 },
        { id: 'n2', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = [{ sourceId: 'n1', targetId: 'n2' }]

      const positions = sugiyamaLayout(nodes, edges, { layerGapX: 500 })

      expect(positions.get('n1')!.x).toBe(100)
      expect(positions.get('n2')!.x).toBe(600) // 100 + 500
    })

    it('should use custom node gap', () => {
      const nodes: LayoutNode[] = [
        { id: 'n1', positionX: 0, positionY: 0 },
        { id: 'n2', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = []

      const positions = sugiyamaLayout(nodes, edges, { nodeGapY: 200, originY: 100 })

      // Nodes should be centered around originY
      const n1Y = positions.get('n1')!.y
      const n2Y = positions.get('n2')!.y
      expect(n2Y - n1Y).toBe(200)
    })

    it('should handle nodes without edges', () => {
      const nodes: LayoutNode[] = [
        { id: 'isolated', positionX: 0, positionY: 0 },
        { id: 'root', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = [{ sourceId: 'root', targetId: 'isolated' }]

      const positions = sugiyamaLayout(nodes, edges)

      expect(positions.size).toBe(2)
      expect(positions.has('isolated')).toBe(true)
      expect(positions.has('root')).toBe(true)
    })

    it('should ignore edges with non-existent nodes', () => {
      const nodes: LayoutNode[] = [
        { id: 'n1', positionX: 0, positionY: 0 },
        { id: 'n2', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = [
        { sourceId: 'n1', targetId: 'n2' },
        { sourceId: 'n1', targetId: 'nonexistent' },
      ]

      const positions = sugiyamaLayout(nodes, edges)

      expect(positions.size).toBe(2)
    })

    it('should handle complex DAG with multiple layers', () => {
      const nodes: LayoutNode[] = [
        { id: 'L0_a', positionX: 0, positionY: 0 },
        { id: 'L0_b', positionX: 0, positionY: 0 },
        { id: 'L1_a', positionX: 0, positionY: 0 },
        { id: 'L1_b', positionX: 0, positionY: 0 },
        { id: 'L1_c', positionX: 0, positionY: 0 },
        { id: 'L2_a', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = [
        { sourceId: 'L0_a', targetId: 'L1_a' },
        { sourceId: 'L0_a', targetId: 'L1_b' },
        { sourceId: 'L0_b', targetId: 'L1_b' },
        { sourceId: 'L0_b', targetId: 'L1_c' },
        { sourceId: 'L1_a', targetId: 'L2_a' },
        { sourceId: 'L1_b', targetId: 'L2_a' },
        { sourceId: 'L1_c', targetId: 'L2_a' },
      ]

      const positions = sugiyamaLayout(nodes, edges)

      // Check layer 0 nodes
      expect(positions.get('L0_a')!.x).toBeLessThan(positions.get('L1_a')!.x)
      expect(positions.get('L0_b')!.x).toBeLessThan(positions.get('L1_a')!.x)

      // Check layer 2 nodes
      expect(positions.get('L2_a')!.x).toBeGreaterThan(positions.get('L1_a')!.x)
    })

    it('should center nodes vertically within their layer', () => {
      const nodes: LayoutNode[] = [
        { id: 'a', positionX: 0, positionY: 0 },
        { id: 'b', positionX: 0, positionY: 0 },
        { id: 'c', positionX: 0, positionY: 0 },
        { id: 'd', positionX: 0, positionY: 0 },
      ]
      const edges: LayoutEdge[] = [{ sourceId: 'a', targetId: 'b' }]

      const positions = sugiyamaLayout(nodes, edges, {
        originY: 400,
        nodeGapY: 100
      })

      // Nodes without edges should be in layer 0, centered around originY
      const layer0Nodes = ['a', 'c', 'd']
      const ys = layer0Nodes.map(id => positions.get(id)!.y)

      // Should span from 400 - 1.5*100 = 250 to 400 + 1.5*100 = 550
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(250)
      expect(Math.max(...ys)).toBeLessThanOrEqual(550)
    })
  })
})
