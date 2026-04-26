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
  textMuted: '#8A8A94',     // 注释灰（提升对比度至 ~5.0:1，满足 WCAG AA）
  textDim: '#5A5A64',       // 极淡辅助文本（仅用于装饰性/非关键信息）
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

  // 语义色 — 步骤类型
  stepLeader: '#A78BFA',     // Leader 思考/决策
  stepAgent: '#4ADE80',      // Agent 输出
  stepBoss: '#FBBF24',       // Boss 评审
  stepLearn: '#C084FC',      // 知识学习
  stepTool: '#F59E0B',       // 工具调用

  // 语义色 — 难度
  diffEasy: '#4ADE80',       // 低难度（绿）
  diffMedium: '#FBBF24',     // 中难度（黄）
  diffHard: '#EF4444',       // 高难度（红）

  // 语义色 — 工具类别
  toolSearch: '#5B8DEF',     // 搜索类
  toolCode: '#4ADE80',       // 代码类
  toolMemory: '#C084FC',     // 记忆类
  toolUtility: '#F59E0B',    // 工具类

  // 语义色 — 卡片/面板内部
  cardToolBg: '#18191C',     // 工具卡片背景
  cardToolText: '#D1D3DA',   // 工具卡片文本
  cardAgentBg: '#0E0F10',    // Agent 卡片背景
  cardAgentHeaderBg: '#1A1C1A', // Agent 卡片头部背景
  cardAgentHeaderHover: '#252825', // Agent 卡片头部 hover

  // 语义色 — hover 状态
  successHover: '#3DA05E',   // 成功按钮 hover
  errorHover: '#D04050',     // 错误按钮 hover
  warningHover: '#D0A840',   // 警告按钮 hover

  // 语义色 — Coding 工具
  toolCoding: '#38BDF8',     // 编码工具主色（天蓝）
  diffAdd: '#1A2E1A',        // diff 增加行背景
  diffAddText: '#6EE7A0',    // diff 增加行文字
  diffRemove: '#2E1A1A',     // diff 删除行背景
  diffRemoveText: '#FCA5A5', // diff 删除行文字
  diffLineNum: '#6A6A74',    // diff 行号
  terminalBg: '#0C0C10',     // 终端输出背景
  terminalText: '#6EE7A0',   // 终端输出文字
  filePathText: '#7DD3FC',   // 文件路径文字色
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
  textMuted: '#74747E',     // 注释灰（提升对比度至 ~4.6:1，满足 WCAG AA）
  textDim: '#AEAEB2',       // 极淡辅助文本（仅用于装饰性/非关键信息）
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

  // 语义色 — 步骤类型
  stepLeader: '#7C3AED',
  stepAgent: '#16A34A',
  stepBoss: '#D97706',
  stepLearn: '#9333EA',
  stepTool: '#D97706',

  // 语义色 — 难度
  diffEasy: '#16A34A',
  diffMedium: '#D97706',
  diffHard: '#DC2626',

  // 语义色 — 工具类别
  toolSearch: '#2563EB',
  toolCode: '#16A34A',
  toolMemory: '#9333EA',
  toolUtility: '#D97706',

  // 语义色 — 卡片/面板内部
  cardToolBg: '#F5F5F7',     // 工具卡片背景
  cardToolText: '#1D1D1F',   // 工具卡片文本
  cardAgentBg: '#F5FFF5',    // Agent 卡片背景
  cardAgentHeaderBg: '#F0F5F0', // Agent 卡片头部背景
  cardAgentHeaderHover: '#E5EDE5', // Agent 卡片头部 hover

  // 语义色 — hover 状态
  successHover: '#188844',   // 成功按钮 hover
  errorHover: '#C02035',     // 错误按钮 hover
  warningHover: '#C07000',   // 警告按钮 hover

  // 语义色 — Coding 工具
  toolCoding: '#0284C7',     // 编码工具主色（天蓝）
  diffAdd: '#DCFCE7',        // diff 增加行背景
  diffAddText: '#166534',    // diff 增加行文字
  diffRemove: '#FEE2E2',     // diff 删除行背景
  diffRemoveText: '#991B1B', // diff 删除行文字
  diffLineNum: '#9CA3AF',    // diff 行号
  terminalBg: '#F1F5F9',     // 终端输出背景
  terminalText: '#166534',   // 终端输出文字
  filePathText: '#0369A1',   // 文件路径文字色
}

// ============================================================
// 旧版颜色（保持向后兼容）
// ============================================================

// @deprecated 使用 enhancedDarkColors 代替
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

// @deprecated 使用 enhancedLightColors 代替
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

export type AppColors = typeof enhancedDarkColors
export type EnhancedColors = typeof enhancedDarkColors

// ============================================================
// 颜色获取函数
// ============================================================

export function getColors(mode: ColorMode): AppColors {
  return mode === 'dark' ? enhancedDarkColors : enhancedLightColors
}

export function getEnhancedColors(mode: ColorMode): EnhancedColors {
  return mode === 'dark' ? enhancedDarkColors : enhancedLightColors
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

/** z-index 层级常量 */
export const zIndex = {
  timeline: 1,        // 时间线圆点
  scrollMask: 2,      // 滚动渐变遮罩
  dragHandle: 5,      // 拖拽分割线
  floatingPanel: 10,  // 浮动面板（节点编辑器、边信息面板）
  pwaPrompt: 100,     // PWA 安装提示
} as const
