import { Box, Typography, Button, Paper } from '@mui/material'
import { CloudOff as OfflineIcon, Refresh as RefreshIcon } from '@mui/icons-material'
import { useColors } from '../../ThemeContext'

interface OfflinePageProps {
  onRetry?: () => void
}

/** 离线页面组件 */
export function OfflinePage({ onRetry }: OfflinePageProps) {
  const c = useColors()

  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      window.location.reload()
    }
  }

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: c.bg,
        flexDirection: 'column',
        gap: 3,
        p: 3,
      }}
    >
      <Paper
        sx={{
          p: 4,
          borderRadius: 3,
          textAlign: 'center',
          maxWidth: 400,
          bgcolor: c.bgCard,
          border: `1px solid ${c.border}`,
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            bgcolor: `${c.warning}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3,
          }}
        >
          <OfflineIcon sx={{ fontSize: 40, color: c.warning }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: c.text, mb: 1.5 }}>
          您已离线
        </Typography>
        <Typography variant="body1" sx={{ color: c.textSecondary, mb: 3, lineHeight: 1.7 }}>
          无法连接到服务器，请检查您的网络连接。已缓存的内容仍可访问。
        </Typography>
        <Button
          variant="contained"
          onClick={handleRetry}
          startIcon={<RefreshIcon />}
          sx={{ textTransform: 'none', fontWeight: 600, px: 3 }}
        >
          重试连接
        </Button>
      </Paper>
      <Typography variant="body2" sx={{ color: c.textMuted }}>
        LLM Brain - 智能知识库管理
      </Typography>
    </Box>
  )
}
