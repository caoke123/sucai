// ==================== Shopee AI 响应解析器 ====================

export interface ShopeeAiResult {
  title: string
  descriptionText: string
  material: string
  skuNamesEn: string[]
}

function sanitizeJsonString(raw: string): string {
  let cleaned = raw.trim()

  // 剥离 markdown 代码块
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  cleaned = cleaned.replace(/`+/g, '')

  // 提取最外层 { ... }，剔除前后无关文本
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  return cleaned.trim()
}

function validateStringField(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

function validateStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const filtered = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    return filtered.length > 0 ? filtered : fallback
  }
  return fallback
}

export function parseShopeeResponse(
  rawContent: string,
  expectedSkuCount: number,
): { success: true; data: ShopeeAiResult } | { success: false; error: string } {
  try {
    const cleaned = sanitizeJsonString(rawContent)
    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    const title = validateStringField(parsed['title'], '')
    const descriptionText = validateStringField(parsed['descriptionText'], '')
    const material = validateStringField(parsed['material'], '')

    const rawSkuNames = parsed['skuNamesEn']
    const skuDefaults = Array(expectedSkuCount).fill('')
    const skuNamesEn = validateStringArray(rawSkuNames, skuDefaults)

    // 对齐 SKU 数量
    if (skuNamesEn.length < expectedSkuCount) {
      const diff = expectedSkuCount - skuNamesEn.length
      for (let i = 0; i < diff; i++) {
        skuNamesEn.push('')
      }
    } else if (skuNamesEn.length > expectedSkuCount) {
      skuNamesEn.length = expectedSkuCount
    }

    return {
      success: true,
      data: { title, descriptionText, material, skuNamesEn },
    }
  } catch (parseErr) {
    const snippet = rawContent.substring(0, 200)
    console.error('[ShopeeParser] JSON 解析失败:', (parseErr as Error).message)
    console.error('[ShopeeParser] 原始内容片段:', snippet)

    return {
      success: false,
      error: `AI 返回数据格式异常，解析失败。原始内容: ${snippet}`,
    }
  }
}
