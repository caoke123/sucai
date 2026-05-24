// ==================== Asset Manifest Builder ====================

import path from 'path'
import { LABEL_TO_FOLDER, FOLDER_TO_R2_CATEGORY } from '@shared/constants'
import type { AssetManifest, AssetDescriptor, R2Metadata } from '@shared/types'
import type { RenamedFile } from './renameImages'

export interface BuildAssetManifestInput {
  packagePath: string
  renamedFiles: RenamedFile[]
  r2Metadata?: R2Metadata
}

// label → asset category key mapping
const LABEL_TO_CATEGORY: Record<string, keyof AssetManifest> = {
  '主图': 'main',
  'SKU图': 'sku',
  '详情图': 'detail',
  '尺寸图': 'size',
  '证书': 'certificate',
}

function emptyManifest(): AssetManifest {
  return { main: [], sku: [], detail: [], size: [], certificate: [] }
}

export function buildAssetManifest(input: BuildAssetManifestInput): AssetManifest {
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

    const descriptor: AssetDescriptor = {
      fileName: file.newFileName,
      relativePath,
      localPath: file.destPath,
      r2Url,
    }

    manifest[category].push(descriptor)
  }

  return manifest
}
