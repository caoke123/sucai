// ==================== v4 PIM 扩展字段类型 ====================

export interface PimExtension {
  syncedAt: string | null
  status: 'draft' | 'synced' | 'published'
}
