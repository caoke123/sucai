// ==================== 统一校验入口 ====================

import type { ValidationResult, ValidationContext } from './types'
import { validateShopeeRules } from './rules/shopeeRules'
import { validateSkuRules } from './rules/skuRules'
import { validateImageRules } from './rules/imageRules'

export type { ValidationLevel, ValidationIssue, ValidationResult, ValidationContext } from './types'

export function validateProduct(ctx: ValidationContext): ValidationResult {
  const shopeeIssues = validateShopeeRules(ctx)
  const skuIssues = validateSkuRules(ctx)
  const imageIssues = validateImageRules(ctx)

  const allIssues = [...shopeeIssues, ...skuIssues, ...imageIssues]

  // 仅 error 级别影响 valid
  const hasError = allIssues.some((issue) => issue.level === 'error')

  return {
    valid: !hasError,
    issues: allIssues,
  }
}
