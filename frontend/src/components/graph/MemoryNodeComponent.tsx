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
      : selected
        ? colors.accent
        : c.border

  const bgColor = useMemo(() => {
    if (highlighted) return `${NEW_NODE_COLOR}18`
    if (active) return colors.bg
    if (selected) return `${colors.accent}10`
    return `${c.bgCard}cc`
  }, [highlighted, active, selected, colors, c.bgCard])

  const handleStyle: React.CSSProperties = useMemo(() => ({
    width: 8,
    height: 8,
    background: c.textMuted,
    border: `1.5px solid ${c.bgPanel}`,
  }), [c.textMuted, c.bgPanel])

  // 计算阴影强度
  const shadowIntensity = useMemo(() => {
    if (highlighted) return '0 0 0 3px rgba(34, 197, 94, 0.35), 0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(34, 197, 94, 0.2)'
    if (active) return '0 0 0 3px rgba(99, 102, 241, 0.3), 0 8px 24px rgba(0,0,0,0.35), 0 0 16px rgba(99, 102, 241, 0.15)'
    if (selected) return '0 0 0 2.5px rgba(168, 85, 247, 0.4), 0 6px 20px rgba(0,0,0,0.3), 0 0 12px rgba(168, 85, 247, 0.2)'
    if (isHovered) return '0 4px 16px rgba(0,0,0,0.25), 0 0 8px rgba(99, 102, 241, 0.1)'
    return '0 2px 8px rgba(0,0,0,0.2)'
  }, [highlighted, active, selected, isHovered])

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
        background: `linear-gradient(135deg, ${bgColor}, ${bgColor}aa)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1.5px solid ${borderColor}`,
        padding: '10px 12px',
        boxShadow: shadowIntensity,
        transform: hoverTransform,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'grab',
        animation: highlighted ? 'newNodePulse 1.5s ease-in-out infinite' : 'none',
        '@keyframes newNodePulse': {
          '0%, 100%': { 
            boxShadow: `0 0 0 3px rgba(34, 197, 94, 0.25), 0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(34, 197, 94, 0.2)`,
          },
          '50%': { 
            boxShadow: `0 0 0 6px rgba(34, 197, 94, 0.15), 0 8px 32px rgba(0,0,0,0.5), 0 0 30px rgba(34, 197, 94, 0.3)`,
          },
        },
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 12px rgba(99, 102, 241, 0.15)',
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
          boxShadow: highlighted 
            ? `0 0 8px ${NEW_NODE_COLOR}60`
            : selected
              ? `0 0 8px ${colors.accent}50`
              : 'none',
          transition: 'all 0.3s ease',
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
          transition: 'all 0.3s ease',
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
            color: '#fff',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
            '&:hover': { 
              bgcolor: '#EF4444',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.5)',
              transform: 'scale(1.1)',
            },
            transition: 'all 0.2s ease',
            padding: 0,
          }}
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
          bgcolor: `${c.bgCard}e6`,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: `1px solid ${highlighted ? `${NEW_NODE_COLOR}40` : selected ? `${colors.accent}40` : `${c.border}60`}`,
          borderRadius: '5px',
          px: 0.7,
          py: 0.2,
          lineHeight: '14px',
          boxShadow: highlighted 
            ? `0 0 8px ${NEW_NODE_COLOR}30`
            : selected
              ? `0 0 8px ${colors.accent}25`
              : 'none',
          transition: 'all 0.3s ease',
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
                transition: 'all 0.3s ease',
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
