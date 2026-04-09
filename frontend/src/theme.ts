import { createTheme, type Theme } from '@mui/material/styles'

export type ColorMode = 'dark' | 'light'

// ============================================================
// 增强版深色主题色板 — Modern Dark Theme
// ============================================================
export const enhancedDarkColors = {
  // 背景层次
  bg: '#0D0D0F',            // 最深底色（图谱画布、全局背景）
  bgPanel: '#16161A',       // 侧栏、工具面板
  bgCard: '#1E1E24',        // 卡片、弹窗、通知
  bgInput: '#28282F',       // 输入框
  bgHover: '#2E3244',       // 选中/hover 状态
  bgActive: '#383B4A',      // 激活状态
  bgOverlay: '#000000A6',   // 遮罩层背景（66% 透明度）

  // 边框层次
  border: '#2A2B32',        // 主边框
  borderLight: '#3A3B45',   // 次要边框
  borderAccent: '#4A7AFF',  // 强调边框（聚焦态）

  // 主色系
  primary: '#5B8DEF',       // 主蓝色（改善对比度）
  primaryLight: '#7BA5F5',  // 亮蓝
  primaryDark: '#4070D0',   // 暗蓝
  primaryGlow: '#5B8DEF40', // 主色发光（25% 透明度）

  // 强调色
  secondary: '#B07AC5',    // 紫粉
  secondaryLight: '#C9A0D4',
  secondaryDark: '#9060A8',

  // 文本颜色（优化对比度）
  text: '#E4E4E8',           // 主文本（原本 #BCBEC4 → 提升至 #E4E4E8）
  textSecondary: '#A8A8B0', // 次要文本（原本 #AAACB2 → 提升至 #A8A8B0）
  textMuted: '#6E6E78',     // 注释灰（原本 #7A7E85 → 提升至 #6E6E78）
  textInverse: '#0D0D0F',   // 反色文本

  // 状态色
  success: '#5DBA7D',       // 成功绿（提升对比度）
  successLight: '#7DD4A0',
  successDark: '#3DA05E',
  error: '#F05A68',         // 错误红（改善对比度）
  errorLight: '#FF7A85',
  errorDark: '#D04050',
  warning: '#F0C85A',       // 警告黄（提升对比度）
  warningLight: '#F5D880',
  warningDark: '#D0A840',
  info: '#5BA8E0',           // 信息蓝
  infoLight: '#80C0F0',
  infoDark: '#4088C0',

  // 特殊效果
  overlay: '#00000099',     // 覆盖层（60% 透明度）
  shadow: '#00000066',     // 阴影色（40% 透明度）
  glow: '#5B8DEF33',       // 发光效果（20% 透明度）
  glowStrong: '#5B8DEF66', // 强发光效果（40% 透明度）
}

// ============================================================
// 增强版浅色主题色板 — Modern Light Theme
// ============================================================
export const enhancedLightColors = {
  // 背景层次
  bg: '#F6F6F9',            // 全局背景
  bgPanel: '#FFFFFF',       // 面板
  bgCard: '#FFFFFF',        // 卡片
  bgInput: '#F0F0F5',       // 输入框
  bgHover: '#E8E8EE',       // hover
  bgActive: '#DCDCE4',     // 激活状态
  bgOverlay: '#FFFFFFCC',   // 遮罩层背景（80% 透明度）

  // 边框层次
  border: '#D8D8E0',        // 主边框
  borderLight: '#E8E8F0',   // 次要边框
  borderAccent: '#4070E0',  // 强调边框（聚焦态）

  // 主色系
  primary: '#2563EB',       // 主蓝色
  primaryLight: '#4B8BFA',  // 亮蓝
  primaryDark: '#1D4ED8',   // 暗蓝
  primaryGlow: '#2563EB30', // 主色发光

  // 强调色
  secondary: '#7C5CD6',     // 紫色
  secondaryLight: '#9B82E8',
  secondaryDark: '#6040B8',

  // 文本颜色（优化对比度）
  text: '#1A1A20',           // 主文本（原本 #1D1D1F → 稍调整）
  textSecondary: '#5A5A66',  // 次要文本（原本 #6E6E73 → 提升对比度）
  textMuted: '#9898A0',     // 注释灰（原本 #AEAEB2 → 提升）
  textInverse: '#FFFFFF',   // 反色文本

  // 状态色
  success: '#22A856',       // 成功绿
  successLight: '#4ACA78',
  successDark: '#188844',
  error: '#E52B42',          // 错误红
  errorLight: '#FF5566',
  errorDark: '#C02035',
  warning: '#E08A00',       // 警告橙
  warningLight: '#F5A820',
  warningDark: '#C07000',
  info: '#2080C0',           // 信息蓝
  infoLight: '#40A0E0',
  infoDark: '#1868A0',

  // 特殊效果
  overlay: '#00000033',     // 覆盖层（20% 透明度）
  shadow: '#0000001A',     // 阴影色（10% 透明度）
  glow: '#2563EB20',       // 发光效果
  glowStrong: '#2563EB40', // 强发光效果
}

