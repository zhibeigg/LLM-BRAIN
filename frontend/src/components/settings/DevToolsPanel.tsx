import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Button, CircularProgress,
  LinearProgress, Alert,
} from '@mui/material'
import {
  Search as SearchIcon,
  FolderOpen as FolderIcon,
  Description as FileIcon,
  Check as CheckIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useColors } from '../../ThemeContext'
import { devToolsApi } from '../../services/api'
import type { DevToolInfo } from '../../types'

const TOOL_ICONS: Record<string, typeof SearchIcon> = {
  ripgrep: SearchIcon,
  fd: FolderIcon,
  bat: FileIcon,
}

export function DevToolsPanel() {
  const c = useColors()
  const [tools, setTools] = useState<DevToolInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTools = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await devToolsApi.getAll()
      setTools(res.tools)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTools() }, [loadTools])

  const handleInstall = async (toolId: string) => {
    setInstalling(toolId)
    setError(null)
    try {
      await devToolsApi.install(toolId)
      await loadTools()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(null)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} sx={{ color: c.primary }} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 13, color: c.textMuted }}>
          安装开发工具以增强 LLM 的编码能力
        </Typography>
        <Button
          size="small"
          startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
          onClick={loadTools}
          sx={{ color: c.textSecondary, textTransform: 'none', fontSize: 12 }}
        >
          刷新
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ fontSize: 12 }}>
          {error}
        </Alert>
      )}

      {tools.map((tool) => {
        const Icon = TOOL_ICONS[tool.id] ?? SearchIcon
        const isInstalling = installing === tool.id

        return (
          <Box
            key={tool.id}
            sx={{
              border: `1px solid ${c.border}`,
              borderRadius: '8px',
              p: 2,
              bgcolor: c.bgCard,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Icon sx={{ fontSize: 20, color: c.toolCoding, mt: 0.25 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: c.text }}>
                    {tool.name}
                  </Typography>
                  <Typography sx={{
                    fontSize: 11,
                    color: c.textMuted,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    v{tool.version}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: c.textSecondary, mb: 1 }}>
                  {tool.description}
                </Typography>
                <Typography sx={{ fontSize: 11, color: c.textMuted, mb: 1 }}>
                  {tool.purpose}
                </Typography>

                {/* 状态 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {tool.installed ? (
                    <>
                      <CheckIcon sx={{ fontSize: 14, color: c.success }} />
                      <Typography sx={{ fontSize: 12, color: c.success }}>
                        已安装{tool.installedVersion ? ` (v${tool.installedVersion})` : ''}
                      </Typography>
                      {tool.path && (
                        <Typography sx={{
                          fontSize: 10,
                          color: c.textMuted,
                          fontFamily: '"JetBrains Mono", monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {tool.path}
                        </Typography>
                      )}
                    </>
                  ) : (
                    <Typography sx={{ fontSize: 12, color: c.textMuted }}>
                      未安装
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* 操作按钮 */}
              <Box sx={{ flexShrink: 0 }}>
                {isInstalling ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                    <CircularProgress size={20} sx={{ color: c.toolCoding }} />
                    <Typography sx={{ fontSize: 10, color: c.textMuted }}>安装中</Typography>
                  </Box>
                ) : tool.installed ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleInstall(tool.id)}
                    sx={{
                      textTransform: 'none',
                      fontSize: 11,
                      borderColor: c.border,
                      color: c.textSecondary,
                      '&:hover': { borderColor: c.toolCoding, color: c.toolCoding },
                    }}
                  >
                    重新安装
                  </Button>
                ) : tool.installMethod === 'npm' ? (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                    onClick={() => handleInstall(tool.id)}
                    sx={{
                      textTransform: 'none',
                      fontSize: 11,
                      bgcolor: c.toolCoding,
                      '&:hover': { bgcolor: c.toolCoding, filter: 'brightness(0.9)' },
                    }}
                  >
                    安装
                  </Button>
                ) : (
                  <Typography sx={{ fontSize: 11, color: c.textMuted, textAlign: 'right', maxWidth: 160 }}>
                    需手动安装
                  </Typography>
                )}
              </Box>
            </Box>

            {/* 安装进度条 */}
            {isInstalling && (
              <LinearProgress
                sx={{
                  mt: 1.5,
                  height: 3,
                  borderRadius: 2,
                  bgcolor: c.bgInput,
                  '& .MuiLinearProgress-bar': { bgcolor: c.toolCoding },
                }}
              />
            )}
          </Box>
        )
      })}
    </Box>
  )
}
