import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

interface AnimatedEdgeData {
  perceivedDifficulty: number
  baseDifficulty: number
  difficultyTypes: string[]
  active: boolean
  animate?: boolean
  thinkingContent?: string
  [key: string]: unknown
}

/** 难度 0~1 映射到颜色：绿 → 橙 → 红 */
function difficultyColor(d: number): string {
  const clamped = Math.max(0, Math.min(1, d))
  if (clamped < 0.5) {
    const t = clamped / 0.5
    const r = Math.round(56 + (221 - 56) * t)
    const g = Math.round(161 + (107 - 161) * t)
    const b = Math.round(105 + (32 - 105) * t)
    return `rgb(${r},${g},${b})`
  }
  const t = (clamped - 0.5) / 0.5
  const r = Math.round(221 + (229 - 221) * t)
  const g = Math.round(107 * (1 - t) + 62 * t)
  const b = Math.round(32 + (62 - 32) * t)
  return `rgb(${r},${g},${b})`
}

/** 难度 0~1 映射到线宽 1.5~4 */
function difficultyWidth(d: number): number {
  return 1.5 + Math.max(0, Math.min(1, d)) * 2.5
}

function AnimatedEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
  } = props
  const data = (props.data || {}) as AnimatedEdgeData
  const difficulty = data.perceivedDifficulty ?? data.baseDifficulty ?? 0.5
  const active = data.active ?? false
  const animate = data.animate !== false

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const color = difficultyColor(difficulty)
  const strokeWidth = difficultyWidth(difficulty)

  const titleText = data.thinkingContent
    ? data.thinkingContent
    : `难度: ${(difficulty * 100).toFixed(0)}% | 类型: ${data.difficultyTypes?.join(', ') ?? '-'}`

  return (
    <g className="react-flow__edge-animated-edge">
      <title>{titleText}</title>

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth,
          transition: 'stroke 0.3s, stroke-width 0.3s',
        }}
      />

      {/* 活跃时的流动粒子 */}
      {active && animate && (
        <>
          <defs>
            <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle r="4" fill="#E8613A" filter={`url(#glow-${id})`}>
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="2.5" fill="#FFFFFF" opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}
    </g>
  )
}

export const AnimatedEdge = memo(AnimatedEdgeInner)
