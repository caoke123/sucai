// ==================== 安全路径工具 ====================

import path from 'path'

const MAX_PATH_LENGTH = 240

export function safePath(filePath: string): {
  valid: boolean
  sanitized: string
  warnings: string[]
} {
  const warnings: string[] = []
  let sanitized = filePath.trim()

  // 移除非法字符
  sanitized = sanitized.replace(/[\x00-\x1f<>:"|?*\x7f]/g, '_')

  if (sanitized !== filePath) {
    warnings.push('路径包含非法字符，已替换为 _')
  }

  // 路径长度检查
  if (sanitized.length > MAX_PATH_LENGTH) {
    warnings.push(`路径超过 ${MAX_PATH_LENGTH} 字符限制，可能被截断`)
  }

  // 空格路径提示
  if (sanitized.includes('  ')) {
    warnings.push('路径包含连续空格')
  }

  return {
    valid: warnings.filter((w) => w.includes('非法字符')).length === 0,
    sanitized,
    warnings,
  }
}

export function normalizePath(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/')
}

export function getUniqueOutputPath(basePath: string, folderName: string): string {
  let candidate = path.join(basePath, folderName)
  if (!require('fs').existsSync(candidate)) return candidate

  let counter = 1
  while (require('fs').existsSync(`${candidate}_${counter}`)) {
    counter++
  }
  return `${candidate}_${counter}`
}
