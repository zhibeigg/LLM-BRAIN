import { useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import { useColors } from '../../ThemeContext'

interface DiffViewProps {
  filePath: string
  oldString: string
  newString: string
  /** 可选：显示上下文行数 */
  contextLines?: number
}

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldNum?: number
  newNum?: number
}

/**
 * 简单的行级 diff 算法
 * 生成 unified diff 格式的行列表
 */
function computeDiff(oldStr: string, newStr: string, contextLines = 3): DiffLine[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  
  // 简单 LCS-based diff
  const m = oldLines.length
  const n = newLines.length
  
  // 构建 LCS 表
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  
  // 回溯生成 diff
  const rawDiff: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawDiff.unshift({ type: 'context', content: oldLines[i - 1], oldNum: i, newNum: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.unshift({ type: 'add', content: newLines[j - 1], newNum: j })
      j--
    } else {
      rawDiff.unshift({ type: 'remove', content: oldLines[i - 1], oldNum: i })
      i--
    }
  }
  
  // 过滤：只保留变更行及其上下文
  if (contextLines < 0) return rawDiff
  
  const changeIndices = new Set<number>()
  rawDiff.forEach((line, idx) => {
    if (line.type !== 'context') {
      for (let k = Math.max(0, idx - contextLines); k <= Math.min(rawDiff.length - 1, idx + contextLines); k++) {
        changeIndices.add(k)
      }
    }
  })
  
  const result: DiffLine[] = []
  let lastIdx = -1
  for (const idx of [...changeIndices].sort((a, b) => a - b)) {
    if (lastIdx >= 0 && idx - lastIdx > 1) {
      result.push({ type: 'context', content: '···' })
    }
    result.push(rawDiff[idx])
    lastIdx = idx
  }
  
  return result
}

export function DiffView({ filePath, oldString, newString, contextLines = 3 }: DiffViewProps) {
  const c = useColors()
  const lines = useMemo(() => computeDiff(oldString, newString, contextLines), [oldString, newString, contextLines])
  
  const addCount = lines.filter(l => l.type === 'add').length
  const removeCount = lines.filter(l => l.type === 'remove').length
  
  const lineNumWidth = Math.max(
    ...lines.map(l => String(l.oldNum ?? '').length),
    ...lines.map(l => String(l.newNum ?? '').length),
    2
  )
  
  return (
    <Box sx={{ borderRadius: '6px', overflow: 'hidden', border: `1px solid ${c.border}`, fontSize: 12 }}>
      {/* 文件路径头部 */}
      <Box sx={{
        px: 1.5, py: 0.75,
        bgcolor: c.bgInput,
        borderBottom: `1px solid ${c.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Typography sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: c.filePathText,
          fontWeight: 500,
        }}>
          {filePath}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {addCount > 0 && (
            <Typography sx={{ fontSize: 11, color: c.diffAddText, fontFamily: '"JetBrains Mono", monospace' }}>
              +{addCount}
            </Typography>
          )}
          {removeCount > 0 && (
            <Typography sx={{ fontSize: 11, color: c.diffRemoveText, fontFamily: '"JetBrains Mono", monospace' }}>
              -{removeCount}
            </Typography>
          )}
        </Box>
      </Box>
      
      {/* Diff 内容 */}
      <Box sx={{ overflow: 'auto', maxHeight: 400 }}>
        {lines.map((line, idx) => {
          const bgColor = line.type === 'add' ? c.diffAdd
            : line.type === 'remove' ? c.diffRemove
            : 'transparent'
          const textColor = line.type === 'add' ? c.diffAddText
            : line.type === 'remove' ? c.diffRemoveText
            : c.text
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
          
          return (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                bgcolor: bgColor,
                minHeight: 20,
                lineHeight: '20px',
                '&:hover': { filter: 'brightness(1.1)' },
              }}
            >
              {/* 旧行号 */}
              <Box sx={{
                width: lineNumWidth * 8 + 8,
                flexShrink: 0,
                textAlign: 'right',
                pr: 0.5,
                color: c.diffLineNum,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                userSelect: 'none',
                opacity: line.content === '···' ? 0 : 1,
              }}>
                {line.oldNum ?? ''}
              </Box>
              {/* 新行号 */}
              <Box sx={{
                width: lineNumWidth * 8 + 8,
                flexShrink: 0,
                textAlign: 'right',
                pr: 0.5,
                color: c.diffLineNum,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                userSelect: 'none',
                borderRight: `1px solid ${c.border}`,
                opacity: line.content === '···' ? 0 : 1,
              }}>
                {line.newNum ?? ''}
              </Box>
              {/* 前缀符号 */}
              <Box sx={{
                width: 20,
                flexShrink: 0,
                textAlign: 'center',
                color: textColor,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                fontWeight: 600,
                userSelect: 'none',
              }}>
                {line.content === '···' ? '⋯' : prefix}
              </Box>
              {/* 内容 */}
              <Box sx={{
                flex: 1,
                color: textColor,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                whiteSpace: 'pre',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pr: 1,
              }}>
                {line.content}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
