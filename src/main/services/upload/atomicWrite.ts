// ==================== 原子文件写入 ====================

import { writeFileSync, renameSync } from 'fs'

export function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}
