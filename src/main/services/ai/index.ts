// ==================== AI 服务统一入口 ====================
// 所有 AI 功能通过此模块暴露，renderer 不直接调用任何子模块

import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { DEFAULT_AI_CONFIG } from '@shared/constants'
import { callDoubaoApi } from './provider/doubaoProvider'
import type { AiProviderConfig } from './provider/doubaoProvider'
import { buildShopeePrompt } from './prompt/shopeePrompt'
import type { ShopeePromptInput } from './prompt/shopeePrompt'
import { parseShopeeResponse } from './parser/parseShopeeResponse'
import type { ShopeeAiResult } from './parser/parseShopeeResponse'
import { compressImageToBase64 } from './utils/compressImage'
import { normalizeAiError } from './utils/normalizeAiError'
import type { NormalizedAiError } from './utils/normalizeAiError'

// ==================== AI 配置管理 ====================

let aiConfigPath = ''

export function initAiConfig(): void {
  aiConfigPath = app.isPackaged
    ? join(app.getPath('userData'), 'ai-config.json')
    : join(app.getAppPath(), 'ai-config.json')
}

async function loadAiConfig(): Promise<AiProviderConfig> {
  try {
    const { access, readFile: rf, writeFile } = await import('fs/promises')
    try {
      await access(aiConfigPath)
    } catch {
      // 首次运行，写回默认配置
      await writeFile(aiConfigPath, JSON.stringify(DEFAULT_AI_CONFIG, null, 2), 'utf-8')
      return { ...DEFAULT_AI_CONFIG }
    }
    const raw = await rf(aiConfigPath, 'utf-8')
    return { ...DEFAULT_AI_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_AI_CONFIG }
  }
}

async function saveAiConfig(config: AiProviderConfig): Promise<void> {
  try {
    const { writeFile } = await import('fs/promises')
    await writeFile(aiConfigPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[AI] 保存配置失败:', err)
  }
}

// ==================== 公共接口 ====================

export interface AiCallResult<T = unknown> {
  success: boolean
  data?: T
  error?: NormalizedAiError
}

// get/save 配置
export async function getConfig(): Promise<AiProviderConfig> {
  return loadAiConfig()
}

export async function saveConfig(config: AiProviderConfig): Promise<void> {
  await saveAiConfig(config)
}

// ==================== Shopee 英文生成 ====================

export interface GenerateShopeeEnglishInput {
  chineseTitle: string
  chineseDescription: string
  category: string
  skuNames: string[]
  mainImagePath?: string
  aiConfigOverrides?: Partial<AiProviderConfig>
}

export async function generateShopeeEnglish(
  input: GenerateShopeeEnglishInput,
): Promise<AiCallResult<ShopeeAiResult>> {
  try {
    const config = input.aiConfigOverrides?.apiKey
      ? (input.aiConfigOverrides as AiProviderConfig)
      : await loadAiConfig()

    if (!config.apiKey) {
      return {
        success: false,
        error: { type: 'ApiKeyMissing', message: '请先在系统配置中设置 AI API Key' },
      }
    }

    // 压缩主图
    let mainImageBase64: string | undefined
    if (input.mainImagePath) {
      try {
        mainImageBase64 = await compressImageToBase64(input.mainImagePath)
      } catch (imgErr) {
        console.warn('[AI] 主图压缩失败，继续文本生成:', imgErr)
      }
    }

    // 构建 prompt
    const promptInput: ShopeePromptInput = {
      chineseTitle: input.chineseTitle,
      chineseDescription: input.chineseDescription,
      category: input.category,
      skuNames: input.skuNames,
      mainImageBase64,
    }

    const { messages } = buildShopeePrompt(promptInput)

    // 调用 provider
    const response = await callDoubaoApi(config, {
      messages,
      maxTokens: 2000,
      temperature: 0.7,
    })

    // 解析响应
    const parseResult = parseShopeeResponse(response.content, input.skuNames.length)

    if (!parseResult.success) {
      return {
        success: false,
        error: { type: 'ParseError', message: parseResult.error },
      }
    }

    return { success: true, data: parseResult.data }
  } catch (error) {
    const normalized = normalizeAiError(error)
    return { success: false, error: normalized }
  }
}
