<div align="center">

# 🧠 LLM-BRAIN

**有向记忆图 + 多角色 LLM 类脑智能体系统**

*Directed Memory Graph + Multi-Role LLM Brain-Like Agent System*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)

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
- **有向记忆图谱** — 可视化知识网络，节点拖拽编辑，自动布局
- **性格系统** — 勤快度/探索度/严谨度影响路径选择，支持 AI 自然语言生成
- **知识学习** — 输入主题自动生成知识图谱，Scholar 拆解为结构化 DAG
- **图谱进化** — 任务完成后自动蒸馏新知识，未使用的边逐渐衰减
- **难度感知** — 6 种难度类型 × 性格维度的 softmax 加权计算
- **实时推送** — WebSocket 实时展示思考过程（Leader 决策 → Agent 输出 → Boss 评审）
- **工具系统** — 12 种内置工具（网页搜索、代码执行、记忆读写、浏览器等），Agent 自主调用，结构化可视化展示每次工具调用的参数、结果和耗时
- **用户系统** — JWT 认证，多用户数据隔离
- **会话持久化** — 思考过程完整存储，历史记录可回看，游标分页渐进式滚动加载

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
3. 拼接路径记忆 → 注入性格 prompt → Agent 流式执行（可调用工具）
4. Boss 验证：
   ✅ 通过 → 调低路径难度(×0.95)，触发知识蒸馏
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
5. 输入任务或使用 `学习 <主题>` 命令学习新知识

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
| 包管理 | Bun |

## 📁 项目结构

```
LLM-BRAIN/
├── backend/
│   └── src/
│       ├── api/            # REST API 路由
│       ├── core/           # 核心引擎
│       │   ├── difficulty/  # 难度感知
│       │   ├── evolution/   # 图谱进化
│       │   ├── extraction/  # 知识蒸馏
│       │   ├── learning/    # 学习引擎
│       │   └── personality/ # 性格解析
│       ├── db/             # 数据库层 (SQLite)
│       ├── llm/            # LLM 集成
│       │   ├── providers/   # 提供商适配
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
│       │   ├── graph/       # 图谱画布
│       │   ├── personality/ # 性格面板
│       │   ├── settings/    # 设置对话框
│       │   └── thinking/    # 思考过程面板
│       ├── hooks/          # WebSocket hook
│       ├── services/       # API + WebSocket 客户端
│       ├── stores/         # Zustand 状态管理
│       └── types/          # TypeScript 类型
└── src-tauri/              # Tauri 桌面壳配置
```

## 📄 License

MIT
