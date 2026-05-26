// ==================== Validation 类型定义 ====================

export type ValidationLevel = 'error' | 'warning'

export interface ValidationIssue {
  field: string
  level: ValidationLevel
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

export interface ValidationContext {
  shopeeInfo?: {
    title: string
    descriptionText: string
    attributes: { material: string }
    minimumOrderQty: number
    jitInvitationCode: string
  }
  skus?: Array<{
    skuName: string
    sellingPrice: number
    stock: number
  }>
  images?: {
    mainCount: number
    skuCount: number
  }
}
