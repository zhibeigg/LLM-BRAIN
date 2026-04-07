import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Box, Typography } from '@mui/material'
import { useColors, useThemeMode } from '../../ThemeContext'

interface MarkdownRendererProps {
  content: string
  /** 文本颜色，默认跟随主题 */
  color?: string
  fontSize?: number
}

export function MarkdownRenderer({ content, color, fontSize = 13 }: MarkdownRendererProps) {
  const c = useColors()
  const { mode } = useThemeMode()
  const textColor = color ?? c.text
  const codeTheme = mode === 'dark' ? oneDark : oneLight

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
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; node?: unknown }) => {
      const match = /language-(\w+)/.exec(className || '')
      const codeStr = String(children).replace(/\n$/, '')

      if (match) {
        return (
          <Box sx={{ my: 1, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${c.border}`, fontSize: fontSize - 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, bgcolor: c.bgInput, borderBottom: `1px solid ${c.border}` }}>
              <Typography sx={{ fontSize: 11, color: c.textMuted, fontFamily: 'monospace' }}>{match[1]}</Typography>
            </Box>
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

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as never}>
      {content}
    </ReactMarkdown>
  )
}
