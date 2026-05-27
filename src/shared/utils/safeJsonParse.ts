// ==================== AI 返回 JSON 强力修复解析 ====================

/**
 * 修复并解析 AI 返回的 JSON 字符串
 * 解决 "Bad control character in string literal" 等未转义控制字符问题
 */
export function safeJsonParse<T = Record<string, unknown>>(rawStr: string): T {
  if (!rawStr) {
    throw new Error('SafeJsonParse: input is empty')
  }

  // 1. 清理 Markdown 代码块包裹 (```json ... ```)
  let cleanStr = rawStr.trim()
  if (cleanStr.startsWith('```')) {
    cleanStr = cleanStr
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/, '')
  }
  cleanStr = cleanStr.trim()

  // 2. 尝试直接解析
  try {
    return JSON.parse(cleanStr) as T
  } catch {
    // 直接解析失败，进入深度修复
  }

  // 3. 深度修复：替换 JSON 字符串值内部的未转义控制字符
  // 匹配 "key": "value" 中的 value 部分，替换 \n \r \t
  const repaired = cleanStr.replace(
    /"((?:[^"\\]|\\.)*)"/g,
    (_full, inner: string) => {
      const fixed = inner
        .replace(/\r\n/g, '\\n')
        .replace(/\r/g, '\\n')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')
      return `"${fixed}"`
    },
  )

  return JSON.parse(repaired) as T
}
