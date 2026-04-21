import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Tabs, Tab,
  IconButton, List, ListItem, ListItemText, ListItemSecondaryAction,
  Select, MenuItem, FormControl, InputLabel, Slider,
  Paper, CircularProgress, Alert, Chip, Snackbar,
  ToggleButtonGroup, ToggleButton, Switch, Divider, LinearProgress,
} from '@mui/material'
import {
  Delete as DeleteIcon, Edit as EditIcon,
  Radar as DetectIcon, Refresh as RefreshIcon,
  Close as CloseIcon,
  DarkMode as DarkModeIcon, LightMode as LightModeIcon,
  Update as UpdateIcon,
} from '@mui/icons-material'
import { llmApi, toolsApi } from '../../services/api'
import type { LLMProvider, LLMRoleConfig, LLMRole, ToolDefinition } from '../../types'
import { LLM_ROLE_LABELS } from '../../types'
import { useColors, useThemeMode } from '../../ThemeContext'
import { useSettingsStore } from '../../stores/settingsStore'
import type { FontFamily, SendKey } from '../../stores/settingsStore'
import type { ExecutionMode } from '../../types'
import { useUpdater } from '../../hooks/useUpdater'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const ALL_ROLES: LLMRole[] = ['leader', 'agent', 'boss', 'evaluator', 'personality_parser']

// 设置选项常量
const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'inter', label: 'Inter' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'system', label: '系统默认' },
]

const EXEC_MODE_OPTIONS: { value: ExecutionMode; label: string; desc: string }[] = [
  { value: 'auto', label: '自动', desc: '全自动执行，无需确认' },
  { value: 'plan', label: '计划', desc: '先生成计划，确认后执行' },
  { value: 'supervised', label: '监督', desc: '每一步都需要确认' },
  { value: 'readonly', label: '只读', desc: '仅展示思考过程，不执行' },
]

