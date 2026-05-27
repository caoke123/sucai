// ==================== v4.5 PIM 扩展字段类型 ====================

export interface PimExtension {
  syncedAt: string | null
  status: 'ready' | 'synced' | 'published'
  notes: string
}