// ============================================================
// 旧版颜色（保持向后兼容）
// ============================================================

// 深色主题色板 — JetBrains Islands Dark
export const darkColors = {
  bg: '#101012',
  bgPanel: '#1E1F22',
  bgCard: '#2B2D30',
  bgInput: '#393B40',
  bgHover: '#2e436e',
  border: '#2C2D31',
  borderLight: '#3A3D41',
  primary: '#3474F0',
  primaryLight: '#5DA9FF',
  primaryDark: '#2A5CC0',
  secondary: '#C77DBB',
  secondaryLight: '#D9A0D0',
  text: '#BCBEC4',
  textSecondary: '#AAACB2',
  textMuted: '#7A7E85',
  success: '#6AAB73',
  error: '#F75464',
  warning: '#F2C55C',
}

// 浅色主题色板 — Apple HIG 白色风格
export const lightColors = {
  bg: '#F5F5F7',
  bgPanel: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgInput: '#EBEBF0',
  bgHover: '#E3E3E8',
  border: '#D1D1D6',
  borderLight: '#C6C6CC',
  primary: '#007AFF',
  primaryLight: '#409CFF',
  primaryDark: '#0062CC',
  secondary: '#5856D6',
  secondaryLight: '#7A79E0',
  text: '#1D1D1F',
  textSecondary: '#6E6E73',
  textMuted: '#AEAEB2',
  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',
}

export type AppColors = typeof darkColors
export type EnhancedColors = typeof enhancedDarkColors

// ============================================================
// 颜色获取函数
// ============================================================

export function getColors(mode: ColorMode): AppColors {
  return mode === 'dark' ? darkColors : lightColors
}

export function getEnhancedColors(mode: ColorMode): EnhancedColors {
  return mode === 'dark' ? enhancedDarkColors : enhancedLightColors
}

// ============================================================
// CSS 变量注入
// ============================================================

