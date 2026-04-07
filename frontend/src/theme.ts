import { createTheme, type Theme } from '@mui/material/styles'

export type ColorMode = 'dark' | 'light'

// 深色主题色板 — JetBrains Islands Dark
// 3 层纵深：深底 #101012 → 面板 #1E1F22 → 卡片/输入 #2B2D30
export const darkColors = {
  bg: '#101012',         // 最深底色（图谱画布、全局背景）
  bgPanel: '#1E1F22',    // 侧栏、工具面板
  bgCard: '#2B2D30',     // 卡片、弹窗、通知
  bgInput: '#393B40',    // 输入框
  bgHover: '#2e436e',    // 选中/hover 蓝
  border: '#2C2D31',     // 边框（比面板稍亮）
  borderLight: '#3A3D41', // 次要边框
  primary: '#3474F0',    // Islands 蓝
  primaryLight: '#5DA9FF',
  primaryDark: '#2A5CC0',
  secondary: '#C77DBB',  // 紫粉
  secondaryLight: '#D9A0D0',
  text: '#BCBEC4',       // 主文本
  textSecondary: '#AAACB2', // 次要文本
  textMuted: '#7A7E85',  // 注释灰
  success: '#6AAB73',    // 字符串绿
  error: '#F75464',      // 错误红
  warning: '#F2C55C',    // 警告黄
}

// 浅色主题色板 — Apple HIG 白色风格
// 大面积留白 + 极细边框 + 鲜明的系统蓝
export const lightColors = {
  bg: '#F5F5F7',         // Apple 标准灰白底
  bgPanel: '#FFFFFF',    // 纯白面板
  bgCard: '#FFFFFF',     // 卡片
  bgInput: '#EBEBF0',    // 输入框（比底色深一点点）
  bgHover: '#E3E3E8',    // hover
  border: '#D1D1D6',     // 系统灰边框
  borderLight: '#C6C6CC',
  primary: '#007AFF',    // Apple Blue
  primaryLight: '#409CFF',
  primaryDark: '#0062CC',
  secondary: '#5856D6',  // Apple Indigo
  secondaryLight: '#7A79E0',
  text: '#1D1D1F',       // Apple 标准黑
  textSecondary: '#6E6E73',
  textMuted: '#AEAEB2',
  success: '#34C759',    // Apple Green
  error: '#FF3B30',      // Apple Red
  warning: '#FF9500',    // Apple Orange
}

export type AppColors = typeof darkColors

export function getColors(mode: ColorMode): AppColors {
  return mode === 'dark' ? darkColors : lightColors
}

export function createAppTheme(mode: ColorMode, fontFamily?: string): Theme {
  const colors = getColors(mode)
  const font = fontFamily ?? '"Inter", "Noto Sans SC", sans-serif'

  return createTheme({
    palette: {
      mode,
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
      fontFamily: font,
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*, *::before, *::after': {
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
}

// 默认导出深色主题（兼容旧引用）
export const theme = createAppTheme('dark')
