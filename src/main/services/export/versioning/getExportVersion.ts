// ==================== 导出版本决定 ====================

export type ExportVersion = 'v4'

export interface ExportVersionContext {
  shopeeInfo?: unknown
  toolVersion?: string
}

export function getExportVersion(ctx: ExportVersionContext): ExportVersion {
  // 当前仅支持 v4
  // 未来可扩展: v5/v6 基于 feature flags
  return 'v4'
}
