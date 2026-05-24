// ==================== v4 R2 Metadata Builder ====================
// 纯函数: 不写文件, 不上传, 不依赖 Electron API

import { FOLDER_TO_R2_CATEGORY, TOOL_VERSION } from '@shared/constants'
import type { R2Metadata, R2ImageEntry } from '@shared/types'

export interface MetadataV4Input {
  folderName: string
  baseUrl: string
  uploadedPaths: Array<{ relativePath: string; s3Key: string }>
  originalSkus: Array<Record<string, unknown>>
}

function buildUrl(baseUrl: string, key: string): string {
  return baseUrl + '/' + key.split('/').map((seg) => encodeURIComponent(seg)).join('/')
}

export function buildMetadataV4(input: MetadataV4Input): {
  r2Field: R2Metadata
  updatedSkus: Array<Record<string, unknown>>
} {
  const { folderName, baseUrl, uploadedPaths } = input
  const encodedFolder = encodeURIComponent(folderName)

  // 按分类组织图片
  const r2Images: Record<string, R2ImageEntry[]> = {
    main: [],
    sku: [],
    detail: [],
    size: [],
    certificate: [],
  }

  for (const uploaded of uploadedPaths) {
    const parts = uploaded.relativePath.replace(/\\/g, '/').split('/')
    if (parts.length < 2) continue
    const dirName = parts[0]
    const fileName = parts[parts.length - 1]
    const category = FOLDER_TO_R2_CATEGORY[dirName]
    if (!category) continue

    r2Images[category].push({
      fileName,
      url: buildUrl(baseUrl, uploaded.s3Key),
    })
  }

  // 为 SKU 数据补充 imageUrl
  const skus = input.originalSkus
  const skuImagesList = r2Images.sku
  const updatedSkus = skus.map((sku) => {
    const skuName = (sku.skuName as string) || ''
    const matched = skuImagesList.find((img) =>
      img.fileName.includes(skuName)
    )
    return matched ? { ...sku, imageUrl: matched.url } : sku
  })

  // 计算 stockSummary
  let totalStock = 0
  for (const sku of updatedSkus) {
    const stock = Number(sku.stock) || 0
    totalStock += stock
  }

  const r2Field: R2Metadata = {
    basePath: `products/${folderName}/`,
    baseUrl: `${baseUrl}/products/${encodedFolder}/`,
    syncedAt: new Date().toISOString(),
    images: r2Images,
    toolVersion: TOOL_VERSION,
    stockSummary: {
      totalStock,
      skuCount: updatedSkus.length,
    },
  }

  return { r2Field, updatedSkus }
}
