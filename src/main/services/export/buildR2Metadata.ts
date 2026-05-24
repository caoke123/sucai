// ==================== R2 Metadata 构建 ====================

import type { R2Metadata, R2ImageEntry } from '@shared/types'
import { getMetadataVersion } from '../r2/versioning/getMetadataVersion'
import { buildMetadataV4 } from '../r2/versioning/metadataV4'

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
  const version = getMetadataVersion()

  switch (version) {
    case 'v4':
      return buildMetadataV4(input)
    default:
      return buildMetadataV4(input)
  }
}
