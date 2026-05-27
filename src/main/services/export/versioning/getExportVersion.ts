// ==================== 导出版本决定 ====================

export type ExportVersion = 'v4.5'

export interface ExportVersionContext {
  shopeeInfo?: unknown
  toolVersion?: string
}

export function getExportVersion(_ctx?: ExportVersionContext): ExportVersion {
  return 'v4.5'
}
