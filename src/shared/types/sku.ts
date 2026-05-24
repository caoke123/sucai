// ==================== SKU / SPU / 纸箱预设类型 ====================

export interface SkuItem {
  skuCode: string
  colorName: string
  dimensions: string
  weight: number
  costPrice: number
  sellingPrice: number
  imagePath: string
  previewUrl?: string
  needAiName?: boolean
}

export interface SpuData {
  spuCode: string
  spuName: string
  categoryCode: string
  styleCode: string
  outerPackLength: number
  outerPackWidth: number
  outerPackHeight: number
  outerPackWeight: number
}

export interface PackagingPreset {
  id?: number
  name: string
  length: number
  width: number
  height: number
  weight: number
}

export interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}