export function injectCSSVariables(mode: ColorMode): void {
  const colors = getEnhancedColors(mode)
  const root = document.documentElement

  // 背景层次
  root.style.setProperty('--bg', colors.bg)
  root.style.setProperty('--bg-panel', colors.bgPanel)
  root.style.setProperty('--bg-card', colors.bgCard)
  root.style.setProperty('--bg-input', colors.bgInput)
  root.style.setProperty('--bg-hover', colors.bgHover)
  root.style.setProperty('--bg-active', colors.bgActive)
  root.style.setProperty('--bg-overlay', colors.bgOverlay)

  // 边框层次
  root.style.setProperty('--border', colors.border)
  root.style.setProperty('--border-light', colors.borderLight)
  root.style.setProperty('--border-accent', colors.borderAccent)

  // 主色系
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--primary-light', colors.primaryLight)
  root.style.setProperty('--primary-dark', colors.primaryDark)
  root.style.setProperty('--primary-glow', colors.primaryGlow)

  // 强调色
  root.style.setProperty('--secondary', colors.secondary)
  root.style.setProperty('--secondary-light', colors.secondaryLight)

  // 文本颜色
  root.style.setProperty('--text', colors.text)
  root.style.setProperty('--text-secondary', colors.textSecondary)
  root.style.setProperty('--text-muted', colors.textMuted)
  root.style.setProperty('--text-inverse', colors.textInverse)

  // 状态色
  root.style.setProperty('--success', colors.success)
  root.style.setProperty('--success-light', colors.successLight)
  root.style.setProperty('--error', colors.error)
  root.style.setProperty('--error-light', colors.errorLight)
  root.style.setProperty('--warning', colors.warning)
  root.style.setProperty('--warning-light', colors.warningLight)
  root.style.setProperty('--info', colors.info)
  root.style.setProperty('--info-light', colors.infoLight)

  // 特殊效果
  root.style.setProperty('--overlay', colors.overlay)
  root.style.setProperty('--shadow', colors.shadow)
  root.style.setProperty('--glow', colors.glow)
  root.style.setProperty('--glow-strong', colors.glowStrong)

  // 当前颜色模式标识
  root.style.setProperty('--color-mode', mode)

  // 动画相关变量
  root.style.setProperty('--animation-duration-fast', '0.15s')
  root.style.setProperty('--animation-duration-normal', '0.3s')
  root.style.setProperty('--animation-duration-slow', '0.5s')
  root.style.setProperty('--animation-duration-slower', '0.8s')
  root.style.setProperty('--ease-out-expo', 'cubic-bezier(0.16, 1, 0.3, 1)')
  root.style.setProperty('--ease-out-back', 'cubic-bezier(0.34, 1.56, 0.64, 1)')
  root.style.setProperty('--ease-spring', 'cubic-bezier(0.22, 1, 0.36, 1)')
  root.style.setProperty('--pulse-glow-color', colors.primary)
  root.style.setProperty('--pulse-glow-spread', '20px')
}

// ============================================================
// 主题创建函数
// ============================================================

