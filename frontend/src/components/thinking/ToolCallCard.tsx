import { useState, useMemo } from 'react'
import { Box, Typography, Collapse, CircularProgress, IconButton } from '@mui/material'
import {
  Search as SearchIcon,
  Code as CodeIcon,
  Memory as MemoryIcon,
  Build as BuildIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material'
import type { ToolCallPayload } from '../../types'
import { useThemeMode, useColors } from '../../ThemeContext'

/* ── 工具类别图标映射 ── */

const TOOL_CATEGORY: Record<string, 'search' | 'code' | 'memory' | 'utility'> = {
  web_search: 'search',
  url_reader: 'search',
  browser: 'search',
  code_executor: 'code',
  terminal: 'code',
  memory_search: 'memory',
  memory_write: 'memory',
  node_edit: 'memory',
  node_delete: 'memory',
  node_list: 'memory',
  calculator: 'utility',
  share_file: 'utility',
}

const CATEGORY_ICON = {
  search: SearchIcon,
  code: CodeIcon,
  memory: MemoryIcon,
  utility: BuildIcon,
}

function useCategoryColor() {
  const c = useColors()
  return {
    search: c.toolSearch,
    code: c.toolCode,
    memory: c.toolMemory,
    utility: c.toolUtility,
  }
}

/* ── 主题 ── */

function useCardTheme() {
  const c = useColors()
  const { mode } = useThemeMode()
  const isDark = mode === 'dark'
  return {
    bg: isDark ? '#18191C' : '#F5F5F7',
    bgHover: c.bgPanel,
    border: c.border,
    bodyText: c.text,
    mutedText: c.textMuted,
    dimText: isDark ? '#4B5059' : '#AEAEB2',
    resultBg: c.bg,
    toolName: isDark ? '#D1D3DA' : '#1D1D1F',
  }
}

/* ── 参数摘要提取 ── */

function getArgsSummary(toolName: string, argsStr: string): string {
  try {
    const args = JSON.parse(argsStr)
    // 根据工具类型提取关键参数
    if (toolName === 'web_search' && args.query) return args.query
    if (toolName === 'url_reader' && args.url) return args.url
    if (toolName === 'memory_search' && args.query) return args.query
    if (toolName === 'code_executor' && args.code) return args.code.slice(0, 60)
    if (toolName === 'terminal' && args.command) return args.command
    if (toolName === 'calculator' && args.expression) return args.expression
    if (toolName === 'node_edit' && args.nodeId) return `节点 ${args.nodeId.slice(0, 8)}...`
    if (toolName === 'node_delete' && args.nodeId) return `节点 ${args.nodeId.slice(0, 8)}...`
    if (toolName === 'node_list') return ''
    if (toolName === 'browser' && args.url) return args.url
    if (toolName === 'share_file' && args.path) return args.path
    // fallback: 取第一个字符串值
    const firstVal = Object.values(args).find((v) => typeof v === 'string') as string | undefined
    return firstVal ? firstVal.slice(0, 60) : ''
  } catch {
    return argsStr.slice(0, 60)
  }
}

/* ── 格式化耗时 ── */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/* ── 组件 ── */

export function ToolCallCard({ data }: { data: ToolCallPayload }) {
  const [expanded, setExpanded] = useState(false)
  const t = useCardTheme()
  const c = useColors()
  const categoryColors = useCategoryColor()

  const category = TOOL_CATEGORY[data.toolName] ?? 'utility'
  const Icon = CATEGORY_ICON[category]
  const color = categoryColors[category]
  const isRunning = data.phase === 'start'
  const summary = useMemo(() => getArgsSummary(data.toolName, data.arguments), [data.toolName, data.arguments])

  const parsedArgs = useMemo(() => {
    try { return JSON.parse(data.arguments) } catch { return null }
  }, [data.arguments])

  return (
    <Box sx={{ borderRadius: '8px', border: `1px solid ${t.border}`, overflow: 'hidden', my: 0.5 }}>
      {/* 折叠头部 */}
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) } }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          bgcolor: t.bg,
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { bgcolor: t.bgHover },
          transition: 'background-color 0.15s',
        }}
      >
        <Icon sx={{ fontSize: 16, color }} />
        <Typography
          component="code"
          sx={{ fontSize: 12, fontWeight: 600, color: t.toolName, fontFamily: 'monospace' }}
        >
          {data.toolName}
        </Typography>
        {summary && (
          <Typography
            sx={{
              fontSize: 12,
              color: t.mutedText,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {summary}
          </Typography>
        )}
        {!summary && <Box sx={{ flex: 1 }} />}

        {/* 状态 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {isRunning ? (
            <CircularProgress size={14} thickness={5} sx={{ color }} />
          ) : data.success ? (
            <>
              <SuccessIcon sx={{ fontSize: 14, color: c.success }} />
              <Typography sx={{ fontSize: 11, color: t.mutedText }}>
                {data.durationMs != null ? formatDuration(data.durationMs) : ''}
              </Typography>
            </>
          ) : (
            <>
              <ErrorIcon sx={{ fontSize: 14, color: c.error }} />
              <Typography sx={{ fontSize: 11, color: t.mutedText }}>
                {data.durationMs != null ? formatDuration(data.durationMs) : ''}
              </Typography>
            </>
          )}
        </Box>

        <IconButton size="small" sx={{ p: 0, ml: 0.25 }} aria-label={expanded ? '收起详情' : '展开详情'}>
          <ChevronRightIcon
            sx={{
              fontSize: 16,
              color: t.dimText,
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        </IconButton>
      </Box>

      {/* 展开详情 */}
      <Collapse in={expanded} timeout={200}>
        <Box sx={{ px: 1.5, py: 1, bgcolor: t.resultBg, borderTop: `1px solid ${t.border}` }}>
          {/* 参数 */}
          {parsedArgs && typeof parsedArgs === 'object' && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 10, color: t.dimText, fontWeight: 600, mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                参数
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {Object.entries(parsedArgs).map(([key, val]) => (
                  <Box key={key} sx={{ display: 'flex', gap: 0.75, fontSize: 11 }}>
                    <Typography sx={{ fontSize: 11, color, fontWeight: 600, flexShrink: 0, minWidth: 60, fontFamily: 'monospace' }}>
                      {key}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: t.bodyText,
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {typeof val === 'string'
                        ? (val.length > 300 ? val.slice(0, 300) + '…' : val)
                        : JSON.stringify(val)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* 结果 */}
          {data.result != null && (
            <Box>
              <Typography sx={{ fontSize: 10, color: t.dimText, fontWeight: 600, mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                结果
              </Typography>
              <ToolResultContent result={data.result} success={data.success} theme={t} />
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

/* ── 工具结果渲染 ── */

function ToolResultContent({
  result,
  success,
  theme: t,
}: {
  result: string
  success?: boolean
  theme: ReturnType<typeof useCardTheme>
}) {
  const c = useColors()
  const [showFull, setShowFull] = useState(false)
  const isLong = result.length > 500
  const display = showFull ? result : result.slice(0, 500)

  return (
    <Box>
      <Box
        component="pre"
        sx={{
          fontSize: 11,
          color: success === false ? c.error : t.bodyText,
          m: 0,
          p: 1,
          bgcolor: t.bg,
          borderRadius: '4px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: showFull ? 400 : 150,
          overflowY: 'auto',
          fontFamily: 'monospace',
          lineHeight: 1.5,
        }}
      >
        {display}{isLong && !showFull ? '…' : ''}
      </Box>
      {isLong && (
        <Typography
          onClick={() => setShowFull(!showFull)}
          sx={{
            fontSize: 11,
            color: c.primary,
            cursor: 'pointer',
            mt: 0.5,
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {showFull ? '收起' : '展开全部'}
        </Typography>
      )}
    </Box>
  )
}
