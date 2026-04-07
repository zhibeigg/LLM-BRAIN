import { Router } from 'express'
import OpenAI from 'openai'
import type { LLMRole } from '../types/index.js'
import {
  getAllProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
  getAllRoleConfigs,
  getRoleConfig,
  setRoleConfig,
} from '../db/llm-config.js'
import { clearAdapterCache } from '../llm/providers/index.js'

export const llmConfigRouter = Router()

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
}

// GET /providers - 获取所有提供商（API Key 脱敏）
llmConfigRouter.get('/providers', (_req, res) => {
  try {
    const providers = getAllProviders().map(p => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }))
    res.json(providers)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /providers - 创建提供商
llmConfigRouter.post('/providers', (req, res) => {
  try {
    const { name, baseUrl, apiKey, models } = req.body
    if (!name || !baseUrl || !apiKey) {
      res.status(400).json({ error: 'name, baseUrl, and apiKey are required' })
      return
    }
    const provider = createProvider({
      name,
      baseUrl,
      apiKey,
      models: models ?? [],
    })
    res.status(201).json(provider)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT /providers/:id - 更新提供商
llmConfigRouter.put('/providers/:id', (req, res) => {
  try {
    const provider = updateProvider(req.params.id, req.body)
    if (!provider) {
      res.status(404).json({ error: 'Provider not found' })
      return
    }
    clearAdapterCache()
    res.json(provider)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// DELETE /providers/:id - 删除提供商
llmConfigRouter.delete('/providers/:id', (req, res) => {
  try {
    const deleted = deleteProvider(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Provider not found' })
      return
    }
    clearAdapterCache()
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /roles - 获取所有角色配置
llmConfigRouter.get('/roles', (_req, res) => {
  try {
    res.json(getAllRoleConfigs())
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /roles/:role - 获取单个角色配置
llmConfigRouter.get('/roles/:role', (req, res) => {
  try {
    const config = getRoleConfig(req.params.role as LLMRole)
    if (!config) {
      res.status(404).json({ error: 'Role config not found' })
      return
    }
    res.json(config)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// PUT /roles/:role - 设置角色配置
llmConfigRouter.put('/roles/:role', (req, res) => {
  try {
    const { providerId, model, temperature, maxTokens } = req.body
    if (!providerId || !model) {
      res.status(400).json({ error: 'providerId and model are required' })
      return
    }
    const config = {
      role: req.params.role as LLMRole,
      providerId,
      model,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 4096,
    }
    setRoleConfig(config)
    res.json(config)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /providers/:id/detect-models - 自动检测提供商可用模型
llmConfigRouter.post('/providers/:id/detect-models', async (req, res) => {
  try {
    const provider = getProviderById(req.params.id)
    if (!provider) {
      res.status(404).json({ error: 'Provider not found' })
      return
    }

    const client = new OpenAI({
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
    })

    const response = await client.models.list()
    const models: string[] = []
    for await (const model of response) {
      models.push(model.id)
    }
    models.sort()

    // 自动更新提供商的模型列表
    updateProvider(provider.id, { models })

    res.json({ models, count: models.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    res.status(502).json({ error: `模型检测失败: ${message}` })
  }
})

// POST /detect-models - 用临时凭据检测模型（不需要先保存提供商）
llmConfigRouter.post('/detect-models', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body
    if (!baseUrl || !apiKey) {
      res.status(400).json({ error: 'baseUrl and apiKey are required' })
      return
    }

    const client = new OpenAI({
      baseURL: baseUrl,
      apiKey,
    })

    const response = await client.models.list()
    const models: string[] = []
    for await (const model of response) {
      models.push(model.id)
    }
    models.sort()

    res.json({ models, count: models.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    res.status(502).json({ error: `模型检测失败: ${message}` })
  }
})
