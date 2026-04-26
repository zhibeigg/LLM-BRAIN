import { memo, useId } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useColors } from '../../ThemeContext'

interface AnimatedEdgeData {
  perceivedDifficulty: number
  baseDifficulty: number
  difficultyTypes: string[]
  active: boolean
  inPath?: boolean
  animate?: boolean
  thinkingContent?: string
  [key: string]: unknown
}

/** 难度 0~1 映射到颜色：绿 → 橙 → 红 */
function difficultyColor(d: number): string {
  const safeDifficulty = Number.isFinite(d) ? d : 0.5
  const clamped = Math.max(0, Math.min(1, safeDifficulty))
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
  const safeDifficulty = Number.isFinite(d) ? d : 0.5
  return 1.5 + Math.max(0, Math.min(1, safeDifficulty)) * 2.5
}

function AnimatedEdgeInner(props: EdgeProps) {
  const c = useColors()
  const uniqueId = useId()
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
  const inPath = data.inPath ?? false
  const animate = data.animate !== false

  if (![sourceX, sourceY, targetX, targetY].every(Number.isFinite)) {
    return null
  }

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const baseColor = difficultyColor(difficulty)
  const baseWidth = difficultyWidth(difficulty)

  // 路径中的边使用主题色高亮 + 加粗
  const isHighlighted = active || inPath
  const color = isHighlighted ? c.primary : baseColor
  const strokeWidth = isHighlighted ? Math.max(baseWidth, 3) : baseWidth

  const titleText = data.thinkingContent
    ? data.thinkingContent
    : `难度: ${(difficulty * 100).toFixed(0)}% | 类型: ${data.difficultyTypes?.join(', ') ?? '-'}`

  const glowId = `glow-${uniqueId}`
  const pathGlowId = `path-glow-${uniqueId}`

  return (
    <g className="react-flow__edge-animated-edge">
      <title>{titleText}</title>

      {/* 路径边的底层发光 */}
      {inPath && (
        <>
          <defs>
            <filter id={pathGlowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={edgePath}
            fill="none"
            stroke={c.primary}
            strokeWidth={strokeWidth + 4}
            strokeOpacity={0.15}
            filter={`url(#${pathGlowId})`}
            style={{ transition: 'stroke-opacity 0.3s' }}
          />
        </>
      )}

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

      {/* 路径边的流入动画：stroke-dashoffset 从满到0 */}
      {inPath && !active && animate && (
        <path
          d={edgePath}
          fill="none"
          stroke={c.primary}
          strokeWidth={strokeWidth}
          strokeOpacity={0.4}
          strokeDasharray="8 4"
          style={{
            animation: 'leader-path-flow 1.5s linear infinite',
          }}
        />
      )}

      {/* 活跃时的流动粒子 */}
      {active && animate && (
        <>
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle r="5" fill={c.primary} filter={`url(#${glowId})`}>
            <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="3" fill={c.textInverse} opacity="0.9">
            <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}
    </g>
  )
}

export const AnimatedEdge = memo(AnimatedEdgeInner)
