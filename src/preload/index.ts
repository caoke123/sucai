import { contextBridge, ipcRenderer } from 'electron'
import type { ScanFolderResult, OrganizeRequest, OrganizeResult, DbConfig, PackagingPreset, SpuData, SkuItem } from '../shared/types'

interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface CallAiVisionPayload {
  mainBase64List: string[]
  skuBase64List: string[]
}

interface CallAiVisionResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 选择文件夹
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('select-directory'),

  // 扫描文件夹中的图片
  scanFolder: (folderPath: string): Promise<ScanFolderResult> =>
    ipcRenderer.invoke('scan-folder', folderPath),

  // 整理文件，生成素材包
  organizeFiles: (payload: OrganizeRequest): Promise<OrganizeResult> =>
    ipcRenderer.invoke('organize-files', payload),

  // 打开本地文件夹
  openPath: (dirPath: string): Promise<string> =>
    ipcRenderer.invoke('open-path', dirPath),

  // 读取文件 Base64
  readFileBase64: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('read-file-base64', filePath),

  // AI 配置管理
  getAiConfig: (): Promise<AiConfig> =>
    ipcRenderer.invoke('get-ai-config'),

  saveAiConfig: (config: AiConfig): Promise<void> =>
    ipcRenderer.invoke('save-ai-config', config),

  // AI 视觉分析（主进程端调用火山引擎）
  callAiVision: (payload: CallAiVisionPayload): Promise<CallAiVisionResult> =>
    ipcRenderer.invoke('call-ai-vision', payload),

  // 单图 SKU 识别（1对1 精准识图）
  callSingleSkuVision: (payload: { base64Data: string; aiConfig?: AiConfig }): Promise<{ success: boolean; specName?: string; error?: string }> =>
    ipcRenderer.invoke('call-single-sku-vision', payload),
})

// 数据库操作 API
contextBridge.exposeInMainWorld('api', {
  db: {
    testConnection: (config: DbConfig): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('db:test-connection', config),

    getPackagingPresets: (): Promise<{ success: boolean; data?: PackagingPreset[]; error?: string }> =>
      ipcRenderer.invoke('db:get-packaging-presets'),

    savePackagingPreset: (preset: { id?: number; name: string; length: number; width: number; height: number; weight: number }): Promise<{ success: boolean; data?: PackagingPreset; error?: string }> =>
      ipcRenderer.invoke('db:save-packaging-preset', preset),

    getNextSkuSeq: (prefix: string): Promise<{ success: boolean; data?: string; error?: string }> =>
      ipcRenderer.invoke('db:get-next-sku-seq', prefix),

    saveSpuAndSkus: (spu: SpuData, skus: SkuItem[]): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('db:save-spu-and-skus', spu, skus),
  }
})
