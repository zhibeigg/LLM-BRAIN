import { useEffect, useState } from 'react'
import {
  Box, Typography, Slider, IconButton, TextField, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tooltip, Divider, CircularProgress,
} from '@mui/material'
import { Add as AddIcon, Delete as DeleteIcon, AutoAwesome as AIIcon } from '@mui/icons-material'
import { usePersonalityStore } from '../../stores/personalityStore'
import { useBrainStore } from '../../stores/brainStore'
import { personalityApi } from '../../services/api'
import { useColors } from '../../ThemeContext'

export function PersonalityPanel() {
  const c = useColors()
  const {
    dimensions, maxDimensions, loading,
    fetchDimensions, fetchMaxDimensions,
    updateDimensionLocal, commitDimensionValue,
    addDimension, deleteDimension,
  } = usePersonalityStore()

  const currentBrainId = useBrainStore((s) => s.currentBrainId)

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<string | null>(null)

  useEffect(() => {
    if (currentBrainId) {
      fetchDimensions()
    }
    fetchMaxDimensions()
  }, [currentBrainId, fetchDimensions, fetchMaxDimensions])

  const handleAdd = async () => {
    if (!newName.trim()) return
    await addDimension(newName.trim(), newDesc.trim())
    setNewName('')
    setNewDesc('')
    setAddOpen(false)
  }

  const handleDelete = async () => {
    if (deleteConfirmId) {
      await deleteDimension(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  const handleAiGenerate = async () => {
    if (!aiInput.trim() || !currentBrainId) return
    setAiLoading(true)
    setAiResult(null)
    try {
      const result = await personalityApi.parse(aiInput.trim(), currentBrainId)
      const parts: string[] = []
      if (result.updates.length > 0) {
        parts.push(`更新 ${result.updates.length} 个维度`)
      }
      if (result.newDimensions.length > 0) {
        parts.push(`新增 ${result.newDimensions.length} 个维度`)
      }
      setAiResult(parts.length > 0 ? parts.join('，') : '未识别到性格特征')
      fetchDimensions()
    } catch (e) {
      setAiResult(`失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAiLoading(false)
    }
  }

  const atLimit = dimensions.length >= maxDimensions

  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 700, color: c.text, mb: 0.5, fontSize: 15 }}>
        性格系统
      </Typography>
      <Typography sx={{ color: c.textMuted, mb: 2, fontSize: 13 }}>
        {dimensions.length} / {maxDimensions} 维度
      </Typography>

      <Divider sx={{ mb: 2, borderColor: c.border }} />

      {loading ? (
        <Typography sx={{ color: c.textMuted, fontSize: 13 }}>加载中...</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {dimensions.map((dim) => (
            <Box key={dim.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Tooltip title={dim.description} placement="top" arrow>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: c.text, cursor: 'help' }}>
                    {dim.name}
                  </Typography>
                </Tooltip>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontFamily: 'monospace', color: c.primary }}>
                    {dim.value.toFixed(2)}
                  </Typography>
                  {!dim.isBuiltin && (
                    <IconButton
                      size="small"
                      onClick={() => setDeleteConfirmId(dim.id)}
                      sx={{ p: 0.25, color: c.textMuted, '&:hover': { color: c.error } }}
                      aria-label="删除维度"
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </Box>
              </Box>
              <Slider
                value={dim.value}
                min={0}
                max={1}
                step={0.01}
                onChange={(_, v) => {
                  if (typeof v === 'number') updateDimensionLocal(dim.id, v)
                }}
                onChangeCommitted={(_, v) => {
                  if (typeof v === 'number') commitDimensionValue(dim.id, v)
                }}
                sx={{
                  height: 4,
                  p: '6px 0',
                  color: c.primary,
                  '& .MuiSlider-track': { background: c.primary, border: 'none' },
                  '& .MuiSlider-thumb': {
                    width: 14,
                    height: 14,
                    bgcolor: c.primary,
                    border: 'none',
                    boxShadow: `0 0 6px ${c.primary}50`,
                    '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${c.primary}20` },
                  },
                  '& .MuiSlider-rail': { bgcolor: c.border, opacity: 1 },
                }}
              />
            </Box>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 2, borderColor: c.border }} />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: '16px !important' }} />}
          disabled={atLimit}
          onClick={() => setAddOpen(true)}
          sx={{
            flex: 1, fontSize: 13,
            borderColor: c.border, color: c.textSecondary, textTransform: 'none',
            '&:hover': { borderColor: c.primary, color: c.primary, bgcolor: `${c.primary}10` },
          }}
        >
          添加维度
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AIIcon sx={{ fontSize: '16px !important' }} />}
          onClick={() => { setAiOpen(true); setAiResult(null); setAiInput('') }}
          sx={{
            flex: 1, fontSize: 13,
            borderColor: c.border, color: c.textSecondary, textTransform: 'none',
            '&:hover': { borderColor: c.primary, color: c.primary, bgcolor: `${c.primary}10` },
          }}
        >
          AI 生成
        </Button>
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 17, color: c.text }}>添加性格维度</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {atLimit && (
            <Typography variant="body2" color="error">已达到维度上限（{maxDimensions}）</Typography>
          )}
          <TextField label="维度名称" size="small" value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth />
          <TextField label="描述" size="small" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} multiline rows={2} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} size="small" sx={{ color: c.textSecondary }}>取消</Button>
          <Button onClick={handleAdd} variant="contained" size="small" disabled={!newName.trim() || atLimit}>添加</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} maxWidth="xs">
        <DialogTitle sx={{ fontSize: 17, color: c.text }}>确认删除</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: c.textSecondary }}>
            确定要删除维度「{dimensions.find((d) => d.id === deleteConfirmId)?.name}」吗？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)} size="small" sx={{ color: c.textSecondary }}>取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained" size="small">删除</Button>
        </DialogActions>
      </Dialog>

      {/* AI 生成 Dialog */}
      <Dialog open={aiOpen} onClose={() => !aiLoading && setAiOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 17, color: c.text }}>AI 生成性格维度</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Typography variant="body2" sx={{ color: c.textSecondary, fontSize: 13 }}>
            用自然语言描述性格特征，AI 会自动生成或调整维度。
          </Typography>
          <TextField
            size="small"
            placeholder="例如：做事严谨但不爱探索新事物，比较懒"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            multiline
            rows={3}
            fullWidth
            disabled={aiLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate() }
            }}
          />
          {aiResult && (
            <Typography sx={{ fontSize: 13, color: aiResult.startsWith('失败') ? c.error : c.success }}>
              {aiResult}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAiOpen(false)} size="small" disabled={aiLoading} sx={{ color: c.textSecondary }}>
            关闭
          </Button>
          <Button
            onClick={handleAiGenerate}
            variant="contained"
            size="small"
            disabled={!aiInput.trim() || aiLoading}
            startIcon={aiLoading ? <CircularProgress size={16} /> : undefined}
          >
            {aiLoading ? '生成中...' : '生成'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
