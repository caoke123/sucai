import fs from 'fs'
import path from 'path'
import type { ProductOutput, ProductInfo, SkuItem } from '@shared/types'
import { TOOL_VERSION } from '@shared/constants'

export interface BuildProductJsonInput {
  productInfo: ProductInfo
  skuList: SkuItem[]
  outerPackaging?: {
    length: number
    width: number
    height: number
    weight: number
    presetName: string
  }
}

export function buildProductJsonData(input: BuildProductJsonInput): ProductOutput {
  const { productInfo, skuList, outerPackaging } = input

  return {
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
    skus: (skuList || []).map((sku) => ({
      skuCode: sku.skuCode,
      skuName: sku.colorName,
      size: sku.dimensions || '',
      weight: sku.weight ?? 0,
      costPrice: sku.costPrice ?? 0,
      sellingPrice: sku.sellingPrice ?? 0,
      image: path.basename(sku.imagePath || ''),
    })),
    createdAt: new Date().toISOString(),
    toolVersion: TOOL_VERSION,
  }
}

export function writeProductJson(packagePath: string, data: ProductOutput): string {
  const jsonPath = path.join(packagePath, 'product.json')
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
  return jsonPath
}
