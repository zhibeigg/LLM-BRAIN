import { useState, useEffect } from 'react'
import {
  Box, Typography, TextField, Chip, Button, Slider,
  Paper, IconButton, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material'
import { Close as CloseIcon, Save as SaveIcon, Delete as DeleteIcon } from '@mui/icons-material'
import { useGraphStore } from '../../stores/graphStore'
import { useColors } from '../../ThemeContext'

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function NodeEditor() {
  const c = useColors()
  const { nodes, selectedNodeId, selectNode, updateNode, deleteNode } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId) ?? null

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [confidence, setConfidence] = useState(0.5)
  const [newTag, setNewTag] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (node) {
      setTitle(node.title)
      setContent(node.content)
      setTags([...node.tags])
      setConfidence(node.confidence)
    }
  }, [node])

  if (!node) return null

  const handleSave = async () => {
    await updateNode(node.id, { title, content, tags, confidence })
  }

  const handleDelete = async () => {
    await deleteNode(node.id)
    setDeleteOpen(false)
  }

  const handleAddTag = () => {
    const t = newTag.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setNewTag('')
  }

  const handleRemoveTag = (tag: string) => setTags(tags.filter((t) => t !== tag))

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddTag() }
  }

  const isPersonality = node.type === 'personality'
  const accentColor = isPersonality ? c.primary : c.secondary

  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: 'transparent',
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 标题栏 */}
      <Box
        sx={{
          background: accentColor,
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: '10px 10px 0 0',
        }}
      >
        <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>
          节点编辑
        </Typography>
        <IconButton size="small" onClick={() => selectNode(null)} sx={{ color: '#fff', p: 0.25 }} aria-label="关闭编辑器">
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* 内容区 */}
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <TextField label="标题" size="small" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
        <TextField label="内容" size="small" value={content} onChange={(e) => setContent(e.target.value)} multiline rows={3} fullWidth />

        {/* 标签 */}
        <Box>
          <Typography variant="caption" sx={{ color: c.textSecondary, mb: 0.5, display: 'block', fontSize: 12 }}>标签</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {tags.map((tag) => (
              <Chip
                key={tag} label={tag} size="small"
                onDelete={() => handleRemoveTag(tag)}
                sx={{ bgcolor: `${c.primary}15`, color: c.primary, border: `1px solid ${c.primary}30`, height: 26, fontSize: 12 }}
              />
            ))}
          </Box>
          <TextField size="small" placeholder="输入标签后回车" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={handleTagKeyDown} fullWidth />
        </Box>

        {/* 置信度 */}
        <Box>
          <Typography variant="caption" sx={{ color: c.textSecondary, fontSize: 12 }}>
            置信度：<span style={{ color: c.primary }}>{confidence.toFixed(2)}</span>
          </Typography>
          <Slider
            value={confidence} min={0} max={1} step={0.01}
            onChange={(_, v) => { if (typeof v === 'number') setConfidence(v) }}
            sx={{ color: c.primary }}
          />
        </Box>

        <Divider sx={{ borderColor: c.border }} />

        {/* 只读信息 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Typography variant="caption" sx={{ color: c.textMuted, fontSize: 12 }}>
            类型：{isPersonality ? '性格节点' : '记忆节点'}
          </Typography>
          <Typography variant="caption" sx={{ color: c.textMuted, fontSize: 12 }}>
            创建：{formatTimestamp(node.createdAt)}
          </Typography>
          <Typography variant="caption" sx={{ color: c.textMuted, fontSize: 12 }}>
            更新：{formatTimestamp(node.updatedAt)}
          </Typography>
        </Box>

        <Divider sx={{ borderColor: c.border }} />

        {/* 操作按钮 */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" size="small" startIcon={<SaveIcon sx={{ fontSize: '16px !important' }} />} onClick={handleSave} sx={{ flex: 1, fontSize: 13 }}>
            保存
          </Button>
          <Button
            variant="outlined" size="small" color="error"
            startIcon={<DeleteIcon sx={{ fontSize: '16px !important' }} />}
            onClick={() => setDeleteOpen(true)}
            sx={{ flex: 1, fontSize: 13, borderColor: `${c.error}40`, color: c.error, '&:hover': { borderColor: c.error, bgcolor: `${c.error}10` } }}
          >
            删除
          </Button>
        </Box>
      </Box>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs">
        <DialogTitle sx={{ fontSize: 17, color: c.text }}>确认删除</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: c.textSecondary }}>
            确定要删除节点「{node.title}」吗？关联的边也会被移除。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} sx={{ color: c.textSecondary }}>取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained">删除</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
