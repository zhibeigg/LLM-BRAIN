import { useState, useMemo, useEffect } from 'react'
import { Box, Typography, Collapse, CircularProgress } from '@mui/material'
import {
  Description as FileIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  FolderOpen as FolderIcon,
  Terminal as TerminalIcon,
  CreateNewFolder as CreateIcon,
  Check as CheckIcon,
  Close as ErrorIcon,
  ExpandMore as ExpandIcon,
} from '@mui/icons-material'
import { useColors } from '../../ThemeContext'
import { DiffView } from './DiffView'

interface CodingToolCardProps {
  toolName: string
  args: Record<string, unknown>
  result?: string
  success?: boolean
  durationMs?: number
  phase: 'start' | 'end'
}

/** 工具名到图标和标签的映射 */
const TOOL_META: Record<string, { icon: typeof FileIcon; label: string }> = {
  file_read: { icon: FileIcon, label: 'Read' },
  file_write: { icon: CreateIcon, label: 'Write' },
  file_edit: { icon: EditIcon, label: 'Edit' },
  file_search: { icon: SearchIcon, label: 'Search' },
  file_glob: { icon: SearchIcon, label: 'Glob' },
  file_list: { icon: FolderIcon, label: 'List' },
  terminal: { icon: TerminalIcon, label: 'Terminal' },
}

/** 从参数中提取摘要文本 */
function getSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'file_read': {
      const path = String(args.path ?? '')
      const range = args.startLine ? ` (${args.startLine}${args.endLine ? `-${args.endLine}` : ''})` : ''
      return `${path}${range}`
    }
    case 'file_write':
      return String(args.path ?? '')
    case 'file_edit':
      return String(args.path ?? '')
    case 'file_search':
      return `${args.pattern ?? ''}${args.glob ? ` --glob ${args.glob}` : ''}`
    case 'file_glob':
      return String(args.pattern ?? '')
    case 'file_list':
      return String(args.path ?? '.')
    case 'terminal':
      return String(args.command ?? '')
    default:
      return JSON.stringify(args).slice(0, 80)
  }
}

