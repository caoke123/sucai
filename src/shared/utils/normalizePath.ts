// ==================== 统一路径标准化 ====================

import path from 'path'

export function normalizeFilePath(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/')
}
