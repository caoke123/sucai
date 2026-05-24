// ==================== 图片完整性校验规则 ====================

import type { ValidationIssue, ValidationContext } from '../types'

export function validateImageRules(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const img = ctx.images
  if (!img) return issues

  // error: 主图 ≥1
  if (img.mainCount < 1) {
    issues.push({
      field: 'images.main',
      level: 'error',
      message: '产品主图至少需要 1 张',
    })
  }

  // error: SKU 图完整性 (每个 SKU 名称都有对应图片)
  if (img.skuCount === 0 && (ctx.skus?.length ?? 0) > 0) {
    issues.push({
      field: 'images.sku',
      level: 'error',
      message: '缺少 SKU 规格图片',
    })
  } else if (img.skuWithNameCount < img.skuCount) {
    issues.push({
      field: 'images.sku',
      level: 'warning',
      message: `${img.skuCount - img.skuWithNameCount} 张 SKU 图未设置规格名称`,
    })
  }

  return issues
}
