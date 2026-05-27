// ==================== 图片压缩导出类型 ====================

export interface CompressResult {
  id: string
  srcPath: string
  destPath: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
  skipped: boolean
}

export interface CompressState {
  results: Record<string, CompressResult>
  status: 'idle' | 'compressing' | 'done'
  progress: number
}
