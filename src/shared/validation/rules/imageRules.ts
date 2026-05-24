// ==================== 图片完整性校验规则 ====================

import type { ValidationIssue, ValidationContext } from '../types'

export function validateImageRules(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const img = ctx.images
  if (!img) return issues

  // error: 主图 ≥ 1
  if (img.mainCount < 1) {
    issues.push({
      field: 'images.main',
      level: 'error',
      message: '产品主图至少需要 1 张',
    })
  }

  // error: 有 SKU 但无 SKU 图
  if (img.skuCount === 0 && (ctx.skus?.length ?? 0) > 0) {
    issues.push({
      field: 'images.sku',
      level: 'error',
      message: '缺少 SKU 规格图片',
    })
  }

  // warning: SKU 数量与图片数量不匹配
  if (img.skuCount > 0 && (ctx.skus?.length ?? 0) > img.skuCount) {
    issues.push({
      field: 'images.sku',
      level: 'warning',
      message: `${(ctx.skus?.length ?? 0) - img.skuCount} 个 SKU 缺少对应图片`,
    })
  }

  return issues
}
