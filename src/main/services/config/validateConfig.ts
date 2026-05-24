// ==================== 配置校验 ====================

export interface ConfigValidationResult {
  valid: boolean
  missingKeys: string[]
  message: string
}

export function validateAiConfig(config: { apiKey?: string; baseUrl?: string; model?: string }): ConfigValidationResult {
  const missingKeys: string[] = []

  if (!config.apiKey || !config.apiKey.trim()) {
    missingKeys.push('apiKey')
  }
  if (!config.baseUrl || !config.baseUrl.trim()) {
    missingKeys.push('baseUrl')
  }
  if (!config.model || !config.model.trim()) {
    missingKeys.push('model')
  }

  return {
    valid: missingKeys.length === 0,
    missingKeys,
    message: missingKeys.length > 0
      ? `AI 配置缺少: ${missingKeys.join(', ')}`
      : '配置完整',
  }
}

export function validateR2Config(config: {
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  bucket?: string
}): ConfigValidationResult {
  const missingKeys: string[] = []

  if (!config.endpoint || !config.endpoint.trim()) missingKeys.push('endpoint')
  if (!config.accessKeyId || !config.accessKeyId.trim()) missingKeys.push('accessKeyId')
  if (!config.secretAccessKey || !config.secretAccessKey.trim()) missingKeys.push('secretAccessKey')
  if (!config.bucket || !config.bucket.trim()) missingKeys.push('bucket')

  return {
    valid: missingKeys.length === 0,
    missingKeys,
    message: missingKeys.length > 0
      ? `R2 配置缺少: ${missingKeys.join(', ')}`
      : '配置完整',
  }
}
