import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Tabs, Tab,
  IconButton, List, ListItem, ListItemText, ListItemSecondaryAction,
  Select, MenuItem, FormControl, InputLabel, Slider,
  Paper, CircularProgress, Alert, Chip, Snackbar,
} from '@mui/material'
import {
  Delete as DeleteIcon, Edit as EditIcon,
  Radar as DetectIcon, Refresh as RefreshIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import { llmApi } from '../../services/api'
import type { LLMProvider, LLMRoleConfig, LLMRole } from '../../types'
import { LLM_ROLE_LABELS } from '../../types'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const ALL_ROLES: LLMRole[] = ['leader', 'agent', 'boss', 'evaluator', 'personality_parser']

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [tab, setTab] = useState(0)
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [roles, setRoles] = useState<LLMRoleConfig[]>([])

  const [editingProvider, setEditingProvider] = useState<Partial<LLMProvider> | null>(null)
  const [providerForm, setProviderForm] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    models: '',
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
      const [p, r] = await Promise.all([llmApi.getProviders(), llmApi.getRoles()])
      setProviders(p)
      setRoles(r)
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
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      models: provider.models.join(', '),
    })
  }

  const handleSaveProvider = async () => {
    if (!providerForm.name.trim() || !providerForm.baseUrl.trim() || !providerForm.apiKey.trim()) {
      showMessage('请填写名称、Base URL 和 API Key', 'error')
      return
    }

    const models = providerForm.models
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    const data = {
      name: providerForm.name.trim(),
      baseUrl: providerForm.baseUrl.trim(),
      apiKey: providerForm.apiKey.trim(),
      models,
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
        providerForm.baseUrl.trim(),
        providerForm.apiKey.trim(),
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
    return (
      roles.find((r) => r.role === role) ?? {
        role,
        providerId: '',
        model: '',
        temperature: 0.7,
        maxTokens: 4096,
      }
    )
  }

  const handleRoleChange = (role: LLMRole, field: keyof LLMRoleConfig, value: unknown) => {
    const current = getRoleConfig(role)
    const updated = { ...current, [field]: value }

    if (field === 'providerId') {
      updated.model = ''
    }

    setRoles((prev) => {
      const idx = prev.findIndex((r) => r.role === role)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updated
        return next
      }
      return [...prev, updated]
    })
  }

  const handleSaveRoles = async () => {
    try {
      for (const config of roles) {
        if (config.providerId && config.model) {
          await llmApi.setRole(config)
        }
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

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen
        PaperProps={{
          sx: { bgcolor: '#F8F9FA', backgroundImage: 'none' },
        }}
      >
        <DialogTitle
          sx={{
            borderBottom: '1px solid #E2E8F0',
            bgcolor: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#2D3748' }}>
            系统设置
          </Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: '#718096' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: '1px solid #E2E8F0', bgcolor: '#FFFFFF' }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{
                px: 3,
                '& .MuiTab-root': { textTransform: 'none', fontWeight: 500, color: '#718096' },
                '& .Mui-selected': { color: '#E8613A' },
                '& .MuiTabs-indicator': { bgcolor: '#E8613A' },
              }}
            >
              <Tab label="LLM 提供商" />
              <Tab label="角色配置" />
            </Tabs>
          </Box>

          <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
            {tab === 0 && (
              <Box>
                <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                  <Typography variant="subtitle2" sx={{ mb: 2, color: '#718096' }}>
                    {editingProvider?.id ? '编辑提供商' : '添加提供商'}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="名称"
                      size="small"
                      value={providerForm.name}
                      onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="OpenAI / Claude / DeepSeek ..."
                      fullWidth
                    />
                    <TextField
                      label="Base URL"
                      size="small"
                      value={providerForm.baseUrl}
                      onChange={(e) => setProviderForm((f) => ({ ...f, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                      fullWidth
                    />
                    <TextField
                      label="API Key"
                      size="small"
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(e) => setProviderForm((f) => ({ ...f, apiKey: e.target.value }))}
                      fullWidth
                    />
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <TextField
                        label="模型列表（逗号分隔，或点击自动检测）"
                        size="small"
                        value={providerForm.models}
                        onChange={(e) => setProviderForm((f) => ({ ...f, models: e.target.value }))}
                        placeholder="gpt-4o, gpt-4o-mini ..."
                        fullWidth
                        multiline
                        minRows={1}
                        maxRows={4}
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleDetectFormModels}
                        disabled={detecting === 'form'}
                        startIcon={detecting === 'form' ? <CircularProgress size={16} /> : <DetectIcon />}
                        sx={{
                          minWidth: 120,
                          height: 40,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {detecting === 'form' ? '检测中...' : '自动检测'}
                      </Button>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleSaveProvider}
                      >
                        {editingProvider?.id ? '更新' : '添加'}
                      </Button>
                      {editingProvider && (
                        <Button variant="outlined" size="small" onClick={resetProviderForm}>
                          取消
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Paper>

                <List disablePadding>
                  {providers.map((provider) => (
                    <Paper
                      key={provider.id}
                      elevation={0}
                      sx={{
                        mb: 1.5,
                        bgcolor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                      }}
                    >
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body1" sx={{ fontWeight: 500, color: '#2D3748' }}>
                                {provider.name}
                              </Typography>
                              <Chip
                                label={`${provider.models.length} 个模型`}
                                size="small"
                                sx={{
                                  height: 22,
                                  fontSize: 12,
                                  bgcolor: provider.models.length > 0 ? '#FFF5F0' : '#FFF5F5',
                                  color: provider.models.length > 0 ? '#E8613A' : '#E53E3E',
                                  border: `1px solid ${provider.models.length > 0 ? '#FECACA' : '#FED7D7'}`,
                                }}
                              />
                            </Box>
                          }
                          secondary={
                            <Box component="span">
                              <Typography variant="caption" sx={{ color: '#A0AEC0' }}>
                                {provider.baseUrl}
                              </Typography>
                              {provider.models.length > 0 && (
                                <>
                                  <br />
                                  <Typography variant="caption" sx={{ color: '#A0AEC0' }}>
                                    {provider.models.slice(0, 5).join(', ')}
                                    {provider.models.length > 5 && ` ... 等 ${provider.models.length} 个`}
                                  </Typography>
                                </>
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            size="small"
                            onClick={() => handleDetectProviderModels(provider.id)}
                            disabled={detecting === provider.id}
                            sx={{ color: '#E8613A' }}
                            title="自动检测模型"
                          >
                            {detecting === provider.id ? (
                              <CircularProgress size={18} />
                            ) : (
                              <RefreshIcon fontSize="small" />
                            )}
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleEditProvider(provider)}
                            sx={{ color: '#718096' }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteProvider(provider.id)}
                            sx={{ color: '#E53E3E' }}
                          >
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

            {tab === 1 && (
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
                    <Paper
                      key={role}
                      elevation={0}
                      sx={{ p: 2.5, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0' }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#2D3748' }}>
                        {LLM_ROLE_LABELS[role]}
                      </Typography>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>提供商</InputLabel>
                          <Select
                            value={config.providerId}
                            label="提供商"
                            onChange={(e) => handleRoleChange(role, 'providerId', e.target.value)}
                          >
                            {providers.map((p) => (
                              <MenuItem key={p.id} value={p.id}>
                                {p.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <FormControl size="small" fullWidth>
                          <InputLabel>模型</InputLabel>
                          <Select
                            value={config.model}
                            label="模型"
                            onChange={(e) => handleRoleChange(role, 'model', e.target.value)}
                            disabled={!config.providerId}
                          >
                            {models.map((m) => (
                              <MenuItem key={m} value={m}>
                                {m}
                              </MenuItem>
                            ))}
                            {models.length === 0 && config.providerId && (
                              <MenuItem disabled>
                                <Typography variant="caption" sx={{ color: '#A0AEC0' }}>
                                  无模型，请先检测
                                </Typography>
                              </MenuItem>
                            )}
                          </Select>
                        </FormControl>
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#718096' }}>
                            Temperature: {config.temperature.toFixed(1)}
                          </Typography>
                          <Slider
                            value={config.temperature}
                            onChange={(_, v) => handleRoleChange(role, 'temperature', v as number)}
                            min={0}
                            max={2}
                            step={0.1}
                            size="small"
                            sx={{ color: '#E8613A' }}
                          />
                        </Box>
                        <TextField
                          label="Max Tokens"
                          type="number"
                          size="small"
                          value={config.maxTokens}
                          onChange={(e) =>
                            handleRoleChange(role, 'maxTokens', parseInt(e.target.value) || 0)
                          }
                          fullWidth
                        />
                      </Box>
                    </Paper>
                  )
                })}
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ borderTop: '1px solid #E2E8F0', px: 3, py: 1.5, bgcolor: '#FFFFFF' }}>
          <Button onClick={onClose} variant="outlined" size="small">
            取消
          </Button>
          <Button
            onClick={handleSaveRoles}
            variant="contained"
            size="small"
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
