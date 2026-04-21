import { useCallback, useState } from 'react'
import { IconButton, Tooltip, Box, CircularProgress } from '@mui/material'
import {
  FileUpload as ImportIcon,
  FileDownload as ExportIcon,
  AccountTree as AutoLayoutIcon,
} from '@mui/icons-material'
import { nodesApi, edgesApi } from '../../services/api'
import { useGraphStore } from '../../stores/graphStore'
import { useColors } from '../../ThemeContext'
import type { MemoryNode, MemoryEdge } from '../../types'

interface ExportData {
  version: string
  exportedAt: string
  nodes: MemoryNode[]
  edges: MemoryEdge[]
}

export function ExportImport() {
  const c = useColors()
  const { nodes, edges, fetchGraph, autoLayout } = useGraphStore()
  const [layouting, setLayouting] = useState(false)

  const handleExport = useCallback(() => {
    const data: ExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `llm-brain-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [nodes, edges])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data: ExportData = JSON.parse(text)

        if (!data.nodes || !data.edges) {
          throw new Error('无效的导入文件格式')
        }

        // 批量创建节点，建立 oldId → newId 映射
        const idMap = new Map<string, string>()
        for (const node of data.nodes) {
          const { id: oldId, createdAt, updatedAt, ...rest } = node
          const created = await nodesApi.create(rest)
          idMap.set(oldId, created.id)
        }

        // 批量创建边，使用映射后的新 ID
        for (const edge of data.edges) {
          const { id, createdAt, usageCount, perceivedDifficulty, sourceId, targetId, ...rest } = edge
          const newSourceId = idMap.get(sourceId)
          const newTargetId = idMap.get(targetId)
          if (!newSourceId || !newTargetId) {
            console.warn(`跳过边: 源节点(${sourceId})或目标节点(${targetId})未找到映射`)
            continue
          }
          await edgesApi.create({ ...rest, sourceId: newSourceId, targetId: newTargetId })
        }

        // 刷新图谱
        await fetchGraph()
      } catch (err) {
        console.error('导入失败:', err)
      }
    }
    input.click()
  }, [fetchGraph])

  const handleAutoLayout = useCallback(async () => {
    setLayouting(true)
    try {
      await autoLayout()
    } finally {
      setLayouting(false)
    }
  }, [autoLayout])

  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      <Tooltip title="自动规整布局">
        <span>
          <IconButton
            size="small"
            onClick={handleAutoLayout}
            disabled={layouting}
            sx={{ color: c.textMuted, '&:hover': { color: c.primary, bgcolor: `${c.primary}15` } }}
            aria-label="自动规整布局"
          >
            {layouting ? <CircularProgress size={18} /> : <AutoLayoutIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="导入图谱">
        <IconButton size="small" onClick={handleImport} sx={{ color: c.textMuted, '&:hover': { color: c.primary, bgcolor: `${c.primary}15` } }} aria-label="导入图谱">
          <ImportIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="导出图谱">
        <IconButton size="small" onClick={handleExport} sx={{ color: c.textMuted, '&:hover': { color: c.primary, bgcolor: `${c.primary}15` } }} aria-label="导出图谱">
          <ExportIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
