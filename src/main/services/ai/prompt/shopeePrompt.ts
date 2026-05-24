// ==================== Shopee 英文生成 Prompt ====================

import type { SkuItem } from '@shared/types'

const SYSTEM_PROMPT = `You are a professional cross-border e-commerce copywriter specializing in Shopee product listings. Your task is to generate optimized English product content strictly following Shopee platform rules and best practices.

SHOPEE PLATFORM RULES (non-negotiable, must follow exactly):
1. Title must be in English only. No minority languages, no made-up words.
2. Title length: between 34 and 180 characters (aim for 80-120 for best performance).
3. Every word in the title must start with a capital letter (Title Case).
4. Title must include exactly 3 trending/high-search keywords relevant to the product. Weave them naturally — do not keyword-stuff.
5. No keyword may appear more than once in the title.
6. Do not mention any platform names (e.g., Shopee, Amazon, Taobao, AliExpress) anywhere in title or description.
7. Do not mention any shop names or brand names other than the product's own brand.
8. Description must be in English only. No minority languages, no made-up words.
9. Description must not exceed 3000 characters total.
10. Description must include at least one image placeholder marker: [IMAGE] — place it at a natural break between sections.
11. SKU color/size/model names must use short English descriptions (e.g., "Orange Yellow", "Black Red", "Pink Purple").

OUTPUT FORMAT:
Return only a valid JSON object, no explanation, no markdown code blocks, no extra text.
{
  "title": "...",
  "descriptionText": "...",
  "material": "...",
  "skuNamesEn": ["...", "..."]
}`

export interface ShopeePromptInput {
  chineseTitle: string
  chineseDescription: string
  category: string
  skuNames: string[]
  mainImageBase64?: string
}

export function buildShopeePrompt(input: ShopeePromptInput): {
  messages: Array<{ role: string; content: unknown }>
} {
  const skuNamesText = input.skuNames.map((n) => n || '(未命名)').join(', ')

  const userPrompt = `Generate Shopee English product content for the following product.

[PRODUCT DATA]
Chinese Title: ${input.chineseTitle}
Chinese Description: ${input.chineseDescription || '(no description)'}
Category: ${input.category || '(not specified)'}
SKU Color Names (Chinese): ${skuNamesText}

[CONTENT REQUIREMENTS]

Title:
- Title Case (every word capitalized)
- 34–180 characters, aim for 80–120
- Include exactly 3 trending keywords for this product category, integrated naturally
- No duplicate keywords
- No platform names, no shop names

Description:
- Total length: 500–1500 characters (well under 3000 limit)
- Structure:
    Paragraph 1 (2–3 sentences): Lead with the strongest selling point. What makes this product special?
    [IMAGE]
    Paragraph 2 (2–3 sentences): Describe key features and what's included in the set.
    Paragraph 3 (1–2 sentences): Describe use cases or gifting scenarios.
- Plain text only, no markdown, no bullet points, no hashtags
- Do not mention any platform or shop names

Material:
- 2–4 English material terms, comma-separated
- Example: "Resin, Cotton Rope, Metal Clip"

SKU English Names:
- Translate each Chinese SKU color name to a short English description
- 2–3 words max per name, Title Case
- Example: "橙黄棒球绳结" → "Orange Yellow", "黑红棒球绳结" → "Black Red"
- Return as an array in the same order as the input SKU list

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
