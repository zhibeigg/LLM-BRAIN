import { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Box, Typography } from '@mui/material'
import { useColors, useThemeMode } from '../../ThemeContext'

// 懒加载代码高亮组件（react-syntax-highlighter 体积较大）
const SyntaxHighlighter = lazy(() =>
  import('react-syntax-highlighter').then(m => ({ default: m.Prism }))
)

// 缓存已加载的主题样式
const themeCache: Record<string, Record<string, React.CSSProperties>> = {}

function useCodeTheme(mode: 'dark' | 'light') {
  const [theme, setTheme] = useState<Record<string, React.CSSProperties> | null>(themeCache[mode] ?? null)

  useEffect(() => {
    if (themeCache[mode]) {
      setTheme(themeCache[mode])
      return
    }
    const loader = mode === 'dark'
      ? import('react-syntax-highlighter/dist/esm/styles/prism/one-dark')
      : import('react-syntax-highlighter/dist/esm/styles/prism/one-light')
    loader.then(m => {
      themeCache[mode] = m.default
      setTheme(m.default)
    })
  }, [mode])

  return theme
}

interface MarkdownRendererProps {
  content: string
  /** 文本颜色，默认跟随主题 */
  color?: string
  fontSize?: number
}

const INLINE_TOOL_TAG_RE = /<(file_list|file_read|file_write|file_edit|file_search|file_glob|terminal|calculator|web_search|url_reader|browser)\b[^<>]*?\/>/g

function sanitizeAgentMarkdown(content: string): string {
  return content.replace(INLINE_TOOL_TAG_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function MarkdownRenderer({ content, color, fontSize = 13 }: MarkdownRendererProps) {
  const c = useColors()
  const { mode } = useThemeMode()
  const textColor = color ?? c.text
  const codeTheme = useCodeTheme(mode)
  const safeContent = useMemo(() => sanitizeAgentMarkdown(content), [content])

  const components = useMemo(() => ({
    // 段落
    p: ({ children }: { children?: React.ReactNode }) => (
      <Typography component="p" sx={{ color: textColor, fontSize, lineHeight: 1.7, mb: 1, '&:last-child': { mb: 0 } }}>
        {children}
      </Typography>
    ),
    // 标题
    h1: ({ children }: { children?: React.ReactNode }) => (
      <Typography component="h3" sx={{ color: textColor, fontSize: fontSize + 3, fontWeight: 700, mt: 1.5, mb: 0.75 }}>{children}</Typography>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <Typography component="h4" sx={{ color: textColor, fontSize: fontSize + 2, fontWeight: 600, mt: 1.5, mb: 0.75 }}>{children}</Typography>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <Typography component="h5" sx={{ color: textColor, fontSize: fontSize + 1, fontWeight: 600, mt: 1, mb: 0.5 }}>{children}</Typography>
    ),
    // 行内代码
    code: ({ className, children }: { className?: string; children?: React.ReactNode; node?: unknown }) => {
      const match = /language-(\w+)/.exec(className || '')
      const codeStr = String(children).replace(/\n$/, '')

      if (match && codeTheme) {
        return (
          <Box sx={{ my: 1, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${c.border}`, fontSize: fontSize - 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, bgcolor: c.bgInput, borderBottom: `1px solid ${c.border}` }}>
              <Typography sx={{ fontSize: 11, color: c.textMuted, fontFamily: 'monospace' }}>{match[1]}</Typography>
            </Box>
            <Suspense fallback={
              <Box component="pre" sx={{ m: 0, p: '12px 14px', bgcolor: c.bgInput, fontSize: fontSize - 1, fontFamily: 'monospace', color: textColor }}>
                {codeStr}
              </Box>
            }>
              <SyntaxHighlighter
                style={codeTheme}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: '12px 14px',
                  background: c.bgInput,
                  fontSize: fontSize - 1,
                }}
              >
                {codeStr}
              </SyntaxHighlighter>
            </Suspense>
          </Box>
        )
      }

      // 代码块但主题未加载 — 显示纯文本
      if (match) {
        return (
          <Box sx={{ my: 1, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${c.border}`, fontSize: fontSize - 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, bgcolor: c.bgInput, borderBottom: `1px solid ${c.border}` }}>
              <Typography sx={{ fontSize: 11, color: c.textMuted, fontFamily: 'monospace' }}>{match[1]}</Typography>
            </Box>
            <Box component="pre" sx={{ m: 0, p: '12px 14px', bgcolor: c.bgInput, fontSize: fontSize - 1, fontFamily: 'monospace', color: textColor, whiteSpace: 'pre-wrap' }}>
              {codeStr}
            </Box>
          </Box>
        )
      }

      return (
        <Typography
          component="code"
          sx={{
            px: 0.6, py: 0.15,
            borderRadius: '4px',
            bgcolor: c.bgInput,
            color: c.primary,
            fontSize: fontSize - 1,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            border: `1px solid ${c.border}`,
          }}
        >
          {children}
        </Typography>
      )
    },
    // 列表
    ul: ({ children }: { children?: React.ReactNode }) => (
      <Box component="ul" sx={{ color: textColor, fontSize, pl: 2.5, my: 0.5, '& li': { mb: 0.3 } }}>{children}</Box>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <Box component="ol" sx={{ color: textColor, fontSize, pl: 2.5, my: 0.5, '& li': { mb: 0.3 } }}>{children}</Box>
    ),
    // 引用
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <Box sx={{ borderLeft: `3px solid ${c.primary}40`, pl: 1.5, my: 1, color: c.textSecondary, fontStyle: 'italic' }}>
        {children}
      </Box>
    ),
    // 链接
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <Typography component="a" href={href} target="_blank" rel="noopener noreferrer" sx={{ color: c.secondary, textDecoration: 'underline', fontSize: 'inherit' }}>
        {children}
      </Typography>
    ),
    // 分割线
    hr: () => <Box component="hr" sx={{ border: 'none', borderTop: `1px solid ${c.border}`, my: 1.5 }} />,
    // 强调
    strong: ({ children }: { children?: React.ReactNode }) => (
      <Typography component="strong" sx={{ fontWeight: 600, color: textColor, fontSize: 'inherit' }}>{children}</Typography>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <Typography component="em" sx={{ fontStyle: 'italic', color: textColor, fontSize: 'inherit' }}>{children}</Typography>
    ),
  }), [textColor, fontSize, c, codeTheme])

  if (!safeContent) return null

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as never}>
      {safeContent}
    </ReactMarkdown>
  )
}
