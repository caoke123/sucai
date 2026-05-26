// ==================== Asset Manifest Builder ====================

import path from 'path'
import { LABEL_TO_FOLDER, FOLDER_TO_R2_CATEGORY } from '@shared/constants'
import type { ProductAssets, AssetFile, R2Metadata } from '@shared/types'
import type { RenamedFile } from './renameImages'
import { normalizeFilePath } from '@shared/utils/normalizePath'

export interface BuildAssetManifestInput {
  packagePath: string
  renamedFiles: RenamedFile[]
  r2Metadata?: R2Metadata
}

const LABEL_TO_CATEGORY: Record<string, keyof ProductAssets> = {
  '主图': 'main',
  'SKU图': 'sku',
  '详情图': 'detail',
  '尺寸图': 'size',
  '证书': 'certificate',
}

function emptyManifest(): ProductAssets {
  return { main: [], sku: [], detail: [], size: [], certificate: [] }
}

export function buildAssetManifest(input: BuildAssetManifestInput): ProductAssets {
  const { packagePath, renamedFiles, r2Metadata } = input
  const manifest = emptyManifest()

  for (const file of renamedFiles) {
    const category = LABEL_TO_CATEGORY[file.label]
    if (!category) continue

    const folderName = LABEL_TO_FOLDER[file.label] || ''
    const relativePath = path.join(folderName, file.newFileName).replace(/\\/g, '/')

    let r2Url: string | undefined
    if (r2Metadata) {
      const r2Images = r2Metadata.images
      if (r2Images) {
        const catImages = r2Images[FOLDER_TO_R2_CATEGORY[folderName] as keyof typeof r2Images] || []
        const matched = catImages.find((img) => img.fileName === file.newFileName)
        if (matched) r2Url = matched.url
      }
    }

    const asset: AssetFile = {
      fileName: file.newFileName,
      relativePath,
      localPath: normalizeFilePath(file.destPath),
      r2Url,
    }

    manifest[category].push(asset)
  }

  return manifest
}
