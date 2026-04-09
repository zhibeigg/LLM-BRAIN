import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // 分析工具
    visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
    // PWA 支持
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'LLM Brain - 智能知识库管理',
        short_name: 'LLMBrain',
        description: 'AI大模型知识库管理系统 - 有向记忆图智能体',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        screenshots: [],
        shortcuts: [
          {
            name: '新建对话',
            short_name: '新建',
            description: '创建新的对话会话',
            url: '/?action=new',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf,eot}'],
        runtimeCaching: [
          // Google Fonts 缓存
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Google Fonts 静态资源
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // API 缓存策略 - NetworkFirst
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5分钟
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 10,
            },
          },
          // 静态资源缓存
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30天
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // CSS 和 JS 缓存
          {
            urlPattern: /\.(?:js|css)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7天
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      // 开发环境禁用 PWA
      devOptions: {
        enabled: false,
      },
      // 构建输出目录
      outDir: 'dist',
      // 是否在每次构建时生成 PWA 文件
      generateSW: true,
      // PWA 更新策略
      refreshRemediation: {
        enabled: true,
        retryStrategy: {
          maxRetries: 3,
          retryInterval: 1000,
        },
      },
    }),
  ],

  // 依赖预构建优化
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
      '@xyflow/react',
      'zustand',
      'react-markdown',
      'remark-gfm',
      'react-syntax-highlighter',
    ],
    exclude: [],
  },

  // 构建配置
  build: {
    // 目标浏览器
    target: 'esnext',
    // 源地图
    sourcemap: false,
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 分块大小警告阈值
    chunkSizeWarningLimit: 500,
    // 压缩方式
    minify: 'terser',
    // terser 压缩配置
    terserOptions: {
      compress: {
        // 删除 console 和 debugger
        drop_console: true,
        drop_debugger: true,
        // 传递参数给 terser
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        // 压缩选项
        passes: 2,
        // 移除未使用的代码
        dead_code: true,
        // 简化条件表达式
        conditionals: true,
        // 移除无效代码
        unused: true,
      },
      format: {
        // 移除注释
        comments: false,
      },
      mangle: {
        // 缩短变量名
        safari10: true,
      },
    },
    // Rollup 输出配置
    rollupOptions: {
      // 输出文件命名
      output: {
        // 分块命名模板
        chunkFileNames: 'assets/js/[name]-[hash].js',
        // 入口文件命名
        entryFileNames: 'assets/js/[name]-[hash].js',
        // 静态资源命名
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        // 手动分块策略（函数形式，处理所有分块）
        manualChunks: (id: string) => {
          // React 核心
          if (id.includes('react-dom') || id.includes('react/jsx-runtime')) {
            return 'react-vendor'
          }
          // MUI UI 库
          if (id.includes('@mui/material') || id.includes('@mui/icons-material')) {
            return 'mui-vendor'
          }
          // Emotion 样式引擎
          if (id.includes('@emotion/react') || id.includes('@emotion/styled')) {
            return 'emotion-vendor'
          }
          // XYFlow 流程图
          if (id.includes('@xyflow/react')) {
            return 'flow-vendor'
          }
          // 状态管理
          if (id.includes('zustand')) {
            return 'state-vendor'
          }
          // Markdown 渲染
          if (id.includes('react-markdown') || id.includes('remark-gfm')) {
            return 'markdown-vendor'
          }
          // 代码高亮
          if (id.includes('react-syntax-highlighter')) {
            return 'syntax-vendor'
          }
          // Flow 节点组件（动态导入）
          if (id.includes('nodes/')) {
            return 'flow-nodes'
          }
        },
      },
    },
  },

  // 开发服务器配置
  server: {
    port: 5173,
    // 启用热更新
    hmr: {
      overlay: true,
    },
    // 代理配置
    proxy: {
      '/api': {
        target: 'http://localhost:3715',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3715',
        ws: true,
      },
    },
  },

  // 预览服务器配置
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3715',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3715',
        ws: true,
      },
    },
  },
})
