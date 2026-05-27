// ==================== SKU / SPU / 纸箱预设类型 ====================

// Store 侧使用的 SKU 类型 (不变)
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
  stock?: number
  skuNameEn?: string
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

// ==================== product.json v4.5 输出类型 ====================

export interface ProductImage {
  index: number
  fileName: string
  localPath: string
  r2Url: string
}

export interface ProductImages {
  main: ProductImage[]
  detail: ProductImage[]
}

export interface SkuOutputV45 {
  index: number
  skuCode: string
  nameZh: string
  nameEn: string
  weight: number
  size: SkuSize
  pricing: SkuPricing
  stock: number
  images: {
    primary: ProductImage | null
  }
}

export interface SkuSize {
  length: number
  width: number
  height: number
  unit: 'cm'
}

export interface SkuPricing {
  cost: number
  selling: number
  currency: 'CNY' | 'USD'
}
