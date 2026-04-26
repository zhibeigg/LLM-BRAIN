import type { ToolDefinition, ToolResult, ToolContext } from '../types/index.js'
import type { OpenAIToolDef } from '../llm/providers/base.js'
import { executeWebSearch } from './implementations/web-search.js'
import { executeUrlReader } from './implementations/url-reader.js'
import { executeCode } from './implementations/code-executor.js'
import { executeMemorySearch } from './implementations/memory-search.js'
import { executeMemoryWrite } from './implementations/memory-write.js'
import { executeCalculator } from './implementations/calculator.js'
import { executeTerminal } from './implementations/terminal.js'
import { executeShareFile } from './implementations/share-file.js'
import { executeBrowser } from './implementations/browser.js'
import { executeNodeEdit, executeNodeDelete, executeNodeList } from './implementations/node-control.js'
import { executeFileRead } from './implementations/file-read.js'
import { executeFileWrite } from './implementations/file-write.js'
import { executeFileEdit } from './implementations/file-edit.js'
import { executeFileSearch } from './implementations/file-search.js'
import { executeFileGlob } from './implementations/file-glob.js'
import { executeFileList } from './implementations/file-list.js'

// ── 工具定义 ──

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: 'web_search',
    name: '网页搜索',
    description: '搜索互联网获取实时信息',
    category: 'search',
    defaultEnabled: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '最大结果数量（默认 5）' },
      },
      required: ['query'],
    },
  },
  {
    id: 'url_reader',
    name: '网页读取',
    description: '读取指定 URL 的网页内容并提取纯文本',
    category: 'search',
    defaultEnabled: true,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要读取的网页 URL' },
        maxLength: { type: 'number', description: '最大返回字符数（默认 5000）' },
      },
      required: ['url'],
    },
  },
  {
    id: 'code_executor',
    name: '代码执行',
    description: '在安全沙箱中执行 JavaScript 代码',
    category: 'code',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的 JavaScript 代码' },
        language: { type: 'string', description: '编程语言（目前仅支持 javascript）', enum: ['javascript'] },
      },
      required: ['code'],
    },
  },
  {
    id: 'memory_search',
    name: '记忆搜索',
    description: '在当前大脑的记忆图谱中搜索相关节点',
    category: 'memory',
    defaultEnabled: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '最大结果数量（默认 5）' },
      },
      required: ['query'],
    },
  },
  {
    id: 'memory_write',
    name: '记忆写入',
    description: '向当前大脑的记忆图谱中添加新的记忆节点',
    category: 'memory',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '节点标题' },
        content: { type: 'string', description: '节点内容' },
        tags: { type: 'string', description: '标签（逗号分隔）' },
      },
      required: ['title', 'content'],
    },
  },
  {
    id: 'calculator',
    name: '计算器',
    description: '执行数学计算和表达式求值',
    category: 'utility',
    defaultEnabled: true,
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '数学表达式，如 "2 * 3 + sqrt(16)"' },
      },
      required: ['expression'],
    },
  },
  {
    id: 'terminal',
    name: '终端',
    description: '在项目目录中执行 Shell 命令（支持管道、重定向等完整 shell 语法）',
    category: 'code',
    defaultEnabled: true,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 Shell 命令（支持管道、重定向等）' },
        timeout: { type: 'number', description: '超时时间（毫秒，默认 30000，最大 60000）' },
      },
      required: ['command'],
    },
  },
  {
    id: 'share_file',
    name: '文件分享',
    description: '分享文件或文本内容，生成临时下载链接',
    category: 'utility',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要分享的文件路径' },
        content: { type: 'string', description: '要分享的文本内容（与 path 二选一）' },
        fileName: { type: 'string', description: '文件名（仅 content 模式使用）' },
        expiresInMinutes: { type: 'number', description: '有效期（分钟，默认 60，最大 1440）' },
      },
    },
  },
  {
    id: 'browser',
    name: '浏览器',
    description: '交互式浏览器 — 导航网页、提取文本、获取链接',
    category: 'search',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作类型', enum: ['navigate', 'get_text', 'get_links'] },
        url: { type: 'string', description: '目标 URL' },
        maxLength: { type: 'number', description: '最大返回字符数（默认 5000）' },
      },
      required: ['action', 'url'],
    },
  },
  {
    id: 'node_edit',
    name: '节点编辑',
    description: '修改记忆节点的标题、内容、标签或置信度',
    category: 'memory',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要编辑的节点 ID' },
        title: { type: 'string', description: '新标题' },
        content: { type: 'string', description: '新内容' },
        tags: { type: 'string', description: '新标签（JSON 数组格式）' },
        confidence: { type: 'number', description: '新置信度（0-1）' },
      },
      required: ['nodeId'],
    },
  },
  {
    id: 'node_delete',
    name: '节点删除',
    description: '删除记忆节点 — 支持按 ID、关键词或清除全部',
    category: 'memory',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要删除的节点 ID' },
        query: { type: 'string', description: '按关键词匹配并删除' },
        deleteAll: { type: 'boolean', description: '设为 true 清除当前大脑所有节点' },
      },
    },
  },
  {
    id: 'node_list',
    name: '节点列表',
    description: '列出当前大脑的所有记忆节点概要',
    category: 'memory',
    defaultEnabled: true,
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '按类型过滤', enum: ['personality', 'memory'] },
        limit: { type: 'number', description: '最大返回数量（默认 20）' },
      },
    },
  },
  // ── Coding 工具 ──
  {
    id: 'file_read',
    name: '文件读取',
    description: '读取项目文件内容，支持指定行范围',
    category: 'coding',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（相对于项目目录）' },
        startLine: { type: 'number', description: '起始行号（从 1 开始）' },
        endLine: { type: 'number', description: '结束行号' },
      },
      required: ['path'],
    },
  },
  {
    id: 'file_write',
    name: '文件写入',
    description: '创建或覆盖项目文件，覆盖前自动备份',
    category: 'coding',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（相对于项目目录）' },
        content: { type: 'string', description: '文件内容' },
      },
      required: ['path', 'content'],
    },
  },
  {
    id: 'file_edit',
    name: '文件编辑',
    description: '精确字符串替换编辑文件，编辑前自动备份',
    category: 'coding',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（相对于项目目录）' },
        old_string: { type: 'string', description: '要替换的原始文本' },
        new_string: { type: 'string', description: '替换后的新文本' },
        replace_all: { type: 'boolean', description: '是否替换所有匹配（默认仅替换第一个）' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    id: 'file_search',
    name: '代码搜索',
    description: '在项目中搜索代码，支持正则表达式（优先使用 ripgrep）',
    category: 'coding',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索模式（支持正则表达式）' },
        path: { type: 'string', description: '搜索目录（相对于项目目录，默认整个项目）' },
        glob: { type: 'string', description: '文件过滤模式，如 "*.ts" 或 "*.{js,jsx}"' },
        max_results: { type: 'number', description: '最大结果数量（默认 30，最大 50）' },
      },
      required: ['pattern'],
    },
  },
  {
    id: 'file_glob',
    name: '文件查找',
    description: '按文件名模式查找文件（支持 * 和 ** 通配符）',
    category: 'coding',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '文件名模式，如 "**/*.ts" 或 "src/**/*.tsx"' },
        path: { type: 'string', description: '搜索目录（相对于项目目录，默认整个项目）' },
      },
      required: ['pattern'],
    },
  },
  {
    id: 'file_list',
    name: '目录列表',
    description: '以 tree 风格展示项目目录结构',
    category: 'coding',
    defaultEnabled: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（相对于项目目录，默认项目根目录）' },
        depth: { type: 'number', description: '最大深度（默认 3，最大 6）' },
      },
    },
  },
]

