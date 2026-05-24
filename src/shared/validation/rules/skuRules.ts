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

  // 每个 SKU 售价 > 0
  const noPrice = skus.filter((s) => !s.sellingPrice || s.sellingPrice <= 0)
  if (noPrice.length > 0) {
    const names = noPrice.map((_, i) => {
      const idx = skus.indexOf(noPrice[0]) + i
      return `第 ${idx + 1} 个`
    }).join('、')
    issues.push({
      field: 'skus.sellingPrice',
      level: 'error',
      message: `${noPrice.length} 个 SKU 售价未填写或 ≤0`,
    })
  }

  // 每个 SKU 库存 > 0
  const noStock = skus.filter((s) => !s.stock || s.stock <= 0)
  if (noStock.length > 0) {
    issues.push({
      field: 'skus.stock',
      level: 'error',
      message: `${noStock.length} 个 SKU 库存未填写或 ≤0`,
    })
  }

  return issues
}
