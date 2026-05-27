// ==================== Shopee 字段校验规则 ====================

import type { ValidationIssue, ValidationContext } from '../types'

const VALID_JIT_CODES = ['IVCN202507240989', 'IVCN202507240990', 'IVCN202507240991']

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
  } else if (shopee.title.length > 160) {
    issues.push({
      field: 'shopee.title',
      level: 'error',
      message: `Shopee 英文标题超过160字符 (当前 ${shopee.title.length})`,
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
  if (!shopee.material || !shopee.material.trim()) {
    issues.push({
      field: 'material',
      level: 'warning',
      message: '建议填写商品材质信息',
    })
  }

  // error: 起订量范围
  const mqty = shopee.minimumOrderQty
  if (typeof mqty !== 'number' || isNaN(mqty) || mqty < 1) {
    issues.push({
      field: 'shopee.minimumOrderQty',
      level: 'error',
      message: '起订量必须 >= 1',
    })
  } else if (mqty > 9999) {
    issues.push({
      field: 'shopee.minimumOrderQty',
      level: 'error',
      message: '起订量不能超过 9999',
    })
  }

  // warning: JIT 邀请码
  const jit = shopee.jitInvitationCode
  if (jit && jit.trim() && !VALID_JIT_CODES.includes(jit.trim())) {
    issues.push({
      field: 'shopee.jitInvitationCode',
      level: 'warning',
      message: 'JIT 邀请码不在已知列表中',
    })
  }

  return issues
}
