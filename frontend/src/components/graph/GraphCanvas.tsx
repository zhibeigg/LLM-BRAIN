import { useCallback, useMemo, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
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
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../../stores/graphStore'
import { useBrainStore } from '../../stores/brainStore'
import { useTaskStore } from '../../stores/taskStore'
import { MemoryNodeComponent } from './MemoryNodeComponent'
import { AnimatedEdge } from './AnimatedEdge'
import { ContextMenu } from './ContextMenu'

import { darkColors as c } from '../../theme'

const nodeTypes = {
  memoryNode: MemoryNodeComponent,
} as const

const edgeTypes = {
  animatedEdge: AnimatedEdge,
} as const

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

function ChineseControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <Controls
      position="bottom-left"
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      style={{ background: c.bgPanel, borderColor: c.border }}
    >
      <ControlButton onClick={() => zoomIn()} title="放大">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </ControlButton>
      <ControlButton onClick={() => zoomOut()} title="缩小">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </ControlButton>
      <ControlButton onClick={() => fitView({ padding: 0.5, maxZoom: 1 })} title="适应视图">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      </ControlButton>
    </Controls>
  )
}

export function GraphCanvas() {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    selectedNodeId,
    fetchGraph,
    selectNode,
    updateNodePosition,
    addNode,
    deleteNode,
    deleteEdge,
    addEdge: addStoreEdge,
  } = useGraphStore()

  const currentBrainId = useBrainStore((s) => s.currentBrainId)
  const activeEdgeIds = useTaskStore((s) => s.activeEdgeIds)
  const activeNodeId = useTaskStore((s) => s.activeNodeId)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_MENU_STATE)

  useEffect(() => {
    if (currentBrainId) {
      fetchGraph()
    }
  }, [currentBrainId, fetchGraph])

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
          active: activeEdgeIds.has(edge.id),
          thinkingContent: undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: activeEdgeIds.has(edge.id) ? c.primary : c.textMuted },
      })),
    [storeEdges, activeEdgeIds],
  )

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(initialRfNodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(initialRfEdges)

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

  const handlePaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

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

  return (
    <>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.5, maxZoom: 1 }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        minZoom={0.2}
        maxZoom={2}
        style={{ background: c.bg }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2d2e4a" gap={24} size={1} />
        <ChineseControls />
        <MiniMap
          position="bottom-right"
          style={{ background: c.bgPanel, width: 140, height: 100 }}
          nodeColor={(node) =>
            node.data?.type === 'personality' ? c.primary : c.secondary
          }
          maskColor="rgba(0,0,0,0.3)"
          nodeStrokeWidth={0}
          nodeBorderRadius={1}
          pannable
          zoomable={false}
        />
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
    </>
  )
}
