<div align="center">

# 🧠 LLM-BRAIN

**有向记忆图 + 多角色 LLM 类脑智能体系统**

*Directed Memory Graph + Multi-Role LLM Brain-Like Agent System*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)

[中文](#-核心思想) | [English](#-core-idea)

</div>

---

## 💡 核心思想

用**有向图**模拟大脑的记忆网络 —— 每个节点是一个知识/记忆片段，边代表知识间的依赖关系并携带多维难度信息。系统通过**性格参数**影响路径选择，让同一张图谱在不同"性格"下表现出不同的推理行为。

```
用户提问 → Leader 在图谱中寻路 → 收集路径上的记忆 → Agent 基于记忆回答 → Boss 验证质量
                ↑                                                              ↓
            性格影响路径选择                                              图谱自动进化
```

## ✨ 功能特性

- **多角色 LLM 协作** — Leader 寻路、Agent 执行、Boss 验证、Scholar 学习、Evaluator 评估
- **有向记忆图谱** — 可视化知识网络，节点拖拽编辑，自动布局，视口裁剪与边聚合优化
- **路径回退与重选** — supervised/plan 模式下可随时回退到历史节点重新选择路径，无需从头重来
- **智能知识蒸馏** — 仅在发现新功能/新约束/新知识时创建节点，标题去重防止膨胀
- **性格系统** — 勤快度/探索度/严谨度影响路径选择，支持 AI 自然语言生成
- **知识学习** — 输入主题自动生成知识图谱，Scholar 拆解为结构化 DAG
- **图谱进化** — 任务完成后自动蒸馏新知识，未使用的边每 6 小时自动衰减
- **难度感知** — 6 种难度类型 × 性格维度的 softmax 加权计算
- **实时推送** — WebSocket 实时展示思考过程（Leader 决策 → Agent 输出 → Boss 评审）
- **工具系统** — 18 种内置工具（网页搜索、代码执行、记忆读写、浏览器、文件读写编辑、代码搜索等），Agent 自主调用，结构化可视化展示每次工具调用的参数、结果和耗时
- **Vibe Coding 工作流** — 文件读取/写入/编辑、代码搜索（ripgrep 集成）、文件查找、目录列表，支持 diff 视图和终端风格输出
- **开发工具管理** — 设置中一键安装 ripgrep 等开发工具，增强 LLM 编码能力
- **LLM 容错** — 自动重试（429/5xx）、指数退避、请求超时控制，支持 Retry-After
- **国际化** — 内置中英文双语支持，设置中一键切换
- **用户系统** — JWT 认证，多用户数据隔离
- **会话持久化** — 思考过程完整存储，历史记录可回看，游标分页渐进式滚动加载
- **响应式布局** — 桌面三栏 / 平板两栏 / 移动端 Tab 切换，PWA 支持

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    Tauri 2 桌面壳                      │
├──────────────────────┬──────────────────────────────┤
│      Frontend        │          Backend             │
│                      │                              │
│  React 19 + MUI 7   │   Express + WebSocket        │
│  @xyflow/react       │   SQLite (better-sqlite3)    │
│  Zustand 5           │   OpenAI SDK                 │
│  Vite 8              │                              │
├──────────────────────┴──────────────────────────────┤
│                   LLM Providers                      │
│         (OpenAI / Claude / DeepSeek / ...)           │
└─────────────────────────────────────────────────────┘
```

## 🤖 多角色系统

| 角色 | 职责 | 说明 |
|------|------|------|
| **Leader** | 路径决策 | 在有向图中逐步选择最优路径，基于感知难度和性格阈值过滤候选边 |
| **Agent** | 任务执行 | 接收性格 prompt + 路径记忆上下文，支持工具调用循环（最多 10 轮），流式输出结果 |
| **Boss** | 质量验证 | 客观验证任务完成度，检测死循环，不受性格影响 |
| **Scholar** | 知识学习 | 将学习主题拆解为 3-8 个节点的 DAG 结构 |
| **Evaluator** | 难度评估 | 评估新边的基础难度和 6 种难度类型分布 |
| **PersonalityParser** | 性格解析 | 将自然语言性格描述转换为维度数值 |

### 协作流程

```
1. 加载性格维度 → 计算容忍阈值
2. 从性格节点出发，Leader 循环决策（最多 50 步）：
   获取出边 → 计算感知难度 → 过滤超阈值边 → Leader 选择或停止
   supervised 模式下每步保存快照，用户可回退到任意历史节点重新选择
3. 拼接路径记忆 → 注入性格 prompt → Agent 流式执行（可调用工具）
4. Boss 验证：
   ✅ 通过 → 调低路径难度(×0.95)，智能蒸馏新知识（去重 + 条件过滤）
   ❌ 未通过 → 调高路径难度(×1.1)，最多重试 3 次
```

## 🎭 性格系统

三个内置维度（0.0 ~ 1.0）：

| 维度 | 说明 | 影响 |
|------|------|------|
| **勤快度** | 对复杂路径的容忍程度 | 高 = 愿意走长路径 |
| **探索度** | 对陌生路径的接受程度 | 高 = 愿意尝试新路径 |
| **严谨度** | 对不确定性的容忍程度 | 高 = 只接受高置信度路径 |

容忍阈值公式：`threshold = 0.3 + 0.4 × 勤快度 + 0.2 × 探索度`

支持自定义维度，可通过自然语言描述让 AI 自动生成。

## 📐 难度感知算法

边携带 6 种难度类型：计算密集、推理密集、创意发散、知识检索、分析归纳、综合整合

```
感知难度 = 基础难度 × adjustmentFactor

adjustmentFactor = Σ(softmax归一化的性格调整值 × 类型权重)
                   clamp 到 [0.3, 1.7]
```

## 🚀 快速开始

### 环境要求

- [Bun](https://bun.sh/) >= 1.0（或 Node.js >= 18）

### 安装

```bash
git clone https://github.com/zhibeigg/LLM-BRAIN.git
cd LLM-BRAIN

# 安装依赖
cd backend && bun install && cd ..
cd frontend && bun install && cd ..
```

### 启动开发环境

```bash
# 设置 JWT 密钥（必须）
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# 终端 1：启动后端
cd backend && bun run dev

# 终端 2：启动前端
cd frontend && bun run dev
```

或者使用根目录的并行启动：

```bash
bun install        # 安装根目录依赖（concurrently）
bun run dev        # 同时启动前后端
```

访问 http://localhost:5173

### 首次使用

1. 注册账户
2. 创建大脑（填写名称、项目目录、性格描述）
3. 在设置中配置 LLM 提供商（支持 OpenAI 兼容接口）
4. 配置各角色的模型
5. 输入任务或使用 `/learn <主题>` 命令学习新知识

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2 (Rust) |
| 前端 | React 19 + TypeScript 5.9 + Vite 8 |
| UI | MUI 7 + Emotion |
| 图谱可视化 | @xyflow/react 12 |
| 状态管理 | Zustand 5 |
| 后端 | Express 4 + TypeScript |
| 实时通信 | WebSocket (ws) |
| 数据库 | SQLite (better-sqlite3) |
| LLM | OpenAI SDK 4（兼容任意 OpenAI API 格式） |
| 认证 | JWT (jsonwebtoken + bcryptjs) |
| 国际化 | 内置轻量 i18n（React Context） |
| 测试 | Vitest 4 |
| 包管理 | Bun |

## 📁 项目结构

```
LLM-BRAIN/
├── backend/
│   └── src/
│       ├── api/            # REST API 路由
│       ├── core/           # 核心引擎
│       │   ├── difficulty/  # 难度感知
│       │   ├── evolution/   # 图谱进化（自动衰减调度）
│       │   ├── extraction/  # 知识蒸馏（智能去重）
│       │   ├── learning/    # 学习引擎
│       │   └── personality/ # 性格解析
│       ├── db/             # 数据库层 (SQLite)
│       ├── llm/            # LLM 集成
│       │   ├── orchestrator/ # 多角色编排器
│       │   ├── providers/   # 提供商适配（重试 + 超时）
│       │   └── roles/       # 6 个角色定义
│       ├── tools/          # 工具系统 (12 种工具)
│       ├── middleware/     # JWT 认证中间件
│       ├── ws/             # WebSocket 服务
│       └── index.ts        # 入口
├── frontend/
│   └── src/
│       ├── components/     # UI 组件
│       │   ├── auth/        # 登录注册
│       │   ├── brain/       # 大脑选择器
│       │   ├── chat/        # 聊天输入
│       │   ├── editor/      # 节点编辑器
│       │   ├── graph/       # 图谱画布（视口裁剪 + 边聚合）
│       │   ├── personality/ # 性格面板
│       │   ├── settings/    # 设置对话框
│       │   └── thinking/    # 思考过程面板
│       ├── hooks/          # WebSocket hook
│       ├── i18n/           # 国际化（中/英）
│       ├── services/       # API + WebSocket 客户端
│       ├── stores/         # Zustand 状态管理
│       ├── workers/        # Web Worker（力导向布局）
│       └── types/          # TypeScript 类型
└── src-tauri/              # Tauri 桌面壳配置
```

## 📄 License

MIT

---

<div align="center">

# 🧠 LLM-BRAIN

**Directed Memory Graph + Multi-Role LLM Brain-Like Agent System**

[中文](#-核心思想) | [English](#-core-idea)

</div>

---

## 💡 Core Idea

Simulate the brain's memory network using a **directed graph** — each node is a knowledge/memory fragment, edges represent dependencies between knowledge and carry multi-dimensional difficulty information. The system uses **personality parameters** to influence path selection, making the same graph exhibit different reasoning behaviors under different "personalities".

```
User Query → Leader pathfinds in graph → Collect memories along path → Agent answers based on memories → Boss verifies quality
                  ↑                                                                                        ↓
          Personality influences path                                                              Graph auto-evolves
```

## ✨ Features

- **Multi-Role LLM Collaboration** — Leader pathfinds, Agent executes, Boss verifies, Scholar learns, Evaluator assesses
- **Directed Memory Graph** — Visual knowledge network with drag-and-drop editing, auto-layout, viewport culling & edge aggregation
- **Path Backtrack & Re-select** — Return to any historical node and re-select path in supervised/plan mode, no need to restart from scratch
- **Smart Knowledge Distillation** — Creates nodes only when new features/constraints/knowledge are discovered, with title deduplication to prevent bloat
- **Personality System** — Diligence/Exploration/Rigor affect path selection, supports AI natural language generation
- **Knowledge Learning** — Input a topic to auto-generate knowledge graph, Scholar decomposes into structured DAG
- **Graph Evolution** — Auto-distills new knowledge after task completion, unused edges decay every 6 hours
- **Difficulty Perception** — 6 difficulty types × personality dimensions with softmax weighted calculation
- **Real-time Streaming** — WebSocket live display of thinking process (Leader decision → Agent output → Boss review)
- **Tool System** — 18 built-in tools (web search, code execution, memory read/write, browser, file read/write/edit, code search, etc.), Agent autonomously invokes with structured visualization of each tool call's parameters, results, and duration
- **Vibe Coding Workflow** — File read/write/edit, code search (ripgrep integration), file find, directory listing, with diff view and terminal-style output
- **Dev Tool Management** — One-click install of ripgrep and other dev tools in settings to enhance LLM coding capabilities
- **LLM Fault Tolerance** — Auto-retry (429/5xx), exponential backoff, request timeout control, Retry-After support
- **Internationalization** — Built-in Chinese/English bilingual support, one-click switch in settings
- **User System** — JWT authentication, multi-user data isolation
- **Session Persistence** — Complete thinking process storage, history review, cursor-based pagination with progressive scroll loading
- **Responsive Layout** — Desktop 3-column / Tablet 2-column / Mobile tab switching, PWA support

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Tauri 2 Desktop Shell              │
├──────────────────────┬──────────────────────────────┤
│      Frontend        │          Backend             │
│                      │                              │
│  React 19 + MUI 7   │   Express + WebSocket        │
│  @xyflow/react       │   SQLite (better-sqlite3)    │
│  Zustand 5           │   OpenAI SDK                 │
│  Vite 8              │                              │
├──────────────────────┴──────────────────────────────┤
│                   LLM Providers                      │
│         (OpenAI / Claude / DeepSeek / ...)           │
└─────────────────────────────────────────────────────┘
```

## 🤖 Multi-Role System

| Role | Responsibility | Description |
|------|---------------|-------------|
| **Leader** | Path Decision | Progressively selects optimal paths in the directed graph, filtering candidate edges based on perceived difficulty and personality thresholds |
| **Agent** | Task Execution | Receives personality prompt + path memory context, supports tool call loops (up to 10 rounds), streams output |
| **Boss** | Quality Verification | Objectively verifies task completion, detects infinite loops, unaffected by personality |
| **Scholar** | Knowledge Learning | Decomposes learning topics into DAG structures of 3-8 nodes |
| **Evaluator** | Difficulty Assessment | Evaluates base difficulty and 6 difficulty type distributions for new edges |
| **PersonalityParser** | Personality Parsing | Converts natural language personality descriptions into dimension values |

### Collaboration Flow

```
1. Load personality dimensions → Calculate tolerance threshold
2. Starting from personality node, Leader decision loop (max 50 steps):
   Get outgoing edges → Compute perceived difficulty → Filter edges above threshold → Leader selects or stops
   In supervised mode, each step saves a snapshot; user can return to any historical node and re-select
3. Concatenate path memories → Inject personality prompt → Agent streams execution (can invoke tools)
4. Boss verification:
   ✅ Passed → Lower path difficulty (×0.95), smart knowledge distillation (dedup + conditional filtering)
   ❌ Failed → Raise path difficulty (×1.1), retry up to 3 times
```

## 🎭 Personality System

Three built-in dimensions (0.0 ~ 1.0):

| Dimension | Description | Effect |
|-----------|-------------|--------|
| **Diligence** | Tolerance for complex paths | High = willing to take longer paths |
| **Exploration** | Acceptance of unfamiliar paths | High = willing to try new paths |
| **Rigor** | Tolerance for uncertainty | High = only accepts high-confidence paths |

Tolerance threshold formula: `threshold = 0.3 + 0.4 × diligence + 0.2 × exploration`

Supports custom dimensions, can be auto-generated by AI from natural language descriptions.

## 📐 Difficulty Perception Algorithm

Edges carry 6 difficulty types: Computation, Reasoning, Creativity, Retrieval, Analysis, Synthesis

```
Perceived Difficulty = Base Difficulty × adjustmentFactor

adjustmentFactor = Σ(softmax-normalized personality adjustments × type weights)
                   clamped to [0.3, 1.7]
```

## 🚀 Quick Start

### Requirements

- [Bun](https://bun.sh/) >= 1.0 (or Node.js >= 18)

### Installation

```bash
git clone https://github.com/zhibeigg/LLM-BRAIN.git
cd LLM-BRAIN

# Install dependencies
cd backend && bun install && cd ..
cd frontend && bun install && cd ..
```

### Start Development Environment

```bash
# Set JWT secret (required)
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# Terminal 1: Start backend
cd backend && bun run dev

# Terminal 2: Start frontend
cd frontend && bun run dev
```

Or use the root-level parallel start:

```bash
bun install        # Install root dependencies (concurrently)
bun run dev        # Start both frontend and backend
```

Visit http://localhost:5173

### First Use

1. Register an account
2. Create a brain (fill in name, project directory, personality description)
3. Configure LLM providers in settings (supports OpenAI-compatible APIs)
4. Configure models for each role
5. Enter a task or use `/learn <topic>` command to learn new knowledge

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript 5.9 + Vite 8 |
| UI | MUI 7 + Emotion |
| Graph Visualization | @xyflow/react 12 |
| State Management | Zustand 5 |
| Backend | Express 4 + TypeScript |
| Real-time Communication | WebSocket (ws) |
| Database | SQLite (better-sqlite3) |
| LLM | OpenAI SDK 4 (compatible with any OpenAI API format) |
| Authentication | JWT (jsonwebtoken + bcryptjs) |
| Internationalization | Built-in lightweight i18n (React Context) |
| Testing | Vitest 4 |
| Package Manager | Bun |

## 📁 Project Structure

```
LLM-BRAIN/
├── backend/
│   └── src/
│       ├── api/            # REST API routes
│       ├── core/           # Core engines
│       │   ├── difficulty/  # Difficulty perception
│       │   ├── evolution/   # Graph evolution (auto-decay scheduling)
│       │   ├── extraction/  # Knowledge distillation (smart dedup)
│       │   ├── learning/    # Learning engine
│       │   └── personality/ # Personality parsing
│       ├── db/             # Database layer (SQLite)
│       ├── llm/            # LLM integration
│       │   ├── orchestrator/ # Multi-role orchestrator
│       │   ├── providers/   # Provider adapters (retry + timeout)
│       │   └── roles/       # 6 role definitions
│       ├── tools/          # Tool system (12 tools)
│       ├── middleware/     # JWT auth middleware
│       ├── ws/             # WebSocket server
│       └── index.ts        # Entry point
├── frontend/
│   └── src/
│       ├── components/     # UI components
│       │   ├── auth/        # Login/Register
│       │   ├── brain/       # Brain selector
│       │   ├── chat/        # Chat input
│       │   ├── editor/      # Node editor
│       │   ├── graph/       # Graph canvas (viewport culling + edge aggregation)
│       │   ├── personality/ # Personality panel
│       │   ├── settings/    # Settings dialog
│       │   └── thinking/    # Thinking process panel
│       ├── hooks/          # WebSocket hooks
│       ├── i18n/           # Internationalization (zh-CN / en)
│       ├── services/       # API + WebSocket client
│       ├── stores/         # Zustand state management
│       ├── workers/        # Web Workers (force-directed layout)
│       └── types/          # TypeScript types
└── src-tauri/              # Tauri desktop shell config
```

## 📄 License

MIT
