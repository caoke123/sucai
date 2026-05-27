// ==================== Cloudflare R2 云存储类型 ====================

export interface R2Config {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  customDomain: string
}

export interface UploadTask {
  taskId: string
  productNo: string
  productName: string
  localPackagePath: string
  folderName: string
  status: 'pending' | 'uploading' | 'done' | 'failed'
  progress: number
  totalFiles: number
  uploadedFiles: number
  errorMessage?: string
  retryCount: number
  createdAt: string
  completedAt?: string
  publicBaseUrl?: string
}

export interface UploadQueueState {
  tasks: UploadTask[]
  isProcessing: boolean
}

export interface R2ImageEntry {
  fileName: string
  url: string
}

// v4.5 精简版 (product.json 中仅保留 basePath + syncedAt)
export interface R2MetadataV45 {
  basePath: string
  syncedAt: string
}

// 旧版 R2Metadata (uploadQueue 内部仍使用, 用于构建)
export interface R2Metadata {
  basePath: string
  baseUrl: string
  syncedAt: string
  images: {
    main: R2ImageEntry[]
    sku: R2ImageEntry[]
    detail: R2ImageEntry[]
    size: R2ImageEntry[]
    certificate: R2ImageEntry[]
  }
  toolVersion?: string
  stockSummary?: {
    totalStock: number
    skuCount: number
  }
}
