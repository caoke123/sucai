// ==================== v4 ProductOutput Builder ====================

import path from 'path'
import type { ProductOutput, ProductInfo, SkuOutput, ProductAssets } from '@shared/types'
import type { SkuItem, ShopeeInfo } from '@shared/types'
import { TOOL_VERSION } from '@shared/constants'

export interface ExportV4Input {
  productInfo: ProductInfo
  skuList: SkuItem[]
  outerPackaging?: {
    length: number
    width: number
    height: number
    weight: number
    presetName: string
  }
  shopeeInfo?: ShopeeInfo
  localPackagePath?: string
  assetManifest?: ProductAssets
}

export function buildV4ProductJson(input: ExportV4Input): ProductOutput {
  const { productInfo, skuList, outerPackaging, shopeeInfo, localPackagePath, assetManifest } = input

  const skus: SkuOutput[] = (skuList || []).map((sku) => ({
    skuCode: sku.skuCode,
    skuName: sku.colorName,
    size: sku.dimensions || '',
    weight: sku.weight ?? 0,
    costPrice: sku.costPrice ?? 0,
    sellingPrice: sku.sellingPrice ?? 0,
    image: path.basename(sku.imagePath || ''),
    stock: sku.stock ?? 0,
    skuNameEn: sku.skuNameEn || '',
  }))

  const output: ProductOutput = {
    title: productInfo.title,
    productNo: productInfo.productNo || '',
    category: productInfo.category || '',
    description: productInfo.description || '',
    outerPackaging: {
      length: outerPackaging?.length ?? null,
      width: outerPackaging?.width ?? null,
      height: outerPackaging?.height ?? null,
      weight: outerPackaging?.weight ?? null,
      presetName: outerPackaging?.presetName || '',
    },
    skus,
    createdAt: new Date().toISOString(),
    toolVersion: TOOL_VERSION,
    localPath: localPackagePath || '',
    pim: { syncedAt: null, status: 'draft' },
    assets: assetManifest,
  }

  // Shopee 信息 (仅在有数据时写入)
  if (shopeeInfo) {
    output.shopee = {
      title: shopeeInfo.title || '',
      descriptionText: shopeeInfo.descriptionText || '',
      attributes: {
        brand: shopeeInfo.attributes?.brand || 'No Brand',
        origin: shopeeInfo.attributes?.origin || 'China',
        material: shopeeInfo.attributes?.material || '',
        size: shopeeInfo.attributes?.size || '',
      },
      leadTime: shopeeInfo.leadTime ?? 5,
    }
  }

  return output
}
