import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, IconButton, Menu, MenuItem, ListItemText,
  ListItemIcon, Divider, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Button, Tooltip, CircularProgress,
  List, ListItemButton, Breadcrumbs, Link, FormControlLabel, Checkbox,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Psychology as BrainIcon,
  KeyboardArrowDown as ArrowIcon,
  FolderOpen as FolderIcon,
  AutoAwesome as AIIcon,
  AccountTree as InitIcon,
} from '@mui/icons-material'
import { useBrainStore } from '../../stores/brainStore'
import { useGraphStore } from '../../stores/graphStore'
import { usePersonalityStore } from '../../stores/personalityStore'
import { personalityApi, fsApi } from '../../services/api'
import type { DirEntry } from '../../services/api'
import { useColors } from '../../ThemeContext'

export function BrainSelector({ requestCreate }: { requestCreate?: number } = {}) {
  const c = useColors()
  const { brains, currentBrainId, loading, fetchBrains, createBrain, deleteBrain, selectBrain } = useBrainStore()
  const fetchGraph = useGraphStore((s) => s.fetchGraph)
  const fetchDimensions = usePersonalityStore((s) => s.fetchDimensions)

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newProjectPath, setNewProjectPath] = useState('')
  const [personalityText, setPersonalityText] = useState('')
  const [creating, setCreating] = useState(false)
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [initProject, setInitProject] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // 目录浏览弹窗状态
  const [dirBrowserOpen, setDirBrowserOpen] = useState(false)
  const [dirList, setDirList] = useState<DirEntry[]>([])
  const [dirCurrent, setDirCurrent] = useState('')
  const [dirLoading, setDirLoading] = useState(false)

  const loadDirs = useCallback(async (path?: string) => {
    setDirLoading(true)
    try {
      const res = await fsApi.listDirs(path)
      setDirList(res.dirs)
      setDirCurrent(res.current)
    } catch (e) {
      console.error('加载目录失败:', e)
    } finally {
      setDirLoading(false)
    }
  }, [])

  const handleOpenDirBrowser = useCallback(() => {
    setDirBrowserOpen(true)
    loadDirs(newProjectPath || undefined)
  }, [loadDirs, newProjectPath])

  const handleSelectDir = useCallback(() => {
    setNewProjectPath(dirCurrent)
    setDirBrowserOpen(false)
  }, [dirCurrent])

  useEffect(() => {
    fetchBrains()
  }, [fetchBrains])

  // 外部触发打开创建弹窗
  useEffect(() => {
    if (requestCreate && requestCreate > 0) {
      setCreateOpen(true)
    }
  }, [requestCreate])

  const handleSelect = (id: string) => {
    selectBrain(id)
    setAnchorEl(null)
    setTimeout(() => {
      fetchGraph()
      fetchDimensions()
    }, 0)
  }

  const resetCreateForm = () => {
    setNewName('')
    setNewDesc('')
    setNewProjectPath('')
    setPersonalityText('')
    setAiStatus(null)
    setCreating(false)
    setInitProject(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setAiStatus(null)

    try {
      // 1. 创建大脑
      const brain = await createBrain(newName.trim(), newDesc.trim(), newProjectPath.trim(), initProject && !!newProjectPath.trim())

      // 2. 如果填写了性格描述，调用 AI 生成性格维度
      if (personalityText.trim()) {
        setAiStatus('正在用 AI 生成性格维度...')
        try {
          const result = await personalityApi.parse(personalityText.trim(), brain.id)
          const parts: string[] = []
          if (result.updates.length > 0) parts.push(`更新 ${result.updates.length} 个维度`)
          if (result.newDimensions.length > 0) parts.push(`新增 ${result.newDimensions.length} 个维度`)
          setAiStatus(parts.length > 0 ? `性格生成完成：${parts.join('，')}` : '未识别到性格特征')
        } catch (e) {
          setAiStatus(`性格生成失败: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // 3. 切换到新大脑
      resetCreateForm()
      setCreateOpen(false)
      setTimeout(() => {
        fetchGraph()
        fetchDimensions()
      }, 0)
    } catch (e) {
      setAiStatus(`创建失败: ${e instanceof Error ? e.message : String(e)}`)
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return
    await deleteBrain(deleteConfirmId)
    setDeleteConfirmId(null)
    setAnchorEl(null)
    setTimeout(() => {
      fetchGraph()
      fetchDimensions()
    }, 0)
  }

  const currentBrain = brains.find(b => b.id === currentBrainId)

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="切换大脑">
          <Box
            role="button"
            tabIndex={0}
            aria-label="切换大脑"
            aria-haspopup="true"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnchorEl(e.currentTarget as HTMLElement) } }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.25,
              py: 0.75,
              borderRadius: '8px',
              cursor: 'pointer',
              '&:hover': { bgcolor: `${c.primary}10` },
              border: `1px solid ${c.border}`,
              flex: 1,
              minWidth: 0,
            }}
          >
            <BrainIcon sx={{ fontSize: 18, color: c.primary }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: c.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {loading ? '...' : currentBrain?.name ?? '无大脑'}
            </Typography>
            <ArrowIcon sx={{ fontSize: 18, color: c.textMuted, flexShrink: 0 }} />
          </Box>
        </Tooltip>
        {currentBrain && (
          <Tooltip title="删除当前大脑">
            <IconButton
              size="small"
              onClick={() => setDeleteConfirmId(currentBrainId!)}
              sx={{
                flexShrink: 0,
                color: c.textMuted,
                '&:hover': { color: c.error, bgcolor: `${c.error}10` },
              }}
              aria-label="删除当前大脑"
            >
              <DeleteIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: {
              minWidth: 220,
              maxHeight: 400,
              border: `1px solid ${c.border}`,
              boxShadow: `0 4px 16px ${c.shadow}`,
            },
          },
        }}
      >
        {brains.map((brain) => (
          <MenuItem
            key={brain.id}
            selected={brain.id === currentBrainId}
            onClick={() => handleSelect(brain.id)}
            sx={{ py: 1 }}
          >
            <ListItemIcon>
              <BrainIcon sx={{ fontSize: 20, color: brain.id === currentBrainId ? c.primary : c.textMuted }} />
            </ListItemIcon>
            <ListItemText
              primary={brain.name}
              secondary={brain.description || undefined}
              primaryTypographyProps={{ fontSize: 14, fontWeight: brain.id === currentBrainId ? 600 : 400 }}
              secondaryTypographyProps={{ fontSize: 12 }}
            />
            {brains.length > 1 && (
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(brain.id) }}
                sx={{ ml: 1, color: c.textMuted, '&:hover': { color: c.error } }}
                aria-label="删除大脑"
              >
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </MenuItem>
        ))}

        {brains.length === 0 && (
          <MenuItem disabled>
            <Typography sx={{ fontSize: 13, color: c.textMuted }}>暂无大脑</Typography>
          </MenuItem>
        )}

        <Divider sx={{ my: 0.5 }} />

        <MenuItem onClick={() => { setAnchorEl(null); setCreateOpen(true) }}>
          <ListItemIcon>
            <AddIcon sx={{ fontSize: 20, color: c.primary }} />
          </ListItemIcon>
          <ListItemText primary="创建新大脑" primaryTypographyProps={{ fontSize: 14, color: c.primary }} />
        </MenuItem>
      </Menu>

      {/* 创建大脑 Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => { if (!creating) { setCreateOpen(false); resetCreateForm() } }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 17 }}>创建新大脑</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
          {/* 名称 */}
          <TextField
            label="名称"
            size="small"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例如：工作助手、学习笔记..."
            fullWidth
            autoFocus
            disabled={creating}
          />

          {/* 描述 */}
          <TextField
            label="描述（可选）"
            size="small"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="简要描述这个大脑的用途"
            fullWidth
            disabled={creating}
          />

          {/* 项目目录 */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <FolderIcon sx={{ fontSize: 16, color: c.textMuted }} />
              <Typography sx={{ fontSize: 12, color: c.textSecondary }}>项目目录</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                size="small"
                value={newProjectPath}
                onChange={(e) => setNewProjectPath(e.target.value)}
                placeholder="点击浏览选择目录"
                fullWidth
                disabled={creating}
                sx={{
                  '& .MuiInputBase-input': {
                    fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
                    fontSize: 13,
                  },
                }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={handleOpenDirBrowser}
                disabled={creating}
                sx={{ minWidth: 64, height: 40, flexShrink: 0 }}
              >
                浏览
              </Button>
            </Box>
            <Typography sx={{ fontSize: 11, color: c.textMuted, mt: 0.5 }}>
              关联本地项目目录，大脑将基于此路径进行知识学习
            </Typography>

            {/* 初始化项目结构 */}
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={initProject}
                  onChange={(e) => setInitProject(e.target.checked)}
                  disabled={creating || !newProjectPath.trim()}
                  sx={{ py: 0 }}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <InitIcon sx={{ fontSize: 15, color: newProjectPath.trim() ? c.primary : c.textMuted }} />
                  <Typography sx={{ fontSize: 13, color: newProjectPath.trim() ? c.text : c.textMuted }}>
                    初始化项目结构
                  </Typography>
                </Box>
              }
              sx={{ mt: 0.5, ml: 0 }}
            />
            {initProject && newProjectPath.trim() && (
              <Typography sx={{ fontSize: 11, color: c.textMuted, ml: 3.5 }}>
                AI 将自动分析项目结构并生成知识图谱节点
              </Typography>
            )}
          </Box>

          {/* 性格描述 → AI 生成 */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <AIIcon sx={{ fontSize: 16, color: c.stepLearn }} />
              <Typography sx={{ fontSize: 12, color: c.textSecondary }}>性格描述（AI 生成）</Typography>
            </Box>
            <TextField
              size="small"
              value={personalityText}
              onChange={(e) => setPersonalityText(e.target.value)}
              placeholder="用自然语言描述性格特征，例如：做事严谨认真，喜欢探索新事物，不怕复杂的推理过程"
              fullWidth
              multiline
              rows={3}
              disabled={creating}
            />
            <Typography sx={{ fontSize: 11, color: c.textMuted, mt: 0.5 }}>
              创建后 AI 会自动解析并生成性格维度，也可以留空后手动调整
            </Typography>
          </Box>

          {/* AI 状态提示 */}
          {aiStatus && (
            <Typography sx={{
              fontSize: 13,
              color: aiStatus.includes('失败') ? c.error : c.success,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}>
              {creating && <CircularProgress size={14} sx={{ color: 'inherit' }} />}
              {aiStatus}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => { setCreateOpen(false); resetCreateForm() }}
            size="small"
            disabled={creating}
          >
            取消
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            size="small"
            disabled={!newName.trim() || creating}
            startIcon={creating ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
          >
            {creating ? '创建中...' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 Dialog */}
      <Dialog open={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} maxWidth="xs">
        <DialogTitle sx={{ fontSize: 17 }}>确认删除</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            确定要删除大脑「{brains.find(b => b.id === deleteConfirmId)?.name}」吗？所有节点、边和性格数据都会被删除。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)} size="small">取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained" size="small">删除</Button>
        </DialogActions>
      </Dialog>

      {/* 目录浏览 Dialog */}
      <Dialog open={dirBrowserOpen} onClose={() => setDirBrowserOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 17, pb: 1 }}>选择项目目录</DialogTitle>
        <DialogContent sx={{ px: 2, pb: 1 }}>
          {/* 面包屑导航 */}
          <Breadcrumbs sx={{ mb: 1.5, fontSize: 13 }}>
            <Link
              component="button"
              underline="hover"
              color="inherit"
              onClick={() => loadDirs()}
              sx={{ fontSize: 13, cursor: 'pointer' }}
            >
              根目录
            </Link>
            {dirCurrent && dirCurrent.split(/[/\\]/).filter(Boolean).map((seg, i, arr) => {
              const fullPath = arr.slice(0, i + 1).join('\\')
              // Windows 驱动器需要加反斜杠
              const navPath = i === 0 && fullPath.endsWith(':') ? fullPath + '\\' : fullPath
              const isLast = i === arr.length - 1
              return isLast ? (
                <Typography key={i} sx={{ fontSize: 13, fontWeight: 600, color: c.primary }}>{seg}</Typography>
              ) : (
                <Link
                  key={i}
                  component="button"
                  underline="hover"
                  color="inherit"
                  onClick={() => loadDirs(navPath)}
                  sx={{ fontSize: 13, cursor: 'pointer' }}
                >
                  {seg}
                </Link>
              )
            })}
          </Breadcrumbs>

          {/* 当前路径 */}
          {dirCurrent && (
            <Box sx={{
              px: 1.5, py: 0.75, mb: 1, borderRadius: 1,
              bgcolor: c.bgInput, fontFamily: 'monospace', fontSize: 12, color: c.textSecondary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {dirCurrent}
            </Box>
          )}

          {/* 目录列表 */}
          <Box sx={{
            border: `1px solid ${c.border}`, borderRadius: 1,
            maxHeight: 320, overflowY: 'auto',
          }}>
            {dirLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : dirList.length === 0 ? (
              <Typography sx={{ py: 2, textAlign: 'center', fontSize: 13, color: c.textMuted }}>
                没有子目录
              </Typography>
            ) : (
              <List dense disablePadding>
                {/* 返回上级 */}
                {dirCurrent && (
                  <ListItemButton
                    onClick={() => {
                      const parent = dirCurrent.replace(/[/\\][^/\\]+[/\\]?$/, '') || ''
                      loadDirs(parent || undefined)
                    }}
                    sx={{ py: 0.75 }}
                  >
                    <FolderIcon sx={{ fontSize: 18, color: c.warning, mr: 1.5 }} />
                    <Typography sx={{ fontSize: 13, color: c.textSecondary }}>..</Typography>
                  </ListItemButton>
                )}
                {dirList.map((dir) => (
                  <ListItemButton
                    key={dir.path}
                    onClick={() => loadDirs(dir.path)}
                    sx={{ py: 0.75 }}
                  >
                    <FolderIcon sx={{ fontSize: 18, color: c.primary, mr: 1.5 }} />
                    <Typography sx={{ fontSize: 13, color: c.text }}>{dir.name}</Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDirBrowserOpen(false)} size="small">取消</Button>
          <Button
            onClick={handleSelectDir}
            variant="contained"
            size="small"
            disabled={!dirCurrent}
          >
            选择此目录
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
