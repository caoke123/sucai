// ==================== Upload Manifest 类型 ====================

export interface UploadManifestEntry {
  id: string
  type: 'main' | 'detail' | 'sku'
  skuCode?: string
  localPath: string
  relativePath: string
  r2Key: string
  r2Url: string
  status: 'pending' | 'uploading' | 'success' | 'failed'
  retryCount: number
  errorMessage?: string
}

export interface UploadManifest {
  manifestVersion: 1
  taskId: string
  productNo: string
  localPackagePath: string
  folderName: string
  createdAt: string
  entries: UploadManifestEntry[]
}
