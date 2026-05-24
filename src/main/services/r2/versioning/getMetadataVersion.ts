// ==================== R2 Metadata 版本决定 ====================

export type MetadataVersion = 'v4'

export interface MetadataVersionContext {
  toolVersion?: string
}

export function getMetadataVersion(_ctx?: MetadataVersionContext): MetadataVersion {
  return 'v4'
}