export function createAppTheme(mode: ColorMode, fontFamily?: string): Theme {
  const colors = mode === 'dark' ? enhancedDarkColors : enhancedLightColors

  // 字体系统配置
  const fontFamilies = {
    // 主字体：Space Grotesk（特色现代字体）
    primary: fontFamily ?? '"Space Grotesk", "Inter", "Noto Sans SC", sans-serif',
    // 代码字体：JetBrains Mono
    code: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
  }

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
        dark: colors.secondaryDark,
      },
      background: {
        default: colors.bg,
        paper: colors.bgPanel,
      },
      text: {
        primary: colors.text,
        secondary: colors.textSecondary,
        disabled: colors.textMuted,
      },
      divider: colors.border,
      error: { main: colors.error },
      success: { main: colors.success },
      warning: { main: colors.warning },
      info: { main: colors.info },
    },
    typography: {
      fontFamily: fontFamilies.primary,
      // 标题字体配置
      h1: {
        fontFamily: fontFamilies.primary,
        fontWeight: 700,
        fontSize: '2.5rem',
        lineHeight: 1.2,
        letterSpacing: '-0.02em',
      },
      h2: {
        fontFamily: fontFamilies.primary,
        fontWeight: 700,
        fontSize: '2rem',
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
      },
      h3: {
        fontFamily: fontFamilies.primary,
        fontWeight: 600,
        fontSize: '1.75rem',
        lineHeight: 1.3,
        letterSpacing: '-0.01em',
      },
      h4: {
        fontFamily: fontFamilies.primary,
        fontWeight: 600,
        fontSize: '1.5rem',
        lineHeight: 1.35,
      },
      h5: {
        fontFamily: fontFamilies.primary,
        fontWeight: 600,
        fontSize: '1.25rem',
        lineHeight: 1.4,
      },
      h6: {
        fontFamily: fontFamilies.primary,
        fontWeight: 600,
        fontSize: '1rem',
        lineHeight: 1.5,
      },
      // 正文字体配置
      body1: {
        fontFamily: fontFamilies.primary,
        fontWeight: 400,
        fontSize: '1rem',
        lineHeight: 1.6,
        letterSpacing: '0.01em',
      },
      body2: {
        fontFamily: fontFamilies.primary,
        fontWeight: 400,
        fontSize: '0.875rem',
        lineHeight: 1.57,
        letterSpacing: '0.01em',
      },
      // 特殊字体配置
      button: {
        fontFamily: fontFamilies.primary,
        fontWeight: 500,
        fontSize: '0.875rem',
        lineHeight: 1.5,
        letterSpacing: '0.02em',
        textTransform: 'none',
      },
      caption: {
        fontFamily: fontFamilies.primary,
        fontWeight: 400,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        letterSpacing: '0.03em',
      },
      overline: {
        fontFamily: fontFamilies.primary,
        fontWeight: 600,
        fontSize: '0.625rem',
        lineHeight: 1.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      },
      subtitle1: {
        fontFamily: fontFamilies.primary,
        fontWeight: 500,
        fontSize: '1rem',
        lineHeight: 1.5,
        letterSpacing: '0.01em',
      },
      subtitle2: {
        fontFamily: fontFamilies.primary,
        fontWeight: 500,
        fontSize: '0.875rem',
        lineHeight: 1.5,
        letterSpacing: '0.01em',
      },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*, *::before, *::after': {
            '--Paper-overlay': 'none !important',
          },
          html: {
            fontSize: 16,
            '-webkit-font-smoothing': 'antialiased',
            '-moz-osx-font-smoothing': 'grayscale',
            textRendering: 'optimizeLegibility',
          },
          body: {
            backgroundColor: colors.bg,
            color: colors.text,
            fontFamily: fontFamilies.primary,
            fontWeight: 400,
            lineHeight: 1.6,
            transition: 'background-color 0.3s ease, color 0.3s ease',
          },
          code: {
            fontFamily: fontFamilies.code,
            fontSize: '0.875em',
            fontWeight: 400,
          },
          pre: {
            fontFamily: fontFamilies.code,
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
            border: `1px solid ${colors.border}`,
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
            boxShadow: `0 0 8px ${colors.primaryGlow}`,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0 0 0 6px ${colors.primaryGlow}`,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: `0 4px 16px ${colors.primaryGlow}`,
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
          text: {
            color: colors.textSecondary,
            '&:hover': {
              color: colors.primary,
              backgroundColor: `${colors.primary}08`,
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
              '&.Mui-focused fieldset': { borderColor: colors.borderAccent, borderWidth: 2 },
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
            boxShadow: `0 8px 32px ${colors.shadow}`,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 4px 24px ${colors.shadow}`,
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
            boxShadow: `0 2px 8px ${colors.shadow}`,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
          },
          standardSuccess: { borderLeftColor: colors.success },
          standardError: { borderLeftColor: colors.error },
          standardWarning: { borderLeftColor: colors.warning },
          standardInfo: { borderLeftColor: colors.info },
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
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 2px 12px ${colors.shadow}`,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: colors.bgPanel,
            borderBottom: `1px solid ${colors.border}`,
            color: colors.text,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.bgPanel,
            borderRight: `1px solid ${colors.border}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: colors.bgHover },
            '&.Mui-selected': {
              backgroundColor: `${colors.primary}12`,
              borderLeft: `3px solid ${colors.primary}`,
              '&:hover': { backgroundColor: `${colors.primary}18` },
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: colors.primary,
            height: 3,
            borderRadius: '3px 3px 0 0',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            color: colors.textSecondary,
            '&.Mui-selected': { color: colors.primary },
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            '& .MuiSwitch-switchBase.Mui-checked': {
              color: colors.primary,
              '& + .MuiSwitch-track': {
                backgroundColor: colors.primary,
                opacity: 0.5,
              },
            },
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: colors.border,
            '&.Mui-checked': { color: colors.primary },
          },
        },
      },
      MuiRadio: {
        styleOverrides: {
          root: {
            color: colors.border,
            '&.Mui-checked': { color: colors.primary },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            backgroundColor: colors.bgInput,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: colors.overlay,
          },
        },
      },
    },
  })
}

// 默认导出深色主题（兼容旧引用）
export const theme = createAppTheme('dark')

// 增强版主题导出
export const enhancedDarkTheme = createAppTheme('dark')
export const enhancedLightTheme = createAppTheme('light')
