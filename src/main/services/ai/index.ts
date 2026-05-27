// ==================== AI 服务统一入口 ====================

import { join } from 'path'
import { app } from 'electron'
import { callDoubaoApi } from './provider/doubaoProvider'
import type { AiProviderConfig } from './provider/doubaoProvider'
import { buildShopeePrompt } from './prompt/shopeePrompt'
import type { ShopeePromptInput } from './prompt/shopeePrompt'
import { parseShopeeResponse } from './parser/parseShopeeResponse'
import type { ShopeeAiResult } from './parser/parseShopeeResponse'
import { compressImageToBase64 } from './utils/compressImage'
import { safeJsonParse } from '@shared/utils/safeJsonParse'
import { normalizeAiError } from './utils/normalizeAiError'
import type { NormalizedAiError } from './utils/normalizeAiError'
import { validateAiConfig } from '../config/validateConfig'
import { DEFAULT_AI_CONFIG_TEMPLATE } from '../config/defaultConfig'

// ==================== AI 配置管理 ====================

let aiConfigPath = ''

export function initAiConfig(): void {
  aiConfigPath = app.isPackaged
    ? join(app.getPath('userData'), 'ai-config.json')
    : join(app.getAppPath(), 'ai-config.json')
}

async function loadAiConfig(): Promise<AiProviderConfig> {
  try {
    const { access: fsAccess, readFile: rf, writeFile } = await import('fs/promises')
    try {
      await fsAccess(aiConfigPath)
    } catch {
      await writeFile(aiConfigPath, JSON.stringify(DEFAULT_AI_CONFIG_TEMPLATE, null, 2), 'utf-8')
      return { ...DEFAULT_AI_CONFIG_TEMPLATE }
    }
    const raw = await rf(aiConfigPath, 'utf-8')
    return { ...DEFAULT_AI_CONFIG_TEMPLATE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_AI_CONFIG_TEMPLATE }
  }
}

