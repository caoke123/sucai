import type { ScanFolderResult, OrganizeRequest, OrganizeResult, DbConfig, PackagingPreset, SpuData, SkuItem, R2Config, UploadTask, UploadQueueState, CompressResult } from '@shared/types'

interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface CallAiVisionPayload {
  mainImagePaths: string[]
  skuImagePaths: string[]
  skuIds: string[]
  existingNames?: string[]
  productTitle?: string
  productCategory?: string
  originalFileNames?: string[]
  folderName?: string
  aiConfig?: AiConfig
}

interface CallAiVisionResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

interface CallSingleSkuPayload {
  base64Data: string
  aiConfig?: AiConfig
}

interface CallShopeeEnglishPayload {
  chineseTitle: string
  chineseDescription: string
  category: string
  skuNames: string[]
  originalFileNames?: string[]
  mainImagePath?: string
  aiConfigOverrides?: AiConfig
}

interface CallShopeeEnglishResult {
  success: boolean
  data?: {
    title: string
    descriptionText: string
    material: string
  }
  error?: { type: string; message: string }
}

interface CallTranslateSkuPayload {
  chineseTitle: string
  category: string
  skuName: string
  skuFileName?: string
  skuImagePath?: string
  aiConfigOverrides?: AiConfig
}

interface CallTranslateSkuResult {
  success: boolean
  data?: { nameEn: string }
  error?: { type: string; message: string }
}

declare global {
  interface Window {
    electronAPI: {
      selectDirectory: () => Promise<string | null>
      scanFolder: (folderPath: string) => Promise<ScanFolderResult>
      organizeFiles: (payload: OrganizeRequest) => Promise<OrganizeResult>
      openPath: (dirPath: string) => Promise<string>
      readFileBase64: (filePath: string) => Promise<string>
      getAiConfig: () => Promise<AiConfig>
      saveAiConfig: (config: AiConfig) => Promise<void>
      callAiVision: (payload: CallAiVisionPayload) => Promise<CallAiVisionResult>
      callSingleSkuVision: (payload: CallSingleSkuPayload) => Promise<{ success: boolean; specName?: string; error?: string }>
      callShopeeEnglish: (payload: CallShopeeEnglishPayload) => Promise<CallShopeeEnglishResult>
      callTranslateSku: (payload: CallTranslateSkuPayload) => Promise<CallTranslateSkuResult>
      callTranslateSkuBatch: (payload: {
        skuList: Array<{ id: string; skuName: string; skuFileName?: string; skuImagePath?: string }>
        title: string
        category: string
        aiConfigOverrides?: AiConfig
      }) => Promise<{ success: boolean; data?: { results: Array<{ id: string; nameEn: string }> }; error?: { type: string; message: string } }>
      r2ConfigGet: () => Promise<R2Config>
      r2ConfigSet: (config: Partial<R2Config>) => Promise<void>
      r2ConfigTest: () => Promise<{ success: boolean; error?: string }>
      uploadQueueAdd: (task: Omit<UploadTask, 'status' | 'progress' | 'totalFiles' | 'uploadedFiles' | 'retryCount' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>
      uploadQueueRetry: (taskId: string) => Promise<void>
      uploadQueueRemove: (taskId: string) => Promise<void>
      uploadQueueGet: () => Promise<UploadQueueState>
      uploadQueueClearCompleted: () => Promise<void>
      onUploadQueueUpdate: (callback: (state: UploadQueueState) => void) => void
      offUploadQueueUpdate: (callback: (state: UploadQueueState) => void) => void
      clearImageCache: () => Promise<{ success: boolean; error?: string }>
      preheatImageCache: (paths: string[]) => Promise<{ preheated: number }>
      onAiVisionStream: (callback: (data: { delta?: string; done?: boolean; error?: string; data?: Record<string, unknown> }) => void) => void
      offAiVisionStream: () => void
      compressImages: (images: Array<{ id: string; srcPath: string }>) => Promise<CompressResult[]>
      compressImagesAnalyze: (images: Array<{ id: string; srcPath: string }>) => Promise<Array<{ id: string; srcPath: string; originalSize: number; width: number; height: number; needCompress: boolean }>>
      onCompressProgress: (callback: (data: { id: string; result: CompressResult }) => void) => void
      offCompressProgress: (callback: (data: { id: string; result: CompressResult }) => void) => void
    }
    api: {
      db: {
        testConnection: (config: DbConfig) => Promise<{ success: boolean; error?: string }>
        getPackagingPresets: () => Promise<{ success: boolean; data?: PackagingPreset[]; error?: string }>
        savePackagingPreset: (preset: { id?: number; name: string; length: number; width: number; height: number; weight: number }) => Promise<{ success: boolean; data?: PackagingPreset; error?: string }>
        getNextSkuSeq: (prefix: string) => Promise<{ success: boolean; data?: string; error?: string }>
        saveSpuAndSkus: (spu: SpuData, skus: SkuItem[]) => Promise<{ success: boolean; error?: string }>
      }
    }
  }
}
