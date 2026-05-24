// ==================== 豆包 Provider ====================

export interface AiProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface AiProviderRequest {
  messages: Array<{ role: string; content: unknown }>
  maxTokens?: number
  temperature?: number
}

export interface AiProviderResponse {
  content: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_MAX_RETRIES = 2
const RETRY_DELAY_MS = 1_500

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function callDoubaoApi(
  config: AiProviderConfig,
  request: AiProviderRequest,
): Promise<AiProviderResponse> {
  if (!config.apiKey) {
    throw new Error('API Key 未设置')
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

      try {
        const res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: request.messages,
            max_tokens: request.maxTokens ?? 2000,
            temperature: request.temperature,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          throw new Error(`AI 接口返回 ${res.status} ${res.statusText}: ${errText}`)
        }

        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ''

        return {
          content,
          usage: data.usage,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // 非网络错误不重试
      if (lastError.message.includes('401') || lastError.message.includes('403')) {
        throw lastError
      }

      if (attempt < DEFAULT_MAX_RETRIES) {
        console.warn(`[Doubao] 第 ${attempt + 1} 次调用失败，${RETRY_DELAY_MS}ms 后重试:`, lastError.message)
        await delay(RETRY_DELAY_MS)
      }
    }
  }

  throw lastError!
}
