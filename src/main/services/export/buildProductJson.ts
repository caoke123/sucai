// ==================== product.json 构建与写入 ====================

import fs from 'fs'
import path from 'path'
import type { ProductOutput, ProductInfo, SkuItem, ShopeeInfo, ProductAssets } from '@shared/types'
import { getExportVersion } from './versioning/getExportVersion'
import { buildV4ProductJson } from './versioning/exportV4'
import { buildAssetManifest } from './buildAssetManifest'
import type { RenamedFile } from './renameImages'

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
  renamedFiles?: RenamedFile[]
}

export function buildProductJsonData(input: BuildProductJsonInput): ProductOutput {
  const { productInfo, skuList, outerPackaging, shopeeInfo, localPackagePath, renamedFiles } = input

  let assetManifest: ProductAssets | undefined
  if (renamedFiles && localPackagePath) {
    assetManifest = buildAssetManifest({
      packagePath: localPackagePath,
      renamedFiles,
    })
  }

  const version = getExportVersion({ shopeeInfo })

  switch (version) {
    case 'v4':
      return buildV4ProductJson({
        productInfo,
        skuList,
        outerPackaging,
        shopeeInfo,
        localPackagePath,
        assetManifest,
      })
    default:
      return buildV4ProductJson({
        productInfo,
        skuList,
        outerPackaging,
        shopeeInfo,
        localPackagePath,
        assetManifest,
      })
  }
}

export function writeProductJson(packagePath: string, data: ProductOutput): string {
  const jsonPath = path.join(packagePath, 'product.json')
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
  return jsonPath
}
