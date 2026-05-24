// ==================== product.json 构建与写入 ====================

import fs from 'fs'
import path from 'path'
import type { ProductOutput, ProductInfo, SkuItem, ShopeeInfo } from '@shared/types'
import { getExportVersion } from './versioning/getExportVersion'
import { buildV4ProductJson } from './versioning/exportV4'

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
  shopeeInfo?: ShopeeInfo
  localPackagePath?: string
}

export function buildProductJsonData(input: BuildProductJsonInput): ProductOutput {
  const { productInfo, skuList, outerPackaging, shopeeInfo, localPackagePath } = input

  const version = getExportVersion({ shopeeInfo })

  switch (version) {
    case 'v4':
      return buildV4ProductJson({
        productInfo,
        skuList,
        outerPackaging,
        shopeeInfo,
        localPackagePath,
      })
    default:
      return buildV4ProductJson({
        productInfo,
        skuList,
        outerPackaging,
        shopeeInfo,
        localPackagePath,
      })
  }
}

export function writeProductJson(packagePath: string, data: ProductOutput): string {
  const jsonPath = path.join(packagePath, 'product.json')
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
  return jsonPath
}
