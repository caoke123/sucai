import type { ImageFile } from './image'
import type { ProductPlatforms } from './shopee'
import type { R2MetadataV45 } from './r2'
import type { PimExtension } from './pim'
import type { ProductImages, SkuOutputV45 } from './sku'

// ==================== 产品基础信息 (UI Store 用, 不变) ====================

export interface ProductInfo {
  title: string
  currency: string
  productNo: string
  category: string
  description: string
  pattern: string
  productType: string
  material: string
  customProduct: 'No' | 'Yes'
  spec1Name: string
  spec2Name: string
  skuSpecs: SkuSpecRow[]
}

export interface SkuSpecRow {
  id: string
  spec1?: string
  spec2?: string
}

// ==================== product.json v4.5 输出类型 ====================

export interface InternalInfo {
  title: string
  description: string
  category: string
  localPath: string
}

export interface ProductOutput {
  productNo: string
  toolVersion: string
  createdAt: string
  updatedAt: string
  internal: InternalInfo
  platforms: ProductPlatforms
  skus: SkuOutputV45[]
  images: ProductImages
  pim: PimExtension
  r2: R2MetadataV45
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
  shopeeInfo?: import('./shopee').ShopeeInfo
  compressResults?: Record<string, import('./compress').CompressResult>
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