/** 更新检查组件 */
function UpdaterSection() {
  const c = useColors()
  const { update, isChecking, isDownloading, downloadProgress, error, checkForUpdates, downloadAndInstall } = useUpdater()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <Alert severity="error" onClose={() => {}}>{error}</Alert>
      )}

      {update ? (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <UpdateIcon sx={{ color: c.primary }} />
            <Typography variant="body1" sx={{ color: c.text, fontWeight: 500 }}>
              发现新版本: {update.latestVersion}
            </Typography>
          </Box>
          {update.body && (
            <Typography variant="body2" sx={{ color: c.textMuted, mb: 2, whiteSpace: 'pre-wrap' }}>
              {update.body}
            </Typography>
          )}
          {isDownloading ? (
            <Box>
              <Typography variant="caption" sx={{ color: c.textMuted, mb: 1, display: 'block' }}>
                下载进度: {Math.round(downloadProgress)}%
              </Typography>
              <LinearProgress variant="determinate" value={downloadProgress} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          ) : (
            <Button variant="contained" onClick={downloadAndInstall} startIcon={<UpdateIcon />}>
              下载并安装更新
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{ color: c.textMuted }}>
            {isChecking ? '正在检查更新...' : '点击按钮检查是否有新版本'}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={checkForUpdates}
            disabled={isChecking}
            startIcon={isChecking ? <CircularProgress size={16} /> : <RefreshIcon />}
          >
            {isChecking ? '检查中...' : '检查更新'}
          </Button>
        </Box>
      )}
    </Box>
  )
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const c = useColors()
  const { mode, setMode } = useThemeMode()
  const settings = useSettingsStore()

  const [tab, setTab] = useState(0)
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [roles, setRoles] = useState<LLMRoleConfig[]>([])
  const [tools, setTools] = useState<ToolDefinition[]>([])

  const [editingProvider, setEditingProvider] = useState<Partial<LLMProvider> | null>(null)
  const [providerForm, setProviderForm] = useState({
    name: '', baseUrl: '', apiKey: '', models: '',
  })

  const [detecting, setDetecting] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const showMessage = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const fetchData = useCallback(async () => {
    try {
      const [p, r, t] = await Promise.all([llmApi.getProviders(), llmApi.getRoles(), toolsApi.getAll()])
      setProviders(p)
      setRoles(r)
      setTools(t)
    } catch (err) {
      console.error('加载设置失败:', err)
    }
  }, [])

  useEffect(() => {
    if (open) fetchData()
  }, [open, fetchData])

  const resetProviderForm = () => {
    setProviderForm({ name: '', baseUrl: '', apiKey: '', models: '' })
    setEditingProvider(null)
  }

  const handleEditProvider = (provider: LLMProvider) => {
    setEditingProvider(provider)
    setProviderForm({
      name: provider.name, baseUrl: provider.baseUrl,
      apiKey: provider.apiKey, models: provider.models.join(', '),
    })
  }

  const handleSaveProvider = async () => {
    if (!providerForm.name.trim() || !providerForm.baseUrl.trim() || !providerForm.apiKey.trim()) {
      showMessage('请填写名称、Base URL 和 API Key', 'error')
      return
    }
    const models = providerForm.models.split(',').map((m) => m.trim()).filter(Boolean)
    const data = {
      name: providerForm.name.trim(), baseUrl: providerForm.baseUrl.trim(),
      apiKey: providerForm.apiKey.trim(), models,
    }
    try {
      if (editingProvider?.id) {
        await llmApi.updateProvider(editingProvider.id, data)
        showMessage('提供商已更新')
      } else {
        await llmApi.createProvider(data)
        showMessage('提供商已添加')
      }
      resetProviderForm()
      await fetchData()
    } catch (err) {
      showMessage(`保存失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleDeleteProvider = async (id: string) => {
    try {
      await llmApi.deleteProvider(id)
      showMessage('提供商已删除')
      await fetchData()
    } catch (err) {
      showMessage(`删除失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleDetectProviderModels = async (providerId: string) => {
    setDetecting(providerId)
    try {
      const result = await llmApi.detectModels(providerId)
      showMessage(`检测到 ${result.count} 个模型`)
      await fetchData()
    } catch (err) {
      showMessage(`检测失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setDetecting(null)
    }
  }

  const handleDetectFormModels = async () => {
    if (!providerForm.baseUrl.trim() || !providerForm.apiKey.trim()) {
      showMessage('请先填写 Base URL 和 API Key', 'error')
      return
    }
    setDetecting('form')
    try {
      const result = await llmApi.detectModelsWithCredentials(
        providerForm.baseUrl.trim(), providerForm.apiKey.trim(),
      )
      setProviderForm((f) => ({ ...f, models: result.models.join(', ') }))
      showMessage(`检测到 ${result.count} 个模型，已自动填入`)
    } catch (err) {
      showMessage(`检测失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setDetecting(null)
    }
  }

  const getRoleConfig = (role: LLMRole): LLMRoleConfig => {
    return roles.find((r) => r.role === role) ?? {
      role, providerId: '', model: '', temperature: 0.7, maxTokens: 4096,
    }
  }

  const handleRoleChange = (role: LLMRole, field: keyof LLMRoleConfig, value: unknown) => {
    const current = getRoleConfig(role)
    const updated = { ...current, [field]: value }
    if (field === 'providerId') updated.model = ''
    setRoles((prev) => {
      const idx = prev.findIndex((r) => r.role === role)
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next }
      return [...prev, updated]
    })
  }

  const handleSaveRoles = async () => {
    try {
      for (const config of roles) {
        if (config.providerId && config.model) await llmApi.setRole(config)
      }
      showMessage('角色配置已保存')
      onClose()
    } catch (err) {
      showMessage(`保存失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const getProviderModels = (providerId: string): string[] => {
    return providers.find((p) => p.id === providerId)?.models ?? []
  }

  /* ── 通用样式 ── */
  /** 分组标题 */
  const groupTitle = (text: string) => (
    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: c.text, mt: 3, mb: 1.5, '&:first-of-type': { mt: 0 } }}>
      {text}
    </Typography>
  )
  /** Switch 行：左标题+描述，右 Switch */
  const switchRow = (
    title: string, desc: string, checked: boolean, onChange: (v: boolean) => void,
  ) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
      <Box sx={{ mr: 2 }}>
        <Typography variant="body2" sx={{ color: c.text, fontWeight: 500 }}>{title}</Typography>
        <Typography variant="caption" sx={{ color: c.textMuted }}>{desc}</Typography>
      </Box>
      <Switch checked={checked} size="small" onChange={(_, v) => onChange(v)}
        sx={{ '& .Mui-checked': { color: c.primary }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: c.primary } }} />
    </Box>
  )
  /** 全宽分段按钮样式 */
  const segBtnSx = {
    width: '100%',
    '& .MuiToggleButton-root': {
      flex: 1, py: 1.2, textTransform: 'none' as const, fontWeight: 500, fontSize: 14,
      color: c.textSecondary, borderColor: c.border,
      '&.Mui-selected': {
        zIndex: 1,
        bgcolor: `${c.primary}15`, color: c.primary, borderColor: c.primary,
        '&:hover': { bgcolor: `${c.primary}20` },
      },
      '&:hover': { bgcolor: c.bgHover },
    },
  }

  /** 更新检查组件（已移至文件顶层） */

  /** 技术栈项 */
  function TechItem({ label, value }: { label: string; value: string }) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: c.textMuted }}>{label}</Typography>
        <Typography variant="body2" sx={{ color: c.text, fontWeight: 500 }}>{value}</Typography>
      </Box>
    )
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen
        PaperProps={{ sx: { bgcolor: c.bg, backgroundImage: 'none' } }}>
        <DialogTitle sx={{
          borderBottom: `1px solid ${c.border}`, bgcolor: c.bgPanel,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: c.text }}>系统设置</Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: c.textMuted }} aria-label="关闭设置"><CloseIcon /></IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: `1px solid ${c.border}`, bgcolor: c.bgPanel }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
              sx={{
                px: 3,
                '& .MuiTab-root': { textTransform: 'none', fontWeight: 500, color: c.textMuted },
                '& .Mui-selected': { color: c.primary },
                '& .MuiTabs-indicator': { bgcolor: c.primary },
              }}>
              <Tab label="外观" />
              <Tab label="通用" />
              <Tab label="图谱" />
              <Tab label="执行" />
              <Tab label="LLM 提供商" />
              <Tab label="角色配置" />
              <Tab label="工具" />
              <Tab label="关于" />
            </Tabs>
          </Box>

          <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
            {/* ── Tab 0: 外观 ── */}
            {tab === 0 && (
              <Box>
                {/* 主题 */}
                {groupTitle('主题')}
                <ToggleButtonGroup value={mode} exclusive
                  onChange={(_, v) => { if (v) setMode(v) }} sx={segBtnSx}>
                  <ToggleButton value="dark"><DarkModeIcon sx={{ fontSize: 18, mr: 0.5 }} />深色</ToggleButton>
                  <ToggleButton value="light"><LightModeIcon sx={{ fontSize: 18, mr: 0.5 }} />浅色</ToggleButton>
                </ToggleButtonGroup>

                {/* 字体 */}
                {groupTitle('字体')}
                <ToggleButtonGroup value={settings.fontFamily} exclusive
                  onChange={(_, v) => { if (v) settings.update('fontFamily', v as FontFamily) }} sx={segBtnSx}>
                  {FONT_OPTIONS.map((f) => (
                    <ToggleButton key={f.value} value={f.value}>{f.label}</ToggleButton>
                  ))}
                </ToggleButtonGroup>

                {/* 字体大小 */}
                {groupTitle(`字体大小`)}
                <Box sx={{ px: 1 }}>
                  <Slider
                    value={settings.fontSize}
                    onChange={(_, v) => settings.update('fontSize', v as number)}
                    min={12} max={20} step={1}
                    valueLabelDisplay="auto"
                    marks={[
                      { value: 12, label: '12' }, { value: 14, label: '14' },
                      { value: 16, label: '16' }, { value: 18, label: '18' }, { value: 20, label: '20' },
                    ]}
                    size="small" sx={{ color: c.primary }}
                  />
                </Box>
              </Box>
            )}

            {/* ── Tab 1: 通用 ── */}
            {tab === 1 && (
              <Box>
                {/* 发送方式 */}
                {groupTitle('发送方式')}
                <Typography variant="caption" sx={{ color: c.textMuted, display: 'block', mb: 1 }}>
                  选择聊天输入框中发送消息的方式
                </Typography>
                <ToggleButtonGroup value={settings.sendKey} exclusive
                  onChange={(_, v) => { if (v) settings.update('sendKey', v as SendKey) }} sx={segBtnSx}>
                  <ToggleButton value="enter">Enter 发送</ToggleButton>
                  <ToggleButton value="ctrl+enter">Ctrl+Enter 发送</ToggleButton>
                </ToggleButtonGroup>

                {/* 会话历史 */}
                {groupTitle('会话历史')}
                <Typography variant="caption" sx={{ color: c.textMuted, display: 'block', mb: 1 }}>
                  侧栏中保留的历史会话条数: {settings.messageHistoryLimit}
                </Typography>
                <Box sx={{ px: 1 }}>
                  <Slider
                    value={settings.messageHistoryLimit}
                    onChange={(_, v) => settings.update('messageHistoryLimit', v as number)}
                    min={10} max={200} step={10}
                    valueLabelDisplay="auto"
                    marks={[
                      { value: 10, label: '10' }, { value: 50, label: '50' },
                      { value: 100, label: '100' }, { value: 200, label: '200' },
                    ]}
                    size="small" sx={{ color: c.primary }}
                  />
                </Box>
              </Box>
            )}

            {/* ── Tab 2: 图谱 ── */}
            {tab === 2 && (
              <Box>
                {groupTitle('画布')}
                {switchRow('显示小地图', '在画布右下角显示缩略导航', settings.showMinimap,
                  (v) => settings.update('showMinimap', v))}
                {switchRow('对齐网格', '拖拽节点时自动吸附到网格', settings.graphSnapToGrid,
                  (v) => settings.update('graphSnapToGrid', v))}
                {switchRow('边动画', '连接线上显示流动动画效果', settings.graphAnimateEdges,
                  (v) => settings.update('graphAnimateEdges', v))}
              </Box>
            )}

            {/* ── Tab 3: 执行 ── */}
            {tab === 3 && (
              <Box>
                {/* 默认执行模式 */}
                {groupTitle('默认执行模式')}
                <Typography variant="caption" sx={{ color: c.textMuted, display: 'block', mb: 1 }}>
                  新任务启动时使用的执行模式
                </Typography>
                <ToggleButtonGroup value={settings.defaultExecutionMode} exclusive
                  onChange={(_, v) => { if (v) settings.update('defaultExecutionMode', v as ExecutionMode) }} sx={segBtnSx}>
                  {EXEC_MODE_OPTIONS.map((opt) => (
                    <ToggleButton key={opt.value} value={opt.value}>{opt.label}</ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Box sx={{ mt: 0.5, display: 'flex', gap: 2 }}>
                  {EXEC_MODE_OPTIONS.map((opt) => (
                    <Typography key={opt.value} variant="caption" sx={{ flex: 1, textAlign: 'center', color: c.textMuted }}>
                      {opt.desc}
                    </Typography>
                  ))}
                </Box>

                {/* 审查 & 重试 */}
                {groupTitle('审查与重试')}
                {switchRow('默认开启自动审查',
                  'Leader 决策后自动由 Boss 审查，无需手动触发',
                  settings.defaultAutoReview,
                  (v) => settings.update('defaultAutoReview', v))}

                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ color: c.text, fontWeight: 500, mb: 0.5 }}>
                    最大重试次数: {settings.maxRetries}
                  </Typography>
                  <Typography variant="caption" sx={{ color: c.textMuted, display: 'block', mb: 1 }}>
                    任务执行失败后的最大重试次数
                  </Typography>
                  <Box sx={{ px: 1 }}>
                    <Slider
                      value={settings.maxRetries}
                      onChange={(_, v) => settings.update('maxRetries', v as number)}
                      min={1} max={10} step={1}
                      valueLabelDisplay="auto"
                      marks={[
                        { value: 1, label: '1' }, { value: 3, label: '3' },
                        { value: 5, label: '5' }, { value: 10, label: '10' },
                      ]}
                      size="small" sx={{ color: c.primary }}
                    />
                  </Box>
                </Box>
              </Box>
            )}

            {/* ── Tab 4: LLM 提供商 ── */}
            {tab === 4 && (
              <Box>
                <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: c.bgCard, border: `1px solid ${c.border}` }}>
                  <Typography variant="subtitle2" sx={{ mb: 2, color: c.textMuted }}>
                    {editingProvider?.id ? '编辑提供商' : '添加提供商'}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="名称" size="small" value={providerForm.name}
                      onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="OpenAI / Claude / DeepSeek ..." fullWidth />
                    <TextField label="Base URL" size="small" value={providerForm.baseUrl}
                      onChange={(e) => setProviderForm((f) => ({ ...f, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1" fullWidth />
                    <TextField label="API Key" size="small" type="password" value={providerForm.apiKey}
                      onChange={(e) => setProviderForm((f) => ({ ...f, apiKey: e.target.value }))} fullWidth />
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <TextField label="模型列表（逗号分隔，或点击自动检测）" size="small"
                        value={providerForm.models}
                        onChange={(e) => setProviderForm((f) => ({ ...f, models: e.target.value }))}
                        placeholder="gpt-4o, gpt-4o-mini ..." fullWidth multiline minRows={1} maxRows={4} />
                      <Button variant="outlined" size="small" onClick={handleDetectFormModels}
                        disabled={detecting === 'form'}
                        startIcon={detecting === 'form' ? <CircularProgress size={16} /> : <DetectIcon />}
                        sx={{ minWidth: 120, height: 40, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {detecting === 'form' ? '检测中...' : '自动检测'}
                      </Button>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button variant="contained" size="small" onClick={handleSaveProvider}>
                        {editingProvider?.id ? '更新' : '添加'}
                      </Button>
                      {editingProvider && (
                        <Button variant="outlined" size="small" onClick={resetProviderForm}>取消</Button>
                      )}
                    </Box>
                  </Box>
                </Paper>

                <List disablePadding>
                  {providers.map((provider) => (
                    <Paper key={provider.id} elevation={0}
                      sx={{ mb: 1.5, bgcolor: c.bgCard, border: `1px solid ${c.border}` }}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body1" sx={{ fontWeight: 500, color: c.text }}>
                                {provider.name}
                              </Typography>
                              <Chip label={`${provider.models.length} 个模型`} size="small"
                                sx={{
                                  height: 22, fontSize: 12,
                                  bgcolor: provider.models.length > 0 ? `${c.primary}15` : `${c.error}15`,
                                  color: provider.models.length > 0 ? c.primary : c.error,
                                  border: `1px solid ${provider.models.length > 0 ? `${c.primary}30` : `${c.error}30`}`,
                                }} />
                            </Box>
                          }
                          secondary={
                            <Box component="span">
                              <Typography variant="caption" sx={{ color: c.textMuted }}>
                                {provider.baseUrl}
                              </Typography>
                              {provider.models.length > 0 && (
                                <>
                                  <br />
                                  <Typography variant="caption" sx={{ color: c.textMuted }}>
                                    {provider.models.slice(0, 5).join(', ')}
                                    {provider.models.length > 5 && ` ... 等 ${provider.models.length} 个`}
                                  </Typography>
                                </>
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton size="small" onClick={() => handleDetectProviderModels(provider.id)}
                            disabled={detecting === provider.id} sx={{ color: c.primary }} title="自动检测模型" aria-label="自动检测模型">
                            {detecting === provider.id ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                          </IconButton>
                          <IconButton size="small" onClick={() => handleEditProvider(provider)} sx={{ color: c.textMuted }} aria-label="编辑提供商">
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteProvider(provider.id)} sx={{ color: c.error }} aria-label="删除提供商">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    </Paper>
                  ))}
                  {providers.length === 0 && (
                    <Alert severity="info">
                      暂无提供商。请填写上方表单添加一个 LLM 提供商（支持 OpenAI 兼容接口）。
                    </Alert>
                  )}
                </List>
              </Box>
            )}

            {/* ── Tab 5: 角色配置 ── */}
            {tab === 5 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {providers.length === 0 && (
                  <Alert severity="warning">
                    请先在"LLM 提供商"标签页中添加至少一个提供商。
                  </Alert>
                )}
                {ALL_ROLES.map((role) => {
                  const config = getRoleConfig(role)
                  const models = getProviderModels(config.providerId)
                  return (
                    <Paper key={role} elevation={0}
                      sx={{ p: 2.5, bgcolor: c.bgCard, border: `1px solid ${c.border}` }}>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: c.text }}>
                        {LLM_ROLE_LABELS[role]}
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>提供商</InputLabel>
                          <Select value={config.providerId} label="提供商"
                            onChange={(e) => handleRoleChange(role, 'providerId', e.target.value)}>
                            {providers.map((p) => (
                              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                          <InputLabel>模型</InputLabel>
                          <Select value={config.model} label="模型"
                            onChange={(e) => handleRoleChange(role, 'model', e.target.value)}
                            disabled={!config.providerId}>
                            {models.map((m) => (
                              <MenuItem key={m} value={m}>{m}</MenuItem>
                            ))}
                            {models.length === 0 && config.providerId && (
                              <MenuItem disabled>
                                <Typography variant="caption" sx={{ color: c.textMuted }}>
                                  无模型，请先检测
                                </Typography>
                              </MenuItem>
                            )}
                          </Select>
                        </FormControl>
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: c.textMuted }}>
                            Temperature: {config.temperature.toFixed(1)}
                          </Typography>
                          <Slider value={config.temperature}
                            onChange={(_, v) => handleRoleChange(role, 'temperature', v as number)}
                            min={0} max={2} step={0.1} size="small" sx={{ color: c.primary }} />
                        </Box>
                        <TextField label="Max Tokens" type="number" size="small"
                          value={config.maxTokens}
                          onChange={(e) => handleRoleChange(role, 'maxTokens', parseInt(e.target.value) || 0)}
                          fullWidth />
                      </Box>
                    </Paper>
                  )
                })}
              </Box>
            )}

            {/* ── Tab 6: 工具 ── */}
            {tab === 6 && (
              <Box>
                {groupTitle('Agent 工具')}
                <Typography variant="caption" sx={{ color: c.textMuted, display: 'block', mb: 2 }}>
                  启用后，Agent 在执行任务时可以调用这些工具获取信息或执行操作。
                </Typography>

                {tools.length === 0 ? (
                  <Alert severity="info">正在加载工具列表...</Alert>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {tools.map((tool, idx) => (
                      <Box key={tool.id}>
                        {idx > 0 && <Divider sx={{ borderColor: c.border }} />}
                        <Box sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          py: 1.5, px: 2,
                          border: `1px solid ${c.border}`,
                          borderTop: idx === 0 ? undefined : 'none',
                          borderRadius: idx === 0 ? '8px 8px 0 0' : idx === tools.length - 1 ? '0 0 8px 8px' : 0,
                          bgcolor: c.bgCard,
                        }}>
                          <Box sx={{ mr: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                              <Typography variant="body2" sx={{ color: c.text, fontWeight: 600 }}>
                                {tool.name}
                              </Typography>
                              <Chip label={tool.id} size="small" sx={{
                                height: 20, fontSize: 11, fontFamily: 'monospace',
                                bgcolor: `${c.primary}15`, color: c.primary,
                                border: `1px solid ${c.primary}30`,
                              }} />
                            </Box>
                            <Typography variant="caption" sx={{ color: c.textMuted }}>
                              {tool.description}
                            </Typography>
                          </Box>
                          <Switch
                            checked={settings.enabledTools.includes(tool.id)}
                            onChange={() => settings.toggleTool(tool.id)}
                            size="small"
                            sx={{
                              '& .Mui-checked': { color: c.primary },
                              '& .Mui-checked + .MuiSwitch-track': { bgcolor: c.primary },
                            }}
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {/* ── Tab 7: 关于 ── */}
            {tab === 7 && (
              <Box>
                <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: c.bgCard, border: `1px solid ${c.border}`, textAlign: 'center' }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: c.text, mb: 1 }}>
                    LLM-BRAIN
                  </Typography>
                  <Typography variant="body2" sx={{ color: c.textMuted, mb: 2 }}>
                    有向记忆图 + 多角色 LLM 类脑智能体系统
                  </Typography>
                  <Chip label={`v0.1.0`} size="small" sx={{
                    bgcolor: `${c.primary}15`, color: c.primary,
                    border: `1px solid ${c.primary}30`,
                  }} />
                </Paper>

                {groupTitle('检查更新')}
                <Paper elevation={0} sx={{ p: 2.5, bgcolor: c.bgCard, border: `1px solid ${c.border}` }}>
                  <UpdaterSection />
                </Paper>

                {groupTitle('技术栈')}
                <Paper elevation={0} sx={{ p: 2.5, bgcolor: c.bgCard, border: `1px solid ${c.border}` }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TechItem label="前端框架" value="React 19" />
                    <TechItem label="UI 组件库" value="MUI 7" />
                    <TechItem label="桌面框架" value="Tauri 2" />
                    <TechItem label="图谱引擎" value="@xyflow/react" />
                    <TechItem label="状态管理" value="Zustand 5" />
                    <TechItem label="打包工具" value="Vite 8" />
                  </Box>
                </Paper>
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ borderTop: `1px solid ${c.border}`, px: 3, py: 1.5, bgcolor: c.bgPanel }}>
          <Button onClick={onClose} variant="outlined" size="small">关闭</Button>
          <Button onClick={handleSaveRoles} variant="contained" size="small">保存</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
