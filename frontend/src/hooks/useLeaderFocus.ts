import { useEffect, useRef } from 'react'
import { useReactFlow, type Node } from '@xyflow/react'
import { useTaskExecutionStore } from '../stores/taskStore'
import { useSettingsStore } from '../stores/settingsStore'

/** Leader 聚焦的最小缩放级别 */
const MIN_FOCUS_ZOOM = 0.65
/** Leader 聚焦的默认缩放级别（当前 zoom 低于最小值时使用） */
const DEFAULT_FOCUS_ZOOM = 0.85

/**
 * Leader 路径选择时自动聚焦到当前活跃节点。
 * 当 activeNodeId 变化时，平滑平移缩放视窗到该节点中心。
 * 如果用户已经放大到足够级别，保持当前 zoom 不变，只做平移。
 */
export function useLeaderFocus(rfNodes: Node[]) {
  const { setCenter, getZoom } = useReactFlow()
  const activeNodeId = useTaskExecutionStore((s) => s.activeNodeId)
  const isRunning = useTaskExecutionStore((s) => s.isRunning)
  const isLearning = useTaskExecutionStore((s) => s.isLearning)
  const autoFocus = useSettingsStore((s) => s.graphAutoFocusLeader)

  // 用 ref 追踪上一次聚焦的节点，避免重复触发
  const prevNodeIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!autoFocus) return
    if (!activeNodeId) return
    if (!(isRunning || isLearning)) return
    if (activeNodeId === prevNodeIdRef.current) return

    prevNodeIdRef.current = activeNodeId

    // 找到目标节点的位置
    const targetNode = rfNodes.find((n) => n.id === activeNodeId)
    if (!targetNode) return

    const nodeWidth = (targetNode.measured?.width ?? targetNode.width ?? 180) as number
    const nodeHeight = (targetNode.measured?.height ?? targetNode.height ?? 80) as number
    const centerX = targetNode.position.x + nodeWidth / 2
    const centerY = targetNode.position.y + nodeHeight / 2

    // 保持用户当前 zoom（如果已经足够大），否则使用默认值
    const currentZoom = getZoom()
    const targetZoom = currentZoom >= MIN_FOCUS_ZOOM ? currentZoom : DEFAULT_FOCUS_ZOOM

    // 平滑过渡到目标节点
    setCenter(centerX, centerY, {
      zoom: targetZoom,
      duration: 600,
    })
  }, [activeNodeId, rfNodes, setCenter, getZoom, autoFocus, isRunning, isLearning])

  // 任务结束时重置 ref
  useEffect(() => {
    if (!isRunning && !isLearning) {
      prevNodeIdRef.current = null
    }
  }, [isRunning, isLearning])
}
