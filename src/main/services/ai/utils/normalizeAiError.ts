// ==================== AI 错误统一格式 ====================

export type AiErrorType = 'ApiKeyMissing' | 'NetworkError' | 'TimeoutError' | 'ProviderError' | 'ParseError'

export interface NormalizedAiError {
  type: AiErrorType
  message: string
  rawMessage?: string
}

interface AiErrorInput {
  message?: string
  status?: number
  statusText?: string
  cause?: unknown
}

function safeMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return '未知错误'
}

export function normalizeAiError(error: unknown): NormalizedAiError {
  const msg = safeMessage(error)

  if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
    return { type: 'NetworkError', message: '网络连接失败，请检查网络或 API 地址', rawMessage: msg }
  }

  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('AbortError')) {
    return { type: 'TimeoutError', message: 'AI 请求超时，请稍后重试', rawMessage: msg }
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('invalid api key')) {
    return { type: 'ApiKeyMissing', message: 'API Key 无效，请在系统配置中检查密钥', rawMessage: msg }
  }

  if (msg.includes('429') || msg.includes('rate')) {
    return { type: 'ProviderError', message: 'API 调用频率超限，请稍后重试', rawMessage: msg }
  }

  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return { type: 'ProviderError', message: 'AI 服务暂时不可用，请稍后重试', rawMessage: msg }
  }

  // 兜底
  return { type: 'ProviderError', message: `AI 调用异常: ${msg.substring(0, 150)}`, rawMessage: msg }
}
