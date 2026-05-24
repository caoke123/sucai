import { FOLDER_TO_R2_CATEGORY } from '../../../shared/constants'
import type { R2Metadata, R2ImageEntry } from '../../../shared/types'

export interface BuildR2MetadataInput {
  folderName: string
  baseUrl: string
  uploadedPaths: Array<{ relativePath: string; s3Key: string }>
  originalSkus: Array<Record<string, unknown>>
}

export function buildR2Metadata(input: BuildR2MetadataInput): {
  r2Field: R2Metadata
  updatedSkus: Array<Record<string, unknown>>
} {
  const { folderName, baseUrl, uploadedPaths } = input

  const encodedFolder = encodeURIComponent(folderName)

  const buildUrl = (key: string): string => {
    return baseUrl + '/' + key.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  }

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
    const folderNameFromPath = parts[0]
    const fileName = parts[parts.length - 1]
    const category = FOLDER_TO_R2_CATEGORY[folderNameFromPath]
    if (!category) continue

    r2Images[category].push({
      fileName,
      url: buildUrl(uploaded.s3Key),
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

  const r2Field: R2Metadata = {
    basePath: `products/${folderName}/`,
    baseUrl: `${baseUrl}/products/${encodedFolder}/`,
    syncedAt: new Date().toISOString(),
    images: r2Images,
  }

  return { r2Field, updatedSkus }
}
