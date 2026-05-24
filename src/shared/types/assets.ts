// ==================== 素材资源描述符与清单 ====================

export interface AssetFile {
  fileName: string
  relativePath: string
  localPath: string
  r2Url?: string
  uploaded?: boolean
}

export interface ProductAssets {
  main: AssetFile[]
  sku: AssetFile[]
  detail: AssetFile[]
  size: AssetFile[]
  certificate: AssetFile[]
}
