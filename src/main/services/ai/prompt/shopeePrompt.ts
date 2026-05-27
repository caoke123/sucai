// ==================== Shopee 英文生成 Prompt ====================

const SYSTEM_PROMPT = `You are a professional cross-border e-commerce product localization expert.
Your task is to create natural, e-commerce-optimized English product content.

CORE PRINCIPLE:
You are NOT a color translator or keyword stuffer.
You are a PRODUCT COPYWRITER who understands e-commerce buyer psychology and Shopee platform rules.

INFORMATION PRIORITY (use this to determine the ACTUAL product):
1. Original image file names (may contain product name + variant + color clues)
2. Product Chinese title (full product description)
3. Individual SKU Chinese name (the specific variant identifier)
4. Image filename for each SKU (may contain style/color hints)
5. Product category context

SHOPEE PLATFORM RULES:
1. Title must be in English only, Title Case, 34-180 characters (aim 80-120)
2. Include exactly 3 trending keywords naturally — no keyword stuffing, no duplicates
3. No platform/shop names in title or description
4. Description: 500-1500 chars, plain text, include [IMAGE] placeholder

OUTPUT FORMAT — Return only a valid JSON object:
{
  "title": "...",
  "descriptionText": "...",
  "material": "..."
}`

export interface ShopeePromptInput {
  chineseTitle: string
  chineseDescription: string
  category: string
  skuNames: string[]
  originalFileNames?: string[]
  mainImageBase64?: string
}

export function buildShopeePrompt(input: ShopeePromptInput): {
  messages: Array<{ role: string; content: unknown }>
} {
  const { chineseTitle, chineseDescription, category, skuNames, originalFileNames } = input

  // 构建文件名上下文
  let fileNameContext = ''
  if (originalFileNames && originalFileNames.length > 0) {
    const fileLines = originalFileNames
      .map((f, i) => `  SKU ${i}: "${skuNames[i] || '?'}"  | 原始文件名="${f}"`)
      .join('\n')
    fileNameContext = `\n[ORIGINAL IMAGE FILE NAMES — these may contain product name, variant, color clues]\n${fileLines}\n`
  }

  const userPrompt = `Generate Shopee English product content for the following product.

[PRODUCT CONTEXT — PRIMARY SOURCE]
Product Chinese Title: ${chineseTitle || '(not set)'}
Category: ${category || '(not specified)'}
Chinese Description: ${chineseDescription || '(no description)'}${fileNameContext}
[CONTENT REQUIREMENTS]
Title:
- Title Case, 34-180 chars (aim 80-120)
- Include 3 trending keywords naturally
- No platform/shop names

Description:
- 500-1500 chars, plain text
- Para 1: strongest selling point (2-3 sentences)
- [IMAGE] placeholder
- Para 2: key features and what's included
- Para 3: use cases or gifting scenarios

Material:
- 2-4 English terms, comma-separated

Return only the JSON object. No other text.`

  const contentParts: unknown[] = [{ type: 'text', text: userPrompt }]

  if (input.mainImageBase64) {
    contentParts.unshift({ type: 'image_url', image_url: { url: input.mainImageBase64 } })
  }

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contentParts },
    ],
  }
}
