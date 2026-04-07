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
    personality: { accent: c.primary, bg: `${c.primary}12` },
    memory: { accent: c.secondary, bg: `${c.secondary}12` },
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

  const bgColor = highlighted
    ? `${NEW_NODE_COLOR}12`
    : active
      ? colors.bg
      : c.bgCard

  const handleStyle: React.CSSProperties = useMemo(() => ({
    width: 8,
    height: 8,
    background: c.textMuted,
    border: `1.5px solid ${c.bgPanel}`,
  }), [c.textMuted, c.bgPanel])

  return (
    <Box
      sx={{
        position: 'relative',
        minWidth: 160,
        maxWidth: 240,
        borderRadius: '10px',
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        padding: '10px 12px',
        boxShadow: highlighted
          ? `0 0 0 3px ${NEW_NODE_COLOR}25, 0 4px 12px rgba(0,0,0,0.3)`
          : active
            ? `0 0 0 3px ${colors.accent}20, 0 4px 12px rgba(0,0,0,0.3)`
            : selected
              ? `0 0 0 2px ${colors.accent}15, 0 2px 8px rgba(0,0,0,0.2)`
              : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease',
        cursor: 'grab',
        animation: highlighted ? 'newNodePulse 1.5s ease-in-out infinite' : 'none',
        '@keyframes newNodePulse': {
          '0%, 100%': { boxShadow: `0 0 0 3px ${NEW_NODE_COLOR}25, 0 4px 12px rgba(0,0,0,0.3)` },
          '50%': { boxShadow: `0 0 0 6px ${NEW_NODE_COLOR}15, 0 4px 16px rgba(0,0,0,0.4)` },
        },
      }}
    >
      {/* 左侧类型色条 */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 10,
          bottom: 10,
          width: 3,
          borderRadius: '0 2px 2px 0',
          background: highlighted ? NEW_NODE_COLOR : colors.accent,
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
            top: -9,
            left: -9,
            width: 20,
            height: 20,
            bgcolor: c.error,
            color: '#fff',
            zIndex: 10,
            '&:hover': { bgcolor: '#EF4444' },
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
          top: -7,
          right: 8,
          fontSize: 11,
          fontWeight: 600,
          color: highlighted ? NEW_NODE_COLOR : colors.accent,
          bgcolor: c.bgCard,
          border: `1px solid ${highlighted ? `${NEW_NODE_COLOR}30` : `${colors.accent}30`}`,
          borderRadius: '4px',
          px: 0.6,
          lineHeight: '14px',
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
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 13,
        }}
      >
        {data.title}
      </Typography>

      {/* 类型标签 */}
      <Typography sx={{ fontSize: 11, color: highlighted ? NEW_NODE_COLOR : c.textMuted, mt: 0.25 }}>
        {highlighted ? '新提取' : data.type === 'personality' ? '性格' : '记忆'}
      </Typography>

      {/* 标签 */}
      {data.tags.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.5 }}>
          {data.tags.slice(0, 2).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                color: c.textMuted,
                bgcolor: c.bgInput,
                border: `1px solid ${c.border}`,
                '& .MuiChip-label': { px: 0.6 },
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
