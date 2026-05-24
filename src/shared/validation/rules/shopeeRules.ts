// ==================== Shopee 字段校验规则 ====================

import type { ValidationIssue, ValidationContext } from '../types'

export function validateShopeeRules(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const shopee = ctx.shopeeInfo
  if (!shopee) return issues

  // error: 标题非空
  if (!shopee.title || !shopee.title.trim()) {
    issues.push({
      field: 'shopee.title',
      level: 'error',
      message: 'Shopee 英文标题为必填项',
    })
  } else if (shopee.title.length > 120) {
    issues.push({
      field: 'shopee.title',
      level: 'error',
      message: `Shopee 英文标题超过120字符 (当前 ${shopee.title.length})`,
    })
  }

  // error: 描述非空
  if (!shopee.descriptionText || !shopee.descriptionText.trim()) {
    issues.push({
      field: 'shopee.descriptionText',
      level: 'error',
      message: 'Shopee 英文描述为必填项',
    })
  }

  // warning: 材质
  if (!shopee.attributes.material || !shopee.attributes.material.trim()) {
    issues.push({
      field: 'shopee.attributes.material',
      level: 'warning',
      message: '建议填写商品材质信息',
    })
  }

  return issues
}
