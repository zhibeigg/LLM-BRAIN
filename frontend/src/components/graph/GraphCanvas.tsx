import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import { Box, Typography, Chip, IconButton } from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Viewport,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../../stores/graphStore'
import { useBrainStore } from '../../stores/brainStore'
import { useTaskStore } from '../../stores/taskStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { DIFFICULTY_TYPE_LABELS, type DifficultyType } from '../../types'
import { MemoryNodeComponent } from './MemoryNodeComponent'
import { AnimatedEdge } from './AnimatedEdge'
import { ContextMenu } from './ContextMenu'

import { useColors, useThemeMode } from '../../ThemeContext'
import { useResponsive } from '../../hooks/useResponsive'

const nodeTypes = {
  memoryNode: MemoryNodeComponent,
} as const

const edgeTypes = {
  animatedEdge: AnimatedEdge,
} as const

/** 视窗边距扩展系数，用于预渲染视窗周围的节点 */
const VIEWPORT_MARGIN = 0.5

/** 边聚合阈值：低于此缩放级别时启用边聚合 */
const EDGE_AGGRERATION_ZOOM_THRESHOLD = 0.4

interface ContextMenuState {
  open: boolean
  position: { x: number; y: number }
  targetType: 'canvas' | 'node' | 'edge'
  targetId?: string
}

const INITIAL_MENU_STATE: ContextMenuState = {
  open: false,
  position: { x: 0, y: 0 },
  targetType: 'canvas',
}

/**
 * 计算视窗内可见的节点
 * @param nodes 所有节点
 * @param viewport 当前视窗
 * @param containerBounds 容器尺寸
 * @returns 可见节点 ID 集合
 */
function computeVisibleNodeIds(
  nodes: Node[],
  viewport: Viewport,
  containerBounds: { width: number; height: number }
): Set<string> {
  const { x, y, zoom } = viewport
  const { width, height } = containerBounds

  // 计算视窗边界（考虑边距扩展）
  const marginX = width * VIEWPORT_MARGIN
  const marginY = height * VIEWPORT_MARGIN

  const viewLeft = -x / zoom - marginX
  const viewTop = -y / zoom - marginY
  const viewRight = (-x + width) / zoom + marginX
  const viewBottom = (-y + height) / zoom + marginY

  const visibleIds = new Set<string>()

  for (const node of nodes) {
    const nodeX = node.position.x
    const nodeY = node.position.y
    const nodeWidth = (node.measured?.width ?? node.width ?? 180) as number
    const nodeHeight = (node.measured?.height ?? node.height ?? 80) as number

    // 检查节点是否在视窗边界内
    if (
      nodeX + nodeWidth >= viewLeft &&
      nodeX <= viewRight &&
      nodeY + nodeHeight >= viewTop &&
      nodeY <= viewBottom
    ) {
      visibleIds.add(node.id)
    }
  }

  return visibleIds
}

/**
 * 基于缩放级别聚合边
 * @param edges 所有边
 * @param nodes 所有节点
 * @param zoom 当前缩放级别
 * @param visibleNodeIds 可见节点 ID
 * @returns 聚合后的边
 */
