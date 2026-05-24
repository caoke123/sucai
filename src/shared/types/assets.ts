// ==================== 素材资源描述符与清单 ====================

export interface AssetDescriptor {
  fileName: string
  relativePath: string
  localPath: string
  r2Url?: string
}

export interface AssetManifest {
  main: AssetDescriptor[]
  sku: AssetDescriptor[]
  detail: AssetDescriptor[]
  size: AssetDescriptor[]
  certificate: AssetDescriptor[]
}