export function CodingToolCard({ toolName, args, result, success, durationMs, phase }: CodingToolCardProps) {
  const c = useColors()
  const [expanded, setExpanded] = useState(false)
  const meta = TOOL_META[toolName] ?? { icon: FileIcon, label: toolName }
  const Icon = meta.icon
  const summary = useMemo(() => getSummary(toolName, args), [toolName, args])
  const isRunning = phase === 'start'

  useEffect(() => {
    if (!isRunning && ['file_list', 'terminal', 'file_search', 'file_glob'].includes(toolName)) {
      setExpanded(true)
    }
  }, [isRunning, toolName])

  return (
    <Box sx={{
      borderRadius: '10px',
      border: `1px solid ${isRunning ? `${c.text}24` : c.border}`,
      bgcolor: c.bgCard,
      overflow: 'hidden',
      my: 0.75,
      position: 'relative',
      boxShadow: isRunning ? `0 0 0 1px ${c.text}08, 0 0 18px ${c.text}10` : 'none',
      animation: isRunning ? 'waitingToolGlow 2.4s ease-in-out infinite' : 'none',
      '@keyframes waitingToolGlow': {
        '0%, 100%': { boxShadow: `0 0 0 1px ${c.text}06, 0 0 10px ${c.text}08` },
        '50%': { boxShadow: `0 0 0 1px ${c.text}20, 0 0 24px ${c.text}18` },
      },
    }}>
      {/* 折叠头部 */}
      <Box
        onClick={() => !isRunning && setExpanded(!expanded)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isRunning) {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.9,
          cursor: isRunning ? 'default' : 'pointer',
          background: isRunning ? `linear-gradient(90deg, ${c.bgCard}, ${c.bgHover}66, ${c.bgCard})` : c.bgCard,
          transition: 'background-color 0.18s ease-out',
          '&:hover': isRunning ? {} : { bgcolor: c.bgHover },
        }}
      >
        {/* 工具图标 */}
        <Icon sx={{ fontSize: 15, color: c.toolCoding, flexShrink: 0 }} />

        {/* 标签 */}
        <Typography sx={{
          fontSize: 12,
          fontWeight: 600,
          color: c.toolCoding,
          fontFamily: '"JetBrains Mono", monospace',
          flexShrink: 0,
        }}>
          {meta.label}
        </Typography>

        {/* 摘要 */}
        <Typography sx={{
          fontSize: 11,
          color: c.filePathText,
          fontFamily: '"JetBrains Mono", monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}>
          {summary}
        </Typography>

        {/* 状态指示 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {isRunning ? (
            <>
              <Typography sx={{ fontSize: 10.5, color: c.textMuted, letterSpacing: '0.06em' }}>执行中</Typography>
              <CircularProgress size={14} sx={{ color: c.textMuted }} />
            </>
          ) : success ? (
            <>
              <CheckIcon sx={{ fontSize: 14, color: c.success }} />
              {durationMs !== undefined && (
                <Typography sx={{ fontSize: 10, color: c.textMuted, fontFamily: '"JetBrains Mono", monospace' }}>
                  {(durationMs / 1000).toFixed(1)}s
                </Typography>
              )}
            </>
          ) : success === false ? (
            <>
              <ErrorIcon sx={{ fontSize: 14, color: c.error }} />
              {durationMs !== undefined && (
                <Typography sx={{ fontSize: 10, color: c.textMuted, fontFamily: '"JetBrains Mono", monospace' }}>
                  {(durationMs / 1000).toFixed(1)}s
                </Typography>
              )}
            </>
          ) : null}

          {/* 展开箭头 */}
          {!isRunning && (
            <ExpandIcon sx={{
              fontSize: 16,
              color: c.textMuted,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }} />
          )}
        </Box>
      </Box>

      {/* 展开内容 */}
      <Collapse in={expanded} timeout={200}>
        <Box sx={{ borderTop: `1px solid ${c.border}` }}>
          <ToolResultContent toolName={toolName} args={args} result={result} success={success} />
        </Box>
      </Collapse>
    </Box>
  )
}

/** 根据工具类型渲染不同的结果内容 */
function ToolResultContent({
  toolName,
  args,
  result,
  success,
}: {
  toolName: string
  args: Record<string, unknown>
  result?: string
  success?: boolean
}) {
  const c = useColors()

  if (!result && success === undefined) {
    return (
      <Box sx={{
        p: 1.5,
        color: c.textMuted,
        fontSize: 11,
        position: 'relative',
        overflow: 'hidden',
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(90deg, transparent, ${c.text}10, transparent)`,
          transform: 'translateX(-100%)',
          animation: 'waitingResultSweep 2.2s ease-in-out infinite',
        },
        '@keyframes waitingResultSweep': {
          '0%': { transform: 'translateX(-100%)' },
          '55%, 100%': { transform: 'translateX(100%)' },
        },
      }}>
        等待工具返回结果...
      </Box>
    )
  }

  // file_edit — 显示 diff 视图
  if (toolName === 'file_edit' && args.old_string && args.new_string) {
    return (
      <Box sx={{ p: 1 }}>
        <DiffView
          filePath={String(args.path ?? '')}
          oldString={String(args.old_string)}
          newString={String(args.new_string)}
        />
        {result && (
          <Typography sx={{ mt: 0.75, fontSize: 11, color: c.textMuted, px: 0.5 }}>
            {result}
          </Typography>
        )}
      </Box>
    )
  }

  // terminal — 终端风格输出
  if (toolName === 'terminal') {
    return (
      <Box sx={{ p: 0 }}>
        {/* 命令行 */}
        <Box sx={{ px: 1.5, py: 0.5, bgcolor: c.terminalBg }}>
          <Typography sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            color: c.textMuted,
          }}>
            $ {String(args.command ?? '')}
          </Typography>
        </Box>
        {/* 输出 */}
        {result && (
          <Box sx={{
            px: 1.5, py: 1,
            bgcolor: c.terminalBg,
            maxHeight: 300,
            overflow: 'auto',
          }}>
            <Typography
              component="pre"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                color: success === false ? c.error : c.terminalText,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                m: 0,
                lineHeight: 1.6,
              }}
            >
              {result}
            </Typography>
          </Box>
        )}
      </Box>
    )
  }

  // file_read — 语法高亮代码块（带行号）
  if (toolName === 'file_read' && result) {
    return (
      <Box sx={{
        maxHeight: 400,
        overflow: 'auto',
        bgcolor: c.bgInput,
      }}>
        <Typography
          component="pre"
          sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            color: c.text,
            whiteSpace: 'pre',
            m: 0,
            p: 1.5,
            lineHeight: 1.6,
          }}
        >
          {result}
        </Typography>
      </Box>
    )
  }

  // file_search — 搜索结果
  if (toolName === 'file_search' && result) {
    const lines = result.split('\n')
    const header = lines[0] ?? ''
    const matches = lines.slice(1).filter(l => l.trim())

    return (
      <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
        {/* 搜索头部 */}
        <Box sx={{ px: 1.5, py: 0.5, bgcolor: c.bgInput, borderBottom: `1px solid ${c.border}` }}>
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>{header}</Typography>
        </Box>
        {/* 匹配结果 */}
        {matches.map((line, i) => {
          const colonIdx = line.indexOf(':')
          const secondColon = colonIdx >= 0 ? line.indexOf(':', colonIdx + 1) : -1
          const filePart = secondColon > 0 ? line.slice(0, secondColon) : line.slice(0, colonIdx)
          const contentPart = secondColon > 0 ? line.slice(secondColon + 1) : line.slice(colonIdx + 1)

          return (
            <Box key={i} sx={{
              px: 1.5, py: 0.25,
              display: 'flex',
              gap: 1,
              '&:hover': { bgcolor: c.bgHover },
              borderBottom: `1px solid ${c.border}08`,
            }}>
              <Typography sx={{
                fontSize: 11,
                color: c.filePathText,
                fontFamily: '"JetBrains Mono", monospace',
                flexShrink: 0,
                minWidth: 0,
                maxWidth: '40%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {filePart}
              </Typography>
              <Typography sx={{
                fontSize: 11,
                color: c.text,
                fontFamily: '"JetBrains Mono", monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {contentPart}
              </Typography>
            </Box>
          )
        })}
      </Box>
    )
  }

  // file_list — 目录树
  if (toolName === 'file_list' && result) {
    const lines = result.split('\n')
    const root = lines[0] ?? '.'
    const tree = lines.slice(1).join('\n')
    return (
      <Box sx={{ bgcolor: c.bgInput }}>
        <Box sx={{
          px: 1.5,
          py: 0.7,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          borderBottom: `1px solid ${c.border}`,
          bgcolor: c.bgCard,
        }}>
          <FolderIcon sx={{ fontSize: 14, color: c.toolCoding }} />
          <Typography sx={{ fontSize: 11, color: c.textMuted }}>目录结构</Typography>
          <Typography sx={{ fontSize: 11, color: c.filePathText, fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {root}
          </Typography>
        </Box>
        <Box sx={{
          maxHeight: 460,
          overflow: 'auto',
          px: 1.5,
          py: 1.2,
        }}>
          <Typography
            component="pre"
            sx={{
              fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
              fontSize: 11.5,
              color: c.textSecondary,
              whiteSpace: 'pre',
              m: 0,
              lineHeight: 1.65,
              tabSize: 2,
              '&::selection': { bgcolor: `${c.primary}30` },
            }}
          >
            {tree || result}
          </Typography>
        </Box>
      </Box>
    )
  }

  // 默认：通用结果展示
  return (
    <Box sx={{
      maxHeight: 300,
      overflow: 'auto',
      p: 1.5,
    }}>
      <Typography
        component="pre"
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: success === false ? c.error : c.text,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          m: 0,
          lineHeight: 1.5,
        }}
      >
        {result ?? '(无输出)'}
      </Typography>
    </Box>
  )
}