function aggregateEdges(
  edges: Edge[],
  nodes: Node[],
  zoom: number,
  visibleNodeIds: Set<string>
): Edge[] {
  // 高缩放级别时显示所有边
  if (zoom >= EDGE_AGGRERATION_ZOOM_THRESHOLD) {
    return edges
  }

  // 低于阈值时进行边聚合
  const aggregationZoomFactor = 1 - (EDGE_AGGRERATION_ZOOM_THRESHOLD - zoom) / EDGE_AGGRERATION_ZOOM_THRESHOLD

  // 只保留连接到可见节点的边
  const filteredEdges = edges.filter(e => visibleNodeIds.has(e.source) || visibleNodeIds.has(e.target))

  // 在低缩放下，将边聚合为超级边
  if (aggregationZoomFactor < 0.5) {
    // 创建聚合边
    const aggregatedEdges: Edge[] = []
    const processedPairs = new Set<string>()

    for (const edge of filteredEdges) {
      const pairKey = `${edge.source}::${edge.target}`
      if (processedPairs.has(pairKey)) continue
      processedPairs.add(pairKey)

      // 找到所有从 source 到 target 的边
      const parallelEdges = filteredEdges.filter(
        e => e.source === edge.source && e.target === edge.target
      )

      // 如果有多条并行边，创建一个聚合边（至少3条边才聚合）
      if (parallelEdges.length >= 3) {
        const avgDifficulty = parallelEdges.reduce((sum, e) => {
          const difficulty = e.data?.baseDifficulty ?? 0.5
          return sum + difficulty
        }, 0) / parallelEdges.length

        aggregatedEdges.push({
          id: `aggregated-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          type: 'animatedEdge',
          data: {
            ...edge.data,
            baseDifficulty: avgDifficulty,
            perceivedDifficulty: avgDifficulty,
            aggregated: true,
            aggregatedCount: parallelEdges.length,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: edge.markerEnd?.color ?? '#999' },
          label: `${parallelEdges.length} 条边`,
          labelStyle: { fontSize: 10, fill: '#666' },
          style: { strokeDasharray: '5,5' },
        })
      } else {
        // 保留原始边
        aggregatedEdges.push(edge)
      }
    }

    return aggregatedEdges
  }

  return filteredEdges
}

/**
 * Hook: 视窗感知节点过滤
 * 只渲染当前视窗内可见的节点，减少大规模图谱的 DOM 节点数量
 */
function useViewportNodes(
  nodes: Node[],
  containerBounds: { width: number; height: number }
) {
  const { getViewport } = useReactFlow()
  const [viewport, setViewport] = useState<Viewport>(() => getViewport())

  // 监听视窗变化
  const onMoveEnd = useCallback(
    (_: unknown, vp: Viewport) => {
      setViewport(vp)
    },
    []
  )

  // 计算可见节点
  const visibleNodeIds = useMemo(
    () => computeVisibleNodeIds(nodes, viewport, containerBounds),
    [nodes, viewport, containerBounds]
  )

  // 过滤后的节点
  const visibleNodes = useMemo(
    () => nodes.filter(n => visibleNodeIds.has(n.id)),
    [nodes, visibleNodeIds]
  )

  return {
    visibleNodes,
    visibleNodeIds,
    allNodes: nodes,
    viewport,
    onMoveEnd,
  }
}

/**
 * Hook: 基于缩放级别的边聚合
 * 在低缩放级别时聚合边，减少边的渲染数量
 */
function useAggregatedEdges(
  edges: Edge[],
  nodes: Node[],
  visibleNodeIds: Set<string>,
  zoom: number
) {
  const aggregatedEdges = useMemo(
    () => aggregateEdges(edges, nodes, zoom, visibleNodeIds),
    [edges, nodes, zoom, visibleNodeIds]
  )

  return {
    aggregatedEdges,
    isAggregated: zoom < EDGE_AGGRERATION_ZOOM_THRESHOLD,
  }
}

interface ChineseControlsProps {
  onAutoLayout: () => void
  isLayouting: boolean
  isMobile?: boolean
}

function ChineseControls({ onAutoLayout, isLayouting, isMobile }: ChineseControlsProps) {
  const c = useColors()
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  // 移动端使用更大的按钮
  const buttonSize = isMobile ? 44 : 32

  return (
    <Controls
      position={isMobile ? "bottom-center" : "bottom-left"}
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      style={{
        background: c.bgPanel,
        borderColor: c.border,
        gap: isMobile ? 8 : 4,
      }}
    >
      <ControlButton
        onClick={() => zoomIn()}
        title="放大"
        style={{ width: buttonSize, height: buttonSize }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={isMobile ? 20 : 16} height={isMobile ? 20 : 16}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </ControlButton>
      <ControlButton
        onClick={() => zoomOut()}
        title="缩小"
        style={{ width: buttonSize, height: buttonSize }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={isMobile ? 20 : 16} height={isMobile ? 20 : 16}><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </ControlButton>
      <ControlButton
        onClick={() => fitView({ padding: 0.5, maxZoom: 1 })}
        title="适应视图"
        style={{ width: buttonSize, height: buttonSize }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={isMobile ? 20 : 16} height={isMobile ? 20 : 16}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      </ControlButton>
      <ControlButton
        onClick={onAutoLayout}
        title={isLayouting ? '布局计算中...' : '自动布局'}
        disabled={isLayouting}
        style={{ width: buttonSize, height: buttonSize }}
      >
        {isLayouting ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={isMobile ? 20 : 16} height={isMobile ? 20 : 16} style={{ animation: 'spin 1s linear infinite' }}>
            <circle cx="12" cy="12" r="10" strokeDasharray="30 60" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={isMobile ? 20 : 16} height={isMobile ? 20 : 16}>
            <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>
            <line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/>
            <line x1="15.5" y1="8.5" x2="8.5" y2="15.5"/>
          </svg>
        )}
      </ControlButton>
    </Controls>
  )
}

/** 难度值 → 颜色（与 theme.ts 中的 diffEasy/diffMedium/diffHard 对应） */
function diffColor(d: number): string {
  if (d < 0.3) return '#4ADE80'   // diffEasy
  if (d < 0.6) return '#FBBF24'   // diffMedium
  return '#EF4444'                 // diffHard
}

function EdgeInfoPanel() {
  const c = useColors()
  const { mode } = useThemeMode()
  const isDark = mode === 'dark'
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId)
  const edges = useGraphStore((s) => s.edges)
  const nodes = useGraphStore((s) => s.nodes)
  const selectEdge = useGraphStore((s) => s.selectEdge)

  const edge = edges.find(e => e.id === selectedEdgeId)
  if (!edge) return null

  const sourceNode = nodes.find(n => n.id === edge.sourceId)
  const targetNode = nodes.find(n => n.id === edge.targetId)
  const perceived = edge.perceivedDifficulty ?? edge.baseDifficulty

  return (
    <Box sx={{
      position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
      width: 360, maxWidth: 'calc(100% - 24px)',
      borderRadius: '10px', overflow: 'hidden', zIndex: 10,
      bgcolor: isDark ? c.bgCard : '#FFFFFF',
      border: `1px solid ${c.border}`,
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)',
    }}>
      {/* 标题栏 */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1.5, py: 1,
        bgcolor: isDark ? c.bgInput : c.bgHover,
        borderBottom: `1px solid ${c.border}`,
      }}>
        <Typography sx={{ fontSize: 12, color: c.textSecondary, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sourceNode?.title ?? edge.sourceId.slice(0, 6)}
          <span style={{ color: c.textMuted, margin: '0 6px' }}>→</span>
          {targetNode?.title ?? edge.targetId.slice(0, 6)}
        </Typography>
        <IconButton size="small" onClick={() => selectEdge(null)} sx={{ p: 0.25, color: c.textMuted }} aria-label="关闭">
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* 内容 */}
      <Box sx={{ px: 1.5, py: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* 难度条 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 11, color: c.textMuted, width: 56, flexShrink: 0 }}>基础难度</Typography>
          <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: c.border, overflow: 'hidden' }}>
            <Box sx={{ width: `${edge.baseDifficulty * 100}%`, height: '100%', borderRadius: 3, bgcolor: diffColor(edge.baseDifficulty), transition: 'width 0.3s' }} />
          </Box>
          <Typography sx={{ fontSize: 11, color: diffColor(edge.baseDifficulty), fontWeight: 600, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {(edge.baseDifficulty * 100).toFixed(0)}%
          </Typography>
        </Box>

        {perceived !== edge.baseDifficulty && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 11, color: c.textMuted, width: 56, flexShrink: 0 }}>感知难度</Typography>
            <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: c.border, overflow: 'hidden' }}>
              <Box sx={{ width: `${perceived * 100}%`, height: '100%', borderRadius: 3, bgcolor: diffColor(perceived), transition: 'width 0.3s' }} />
            </Box>
            <Typography sx={{ fontSize: 11, color: diffColor(perceived), fontWeight: 600, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {(perceived * 100).toFixed(0)}%
            </Typography>
          </Box>
        )}

        {/* 难度类型 */}
        {edge.difficultyTypes.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 11, color: c.textMuted, mr: 0.5 }}>类型</Typography>
            {edge.difficultyTypes.map(dt => {
              const weight = edge.difficultyTypeWeights[dt]
              return (
                <Chip
                  key={dt}
                  label={`${DIFFICULTY_TYPE_LABELS[dt as DifficultyType] ?? dt}${weight != null ? ` ${(weight * 100).toFixed(0)}%` : ''}`}
                  size="small"
                  sx={{
                    height: 20, fontSize: 10,
                    bgcolor: `${diffColor(edge.baseDifficulty)}15`,
                    color: diffColor(edge.baseDifficulty),
                    border: `1px solid ${diffColor(edge.baseDifficulty)}30`,
                  }}
                />
              )
            })}
          </Box>
        )}

        {/* 统计信息 */}
        <Box sx={{ display: 'flex', gap: 2, pt: 0.25 }}>
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>
            使用 <span style={{ color: c.text, fontWeight: 500 }}>{edge.usageCount}</span> 次
          </Typography>
          {edge.lastUsedAt && (
            <Typography sx={{ fontSize: 11, color: c.textMuted }}>
              最近 <span style={{ color: c.text, fontWeight: 500 }}>{new Date(edge.lastUsedAt).toLocaleDateString()}</span>
            </Typography>
          )}
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>
            创建 <span style={{ color: c.text, fontWeight: 500 }}>{new Date(edge.createdAt).toLocaleDateString()}</span>
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

function GraphCanvasInner() {
  const c = useColors()
  const { mode } = useThemeMode()
  const { isMobile } = useResponsive()
  const {
    nodes: storeNodes,
    edges: storeEdges,
    selectedNodeId,
    selectedEdgeId,
    fetchGraph,
    selectNode,
    selectEdge,
    updateNodePosition,
    addNode,
    deleteNode,
    deleteEdge,
    addEdge: addStoreEdge,
    autoLayout,
    isLayouting,
    layoutProgress,
  } = useGraphStore()

  const currentBrainId = useBrainStore((s) => s.currentBrainId)
  const activeEdgeIds = useTaskStore((s) => s.activeEdgeIds)
  const activeNodeId = useTaskStore((s) => s.activeNodeId)
  const showMinimap = useSettingsStore((s) => s.showMinimap)
  const graphSnapToGrid = useSettingsStore((s) => s.graphSnapToGrid)
  const graphAnimateEdges = useSettingsStore((s) => s.graphAnimateEdges)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_MENU_STATE)

  // 容器尺寸引用，用于视窗计算
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerBounds, setContainerBounds] = useState({ width: 800, height: 600 })

  useEffect(() => {
    if (currentBrainId) {
      fetchGraph()
    }
  }, [currentBrainId, fetchGraph])

  // 更新容器尺寸
  useEffect(() => {
    const updateBounds = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerBounds({ width: rect.width, height: rect.height })
      }
    }

    updateBounds()
    window.addEventListener('resize', updateBounds)
    return () => window.removeEventListener('resize', updateBounds)
  }, [])

  const initialRfNodes = useMemo<Node[]>(
    () =>
      storeNodes.map((node) => ({
        id: node.id,
        type: 'memoryNode' as const,
        position: { x: node.positionX, y: node.positionY },
        data: { ...node, active: node.id === activeNodeId },
        selected: node.id === selectedNodeId,
      })),
    [storeNodes, selectedNodeId, activeNodeId],
  )

  const initialRfEdges = useMemo<Edge[]>(
    () =>
      storeEdges.map((edge) => ({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        type: 'animatedEdge' as const,
        data: {
          perceivedDifficulty: edge.perceivedDifficulty ?? edge.baseDifficulty,
          baseDifficulty: edge.baseDifficulty,
          difficultyTypes: edge.difficultyTypes,
          difficultyTypeWeights: edge.difficultyTypeWeights,
          active: activeEdgeIds.has(edge.id),
          animate: graphAnimateEdges,
          thinkingContent: undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: activeEdgeIds.has(edge.id) ? c.primary : c.textMuted },
      })),
    [storeEdges, activeEdgeIds, graphAnimateEdges, c.primary, c.textMuted],
  )

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(initialRfNodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(initialRfEdges)

  // 使用视窗感知 hook
  const { visibleNodes, visibleNodeIds, viewport, onMoveEnd } = useViewportNodes(
    rfNodes,
    containerBounds
  )

  // 使用边聚合 hook
  const { aggregatedEdges, isAggregated } = useAggregatedEdges(
    rfEdges,
    rfNodes,
    visibleNodeIds,
    viewport.zoom
  )

  // 更新节点时保持位置同步
  useEffect(() => {
    setRfNodes(initialRfNodes)
  }, [initialRfNodes, setRfNodes])

  useEffect(() => {
    setRfEdges(initialRfEdges)
  }, [initialRfEdges, setRfEdges])

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNodePosition(change.id, change.position.x, change.position.y)
        }
      }
    },
    [onNodesChange, updateNodePosition],
  )

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes)
    },
    [onEdgesChange],
  )

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source && connection.target) {
        addStoreEdge({
          sourceId: connection.source,
          targetId: connection.target,
          baseDifficulty: 0.5,
          difficultyTypes: [],
          difficultyTypeWeights: {},
        })
      }
    },
    [addStoreEdge],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
    },
    [selectNode],
  )

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      selectEdge(edge.id === selectedEdgeId ? null : edge.id)
    },
    [selectEdge, selectedEdgeId],
  )

  const handlePaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
  }, [selectNode, selectEdge])

  const closeContextMenu = useCallback(() => {
    setContextMenu(INITIAL_MENU_STATE)
  }, [])

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      open: true,
      position: { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY },
      targetType: 'canvas',
    })
  }, [])

  const handleNodeContextMenu = useCallback((_: React.MouseEvent, node: Node) => {
    _.preventDefault()
    setContextMenu({
      open: true,
      position: { x: _.clientX, y: _.clientY },
      targetType: 'node',
      targetId: node.id,
    })
  }, [])

  const handleEdgeContextMenu = useCallback((_: React.MouseEvent, edge: Edge) => {
    _.preventDefault()
    setContextMenu({
      open: true,
      position: { x: _.clientX, y: _.clientY },
      targetType: 'edge',
      targetId: edge.id,
    })
  }, [])

  const handleAddNode = useCallback(
    async (type: 'personality' | 'memory', position: { x: number; y: number }) => {
      await addNode({
        type,
        title: type === 'memory' ? '新记忆节点' : '新性格节点',
        content: '',
        tags: [],
        confidence: 0.5,
        positionX: position.x,
        positionY: position.y,
      })
    },
    [addNode],
  )

  const handleDeleteNode = useCallback(
    async (id: string) => {
      await deleteNode(id)
    },
    [deleteNode],
  )

  const handleDeleteEdge = useCallback(
    async (id: string) => {
      await deleteEdge(id)
    },
    [deleteEdge],
  )

  const handleEditNode = useCallback(
    (id: string) => {
      selectNode(id)
    },
    [selectNode],
  )

  const handleAutoLayout = useCallback(
    async () => {
      try {
        await autoLayout({ useWorker: true })
      } catch (e) {
        console.error('自动布局失败:', e)
      }
    },
    [autoLayout],
  )

  return (
    <>
      <ReactFlow
        ref={containerRef}
        nodes={visibleNodes}
        edges={aggregatedEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onMoveEnd={onMoveEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.5, maxZoom: 1 }}
        defaultViewport={{ x: 0, y: 0, zoom: isMobile ? 0.6 : 0.8 }}
        minZoom={0.2}
        maxZoom={2}
        // 移动端触摸缩放
        zoomOnPinch={true}
        panOnScroll={!isMobile}
        // 移动端拖拽
        draggable={!isMobile}
        // 移动端双击缩放
        zoomOnDoubleClick={!isMobile}
        snapToGrid={graphSnapToGrid}
        snapGrid={[20, 20]}
        style={{ background: c.bg }}
        proOptions={{ hideAttribution: true }}
        // 虚拟化优化配置
        onlyRenderVisibleElements={true}
        // 节点Extent限制，优化边界计算
        nodeExtent={[
          [-5000, -5000],
          [5000, 5000],
        ]}
      >
        <Background
          color={graphSnapToGrid
            ? (mode === 'dark' ? '#3a3d41' : '#C6C6CC')
            : (mode === 'dark' ? '#26282b' : '#D1D1D6')
          }
          gap={graphSnapToGrid ? 20 : 24}
          size={graphSnapToGrid ? 1 : 1}
          variant={graphSnapToGrid ? BackgroundVariant.Lines : BackgroundVariant.Dots}
        />
        <ChineseControls onAutoLayout={handleAutoLayout} isLayouting={isLayouting} isMobile={isMobile} />
        {/* 视窗状态指示器 */}
        <Box
          sx={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: isLayouting 
              ? `${c.primary}33` 
              : isAggregated 
                ? `${c.warning}26` 
                : 'rgba(0,0,0,0.3)',
            color: isLayouting ? c.primary : isAggregated ? c.warning : '#999',
            fontSize: 10,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            display: 'flex',
            gap: 1,
          }}
        >
          <span>{visibleNodes.length}/{rfNodes.length}</span>
          {isLayouting && <span style={{ color: c.primary }}>布局 {Math.round(layoutProgress * 100)}%</span>}
          {isAggregated && <span style={{ color: c.warning }}>聚合</span>}
        </Box>
        {showMinimap && (
          <MiniMap
            position="bottom-right"
            style={{ background: c.bgPanel, width: 140, height: 100 }}
            nodeColor={(node) =>
              node.data?.type === 'personality' ? c.primary : c.secondary
            }
            maskColor={mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}
            nodeStrokeWidth={0}
            nodeBorderRadius={1}
            pannable
            zoomable={false}
          />
        )}
      </ReactFlow>

      <ContextMenu
        open={contextMenu.open}
        position={contextMenu.position}
        targetType={contextMenu.targetType}
        targetId={contextMenu.targetId}
        onClose={closeContextMenu}
        onAddNode={handleAddNode}
        onDeleteNode={handleDeleteNode}
        onDeleteEdge={handleDeleteEdge}
        onEditNode={handleEditNode}
      />

      <EdgeInfoPanel />
    </>
  )
}

export function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner />
    </ReactFlowProvider>
  )
}
