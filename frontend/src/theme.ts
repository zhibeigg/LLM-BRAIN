import { createTheme } from '@mui/material/styles'

// 深色主题色板
const colors = {
  bg: '#13141f',
  bgPanel: '#191a2a',
  bgCard: '#232438',
  bgInput: '#2a2b45',
  bgHover: '#2f3050',
  border: '#333458',
  borderLight: '#3e3f62',
  primary: '#E8613A',
  primaryLight: '#F28C6A',
  primaryDark: '#C94E2A',
  secondary: '#5B8DEF',
  secondaryLight: '#7BA6F7',
  text: '#E8EAF6',
  textSecondary: '#A0A3BD',
  textMuted: '#6C6F8A',
  success: '#4ADE80',
  error: '#F87171',
  warning: '#FBBF24',
}

export { colors as darkColors }

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.primary,
      light: colors.primaryLight,
      dark: colors.primaryDark,
    },
    secondary: {
      main: colors.secondary,
      light: colors.secondaryLight,
    },
    background: {
      default: colors.bg,
      paper: colors.bg,
    },
    text: {
      primary: colors.text,
      secondary: colors.textSecondary,
    },
    divider: colors.border,
    error: { main: colors.error },
    success: { main: colors.success },
    warning: { main: colors.warning },
  },
  typography: {
    fontFamily: '"Inter", "Noto Sans SC", sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': {
          // 彻底禁用 MUI dark mode 的 elevation overlay
          '--Paper-overlay': 'none !important',
        },
        body: {
          backgroundColor: colors.bg,
          color: colors.text,
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none !important',
          backgroundColor: colors.bgPanel,
          '--Paper-overlay': 'none',
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { height: 4 },
        rail: { backgroundColor: colors.border, opacity: 1 },
        track: { backgroundColor: colors.primary, border: 'none' },
        thumb: {
          backgroundColor: colors.primary,
          border: 'none',
          width: 14,
          height: 14,
          boxShadow: `0 0 8px ${colors.primary}60`,
          '&:hover, &.Mui-focusVisible': {
            boxShadow: `0 0 0 6px ${colors.primary}20`,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: `0 2px 12px ${colors.primary}40`,
          },
        },
        outlined: {
          borderColor: colors.border,
          color: colors.textSecondary,
          '&:hover': {
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}10`,
            color: colors.primary,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: colors.bgInput,
            '& fieldset': { borderColor: colors.border },
            '&:hover fieldset': { borderColor: colors.borderLight },
            '&.Mui-focused fieldset': { borderColor: colors.primary },
          },
          '& .MuiInputLabel-root': { color: colors.textSecondary },
          '& .MuiInputBase-input': { color: colors.text },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.bgCard,
          border: `1px solid ${colors.border}`,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.bgCard,
          border: `1px solid ${colors.border}`,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: colors.bgHover },
          '&.Mui-selected': { backgroundColor: `${colors.primary}15` },
          '&.Mui-selected:hover': { backgroundColor: `${colors.primary}20` },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.bgCard,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          fontSize: 12,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundColor: colors.bgCard,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: colors.bgInput,
          color: colors.textSecondary,
          borderColor: colors.border,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: colors.border,
        },
      },
    },
  },
})
