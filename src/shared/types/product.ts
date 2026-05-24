import type { ImageFile } from './image'

// ==================== 产品基础信息 ====================

export interface ProductInfo {
  title: string
  currency: string
  sourceUrl: string
  sourcePlatform: string
  productNo: string
  category: string
  description: string
  attributes: string
  spec1Name: string
  spec2Name: string
  skuSpecs: SkuSpecRow[]
}

export interface SkuSpecRow {
  id: string
  spec1?: string
  spec2?: string
}

// ==================== product.json 输出类型 ====================

export interface ProductOutput {
  title: string
  productNo: string
  category: string
  description: string
  outerPackaging: OuterPackaging
  skus: SkuOutput[]
  createdAt: string
  toolVersion: string
  // v4 扩展字段（可选，向后兼容 v3）
  localPath?: string
}

export interface OuterPackaging {
  length: number | null
  width: number | null
  height: number | null
  weight: number | null
  presetName: string
}

export interface SkuOutput {
  skuCode: string
  skuName: string
  size: string
  weight: number
  costPrice: number
  sellingPrice: number
  image: string
  // v4 扩展字段
  stock?: number
  skuNameEn?: string
  imageUrl?: string
}

// ==================== IPC 通信类型 ====================

export interface OrganizeRequest {
  sourceFolderPath: string
  outputFolderPath: string
  images: ImageFile[]
  productInfo: ProductInfo
  shortTitle?: string
  skuList?: import('./sku').SkuItem[]
  outerPackaging?: {
    length: number
    width: number
    height: number
    weight: number
    presetName: string
  }
}

export interface OrganizeResult {
  success: boolean
  outputPath?: string
  error?: string
}

export interface ScanFolderRequest {
  folderPath: string
}

export interface ScanFolderResult {
  success: boolean
  images?: ImageFile[]
  error?: string
}