// ── 执行器映射 ──

type ToolExecutor = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>

const EXECUTORS: Record<string, ToolExecutor> = {
  web_search: executeWebSearch as ToolExecutor,
  url_reader: executeUrlReader as ToolExecutor,
  code_executor: executeCode as ToolExecutor,
  memory_search: executeMemorySearch as ToolExecutor,
  memory_write: executeMemoryWrite as ToolExecutor,
  calculator: executeCalculator as ToolExecutor,
  terminal: executeTerminal as ToolExecutor,
  share_file: executeShareFile as ToolExecutor,
  browser: executeBrowser as ToolExecutor,
  node_edit: executeNodeEdit as ToolExecutor,
  node_delete: executeNodeDelete as ToolExecutor,
  node_list: executeNodeList as ToolExecutor,
  file_read: executeFileRead as ToolExecutor,
  file_write: executeFileWrite as ToolExecutor,
  file_edit: executeFileEdit as ToolExecutor,
  file_search: executeFileSearch as ToolExecutor,
  file_glob: executeFileGlob as ToolExecutor,
  file_list: executeFileList as ToolExecutor,
}

// ── 公开 API ──

/** 获取所有工具定义 */
export function getAllTools(): ToolDefinition[] {
  return TOOL_DEFINITIONS
}

/** 根据 ID 获取工具定义 */
export function getToolById(id: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find(t => t.id === id)
}

/** 根据启用的工具 ID 列表，生成 OpenAI tools 参数 */
export function buildOpenAITools(enabledIds: string[]): OpenAIToolDef[] {
  const enabled = new Set(enabledIds)
  return TOOL_DEFINITIONS
    .filter(t => enabled.has(t.id))
    .map(t => ({
      type: 'function' as const,
      function: {
        name: t.id,
        description: t.description,
        parameters: t.parameters as unknown as Record<string, unknown>,
      },
    }))
}

/** 执行工具调用 */
export async function executeTool(
  toolId: string,
  argsJson: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const executor = EXECUTORS[toolId]
  if (!executor) {
    return { success: false, output: '', error: `未知工具: ${toolId}` }
  }

  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson)
  } catch {
    return { success: false, output: '', error: `工具参数 JSON 解析失败` }
  }

  return executor(args, ctx)
}
