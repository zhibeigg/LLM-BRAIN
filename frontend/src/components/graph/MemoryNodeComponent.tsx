import { memo, useEffect, useState, useMemo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Box, Typography, Chip, IconButton } from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import type { MemoryNode } from '../../types'
import { useGraphStore } from '../../stores/graphStore'
import { useColors } from '../../ThemeContext'
import type { AppColors } from '../../theme'

type MemoryNodeData = MemoryNode & Record<string, unknown>

function getNodeColors(c: AppColors) {
  return {
    personality: { accent: c.primary, bg: `${c.primary}15` },
    memory: { accent: c.secondary, bg: `${c.secondary}15` },
  } as Record<string, { accent: string; bg: string }>
}

const HIGHLIGHT_DURATION = 8000

function MemoryNodeComponentInner(props: NodeProps) {
  const c = useColors()
  const nodeColors = getNodeColors(c)
  const NEW_NODE_COLOR = c.success
  const data = props.data as MemoryNodeData
  const selected = props.selected
  const active = (data as Record<string, unknown>).active === true
  const inPath = (data as Record<string, unknown>).inPath === true
  const colors = nodeColors[data.type] ?? nodeColors.memory

  const newNodeIds = useGraphStore((s) => s.newNodeIds)
  const dismissNewNode = useGraphStore((s) => s.dismissNewNode)
  const isNew = newNodeIds.has(data.id)
  const [highlighted, setHighlighted] = useState(isNew)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (!isNew) {
      setHighlighted(false)
      return
    }
    setHighlighted(true)
    const timer = setTimeout(() => {
      setHighlighted(false)
      useGraphStore.setState((state) => {
        const next = new Set(state.newNodeIds)
        next.delete(data.id)
        return { newNodeIds: next }
      })
    }, HIGHLIGHT_DURATION)
    return () => clearTimeout(timer)
  }, [isNew, data.id])

  const borderColor = highlighted
    ? NEW_NODE_COLOR
    : active
      ? colors.accent
      : inPath
        ? c.primary
        : selected
          ? colors.accent
          : c.border

  const bgColor = useMemo(() => {
    if (highlighted) return `${NEW_NODE_COLOR}18`
    if (active) return colors.bg
    if (inPath) return `${c.primary}10`
    if (selected) return `${colors.accent}10`
    return c.bgCard
  }, [highlighted, active, inPath, selected, colors, c.bgCard, c.primary])

  const handleStyle: React.CSSProperties = useMemo(() => ({
    width: 8,
    height: 8,
    background: c.textMuted,
    border: `1.5px solid ${c.bgPanel}`,
  }), [c.textMuted, c.bgPanel])

  // 计算阴影
  const shadowIntensity = useMemo(() => {
    if (highlighted) return `0 0 0 2px ${c.success}`
    if (active) return `0 0 0 2px ${colors.accent}, 0 0 12px ${colors.accent}40`
    if (inPath) return `0 0 0 1.5px ${c.primary}80`
    if (selected) return `0 0 0 2px ${c.primary}`
    if (isHovered) return `0 2px 8px ${c.shadow}, 0 0 0 1px ${colors.accent}`
    return `0 1px 3px ${c.shadow}, 0 0 0 1px ${c.border}`
  }, [highlighted, active, inPath, selected, isHovered, c, colors])

  // 悬停时的Y轴偏移
  const hoverTransform = isHovered && !highlighted ? 'translateY(-3px)' : 'translateY(0)'

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        position: 'relative',
        minWidth: 160,
        maxWidth: 240,
        borderRadius: '12px',
        background: bgColor,
        border: highlighted ? `2px solid ${c.success}` : `1.5px solid ${borderColor}`,
        padding: '10px 12px',
        boxShadow: shadowIntensity,
        transform: hoverTransform,
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'grab',
        // 活跃节点脉冲动画
        ...(active && {
          animation: 'leader-node-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          '@keyframes leader-node-pulse': {
            '0%, 100%': { boxShadow: `0 0 0 2px ${colors.accent}, 0 0 12px ${colors.accent}40` },
            '50%': { boxShadow: `0 0 0 3px ${colors.accent}, 0 0 20px ${colors.accent}60` },
          },
        }),
        // prefers-reduced-motion
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none !important',
          transition: 'none !important',
        },
        '&:hover': {
          boxShadow: `0 2px 8px ${c.shadow}, 0 0 0 1px ${borderColor}`,
        },
      }}
    >
      {/* 左侧类型渐变指示条 */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 8,
          bottom: 8,
          width: 4,
          borderRadius: '0 3px 3px 0',
          background: highlighted 
            ? `linear-gradient(180deg, ${NEW_NODE_COLOR}, ${NEW_NODE_COLOR}80)`
            : selected
              ? `linear-gradient(180deg, ${colors.accent}, ${colors.accent}80)`
              : `linear-gradient(180deg, ${colors.accent}dd, ${colors.accent}60)`,
          transition: 'background 0.3s ease',
        }}
      />

      {/* 右上角装饰点 */}
      <Box
        sx={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: highlighted 
            ? `${NEW_NODE_COLOR}80`
            : selected
              ? `${colors.accent}60`
              : `${c.textMuted}30`,
          transition: 'background 0.3s ease',
        }}
      />

      {/* 新节点删除按钮 */}
      {highlighted && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            dismissNewNode(data.id)
          }}
          sx={{
            position: 'absolute',
            top: -10,
            left: -10,
            width: 22,
            height: 22,
            bgcolor: c.error,
            color: c.textInverse,
            zIndex: 10,
            boxShadow: `0 2px 8px ${c.error}66`,
            '&:hover': { 
              bgcolor: c.errorHover,
              boxShadow: `0 4px 12px ${c.error}80`,
              transform: 'scale(1.1)',
            },
            transition: 'all 0.2s ease',
            padding: 0,
          }}
          aria-label="关闭提示"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}

      {/* 置信度 */}
      <Typography
        sx={{
          position: 'absolute',
          top: -8,
          right: 8,
          fontSize: 11,
          fontWeight: 700,
          color: highlighted ? NEW_NODE_COLOR : selected ? colors.accent : c.textMuted,
          bgcolor: c.bgCard,
          border: `1px solid ${highlighted ? `${NEW_NODE_COLOR}40` : selected ? `${colors.accent}40` : `${c.border}60`}`,
          borderRadius: '5px',
          px: 0.7,
          py: 0.2,
          lineHeight: '14px',
          boxShadow: 'none',
          transition: 'color 0.3s ease, border-color 0.3s ease',
        }}
      >
        {Math.round(data.confidence * 100)}%
      </Typography>

      {/* 标题 */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          color: c.text,
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 13,
          pr: 20,
          transition: 'color 0.3s ease',
        }}
      >
        {data.title}
      </Typography>

      {/* 类型标签 */}
      <Typography 
        sx={{ 
          fontSize: 11, 
          color: highlighted ? NEW_NODE_COLOR : selected ? colors.accent : c.textMuted, 
          mt: 0.3,
          fontWeight: 500,
          transition: 'color 0.3s ease',
        }}
      >
        {highlighted ? '✨ 新提取' : data.type === 'personality' ? '🎭 性格' : '💭 记忆'}
      </Typography>

      {/* 标签 */}
      {data.tags.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.6 }}>
          {data.tags.slice(0, 2).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                color: selected ? colors.accent : c.textMuted,
                bgcolor: selected ? `${colors.accent}12` : c.bgInput,
                border: `1px solid ${selected ? `${colors.accent}40` : c.border}`,
                '& .MuiChip-label': { px: 0.7 },
                transition: 'color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease',
                '&:hover': {
                  bgcolor: `${colors.accent}18`,
                  borderColor: `${colors.accent}60`,
                },
              }}
            />
          ))}
        </Box>
      )}

      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </Box>
  )
}

export const MemoryNodeComponent = memo(MemoryNodeComponentInner)