async function saveAiConfig(config: AiProviderConfig): Promise<void> {
  try {
    const { writeFile } = await import('fs/promises')
    await writeFile(aiConfigPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[AI] Failed to save config:', err)
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
  originalFileNames?: string[]
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
        console.warn('[AI] Main image compress failed, continue text-only:', imgErr)
      }
    }

    // 构建 prompt
    const promptInput: ShopeePromptInput = {
      chineseTitle: input.chineseTitle,
      chineseDescription: input.chineseDescription,
      category: input.category,
      skuNames: input.skuNames,
      originalFileNames: input.originalFileNames,
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
    const parseResult = parseShopeeResponse(response.content)

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

// ==================== 单 SKU 英文翻译 ====================

export interface TranslateSingleSkuInput {
  chineseTitle: string
  category: string
  skuName: string
  skuFileName?: string
  skuImagePath?: string
  aiConfigOverrides?: Partial<AiProviderConfig>
}

const MEANINGLESS_SKU_NAME = /^(图|款|色|样|货|件|个|只|条|未命名|temp|image|picture|pic|photo|sku)$/i

export async function translateSingleSku(
  input: TranslateSingleSkuInput,
): Promise<AiCallResult<{ nameEn: string }>> {
  try {
    const config = input.aiConfigOverrides?.apiKey
      ? (input.aiConfigOverrides as AiProviderConfig)
      : await loadAiConfig()

    if (!config.apiKey) {
      return { success: false, error: { type: 'ApiKeyMissing', message: '请先在系统配置中设置 AI API Key' } }
    }

    // 智能降级判定: 中文名有意义 → Text-only; 无意义/缺名/单字 → Vision 识图
    const trimmedName = (input.skuName || '').trim()
    const isMeaningless = !trimmedName ||
      trimmedName.length <= 1 ||
      MEANINGLESS_SKU_NAME.test(trimmedName)
    const mustUseVision = isMeaningless && input.skuImagePath

    const contentParts: unknown[] = []

    if (mustUseVision) {
      console.log(`[AI Translate] Cannot degrade, using Vision: "${input.skuName}" (${input.skuFileName || 'no filename'})`)
      try {
        const base64 = await compressImageToBase64(input.skuImagePath!)
        contentParts.push({ type: 'image_url', image_url: { url: base64 } })
      } catch (compressError) {
        console.warn('[AI Translate] Image compress failed, fallback to text-only:', compressError)
      }
    } else {
      console.log(`[AI Translate] Degrade condition met, text-only: "${input.skuName}"`)
    }

    const fileNameHint = input.skuFileName
      ? `Original Image Filename Clue: "${input.skuFileName}" (may contain product/variant hints)\n`
      : ''

    const textPrompt = `Generate a natural English e-commerce variant name for this single SKU.

[PRODUCT CONTEXT]
Product Title: ${input.chineseTitle || '(not set)'}
Category: ${input.category || '(not specified)'}
SKU Chinese Name: ${input.skuName || 'None'}
${fileNameHint}
[RULES]
1. Combine variant identifier + product type to form a natural e-commerce variant name.
2. 2-5 words, Title Case.
3. Never output bare colors (e.g. "Orange Hairpin", not "Orange").
4. Strictly output ONLY the translated English name. No markdown, no quotes, no conversational filler.`

    contentParts.push({ type: 'text', text: textPrompt })

    const response = await callDoubaoApi(config, {
      messages: [
        { role: 'system', content: 'You are a professional cross-border e-commerce translation expert. Translate a single SKU variant to a natural English e-commerce name. Output ONLY the English name itself, 2-5 words, Title Case. Never output quotes, explanation, or trailing dots.' },
        { role: 'user', content: contentParts },
      ],
      maxTokens: 50,
      temperature: 0.3,
    })

    // 严格清洗: 剥离引号/句号/前后空格
    const nameEn = response.content
      .trim()
      .replace(/^['"“‘「\s]+|['"”'」\s]+$/g, '')
      .replace(/\.$/, '')
      .trim()

    return { success: true, data: { nameEn: nameEn || input.skuName } }
  } catch (error) {
    return { success: false, error: normalizeAiError(error) }
  }
}

// ==================== 批量 SKU 英文翻译 ====================

export interface TranslateSkuBatchInput {
  skuList: Array<{ id: string; skuName: string; skuFileName?: string; skuImagePath?: string }>
  title: string
  category: string
  aiConfigOverrides?: Partial<AiProviderConfig>
}

export interface TranslateSkuBatchResult {
  results: Array<{ id: string; nameEn: string }>
}

export async function translateSkuBatch(
  input: TranslateSkuBatchInput,
): Promise<AiCallResult<TranslateSkuBatchResult>> {
  try {
    const config = input.aiConfigOverrides?.apiKey
      ? (input.aiConfigOverrides as AiProviderConfig)
      : await loadAiConfig()

    if (!config.apiKey) {
      return { success: false, error: { type: 'ApiKeyMissing', message: '请先配置 AI API Key' } }
    }

    const contentParts: unknown[] = []

    // 每个 SKU: 文本标识 + 图片
    for (const sku of input.skuList) {
      contentParts.push({
        type: 'text',
        text: `SKU id="${sku.id}": 中文名="${sku.skuName}"${sku.skuFileName ? ` | 文件名="${sku.skuFileName}"` : ''}`,
      })
      if (sku.skuImagePath) {
        try {
          const b64 = await compressImageToBase64(sku.skuImagePath)
          contentParts.push({ type: 'image_url', image_url: { url: b64 } })
        } catch { /* skip failed image */ }
      }
    }

    // 翻译规则 prompt
    contentParts.push({
      type: 'text',
      text: `Translate ALL SKU variants above to natural English e-commerce names.

[CONTEXT]
Product: ${input.title || '(not set)'} | Category: ${input.category || '(not specified)'}

[RULES]
- Each SKU is a VARIANT of the product above
- Combine: variant identifier + product type = natural English name
- Example: product="超Q彩虹毛衣小熊挂件", SKU="橙色" → "Orange Sweater Bear Charm"
- "蝴蝶结"→Bow, "毛衣"→Sweater/Knit, "挂件"→Charm/Pendant, "彩虹"→Rainbow, "小熊"→Bear/Teddy
- 2-5 words, Title Case, DO NOT output bare color words

Return ONLY valid JSON:
{ "results": [{ "id": "SKU_ID_HERE", "nameEn": "Translated Name" }] }
The results array must have the same count and same id values as the input SKU list.`,
    })

    const response = await callDoubaoApi(config, {
      messages: [{ role: 'user', content: contentParts }],
      maxTokens: 200,
      temperature: 0.5,
    })

    // 解析 JSON 返回
    const cleaned = response.content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    const jsonStr = firstBrace !== -1 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned

    const parsed = safeJsonParse<{ results?: Array<{ id: string; nameEn: string }> }>(jsonStr)
    const results = (parsed.results || []).map((r) => ({
      id: r.id || '',
      nameEn: (r.nameEn || '').replace(/['"]/g, '').trim(),
    }))

    return { success: true, data: { results } }
  } catch (error) {
    return { success: false, error: normalizeAiError(error) }
  }
}
