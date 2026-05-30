// ==================== SKU 字段校验规则 ====================

import type { ValidationIssue, ValidationContext } from '../types'

export function validateSkuRules(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const skus = ctx.skus
  if (!skus || skus.length === 0) {
    issues.push({
      field: 'skus',
      level: 'error',
      message: 'SKU 列表不能为空',
    })
    return issues
  }

  // 每个 SKU 名称非空
  skus.forEach((sku, i) => {
    if (!sku.skuName || !sku.skuName.trim()) {
      issues.push({
        field: `skus[${i}].skuName`,
        level: 'error',
        message: `第 ${i + 1} 个 SKU 名称为空`,
      })
    }
  })

  return issues
}
