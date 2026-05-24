import type { ScanFolderResult, OrganizeRequest, OrganizeResult, DbConfig, PackagingPreset, SpuData, SkuItem, R2Config, UploadTask, UploadQueueState } from '@shared/types'

interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface CallAiVisionPayload {
  mainBase64List: string[]
  skuBase64List: string[]
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
