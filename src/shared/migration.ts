// ==================== product.json 版本迁移模块 ====================
// 所有迁移函数均为纯函数，返回新对象，不修改入参
// 原则: 缺失字段补默认值，不覆盖已有字段，保留所有现有数据

import { DEFAULT_SHOPEE_VALUES, TOOL_VERSION } from './constants'

// 解析主版本号 (e.g. '3.0.0' → 3, '4.0.0-beta.1' → 4, missing → 1)
function parseMajorVersion(version?: string): number {
  if (!version) return 1
  const match = version.match(/^(\d+)\./)
  return match ? parseInt(match[1], 10) : 1
}

// 迁移 v1.x → v4: 无任何扩展字段
function migrateV1ToV4(data: Record<string, unknown>): Record<string, unknown> {
  return applyV4Defaults(data, false)
}

// 迁移 v2.x → v4: 同 v1，早期版本无扩展字段
function migrateV2ToV4(data: Record<string, unknown>): Record<string, unknown> {
  return applyV4Defaults(data, false)
}

// 迁移 v3.x → v4: 已有 r2 字段
function migrateV3ToV4(data: Record<string, unknown>): Record<string, unknown> {
  return applyV4Defaults(data, true)
}

// 应用 v4 默认值
function applyV4Defaults(data: Record<string, unknown>, hasR2: boolean): Record<string, unknown> {
  const result = { ...data }

  // toolVersion 升级
  if (!result.toolVersion || parseMajorVersion(result.toolVersion as string) < 4) {
    result.toolVersion = TOOL_VERSION
  }

  // localPath (不覆盖已有)
  if (result.localPath === undefined) {
    result.localPath = ''
  }

  // shopee 对象
  if (result.shopee === undefined || result.shopee === null) {
    result.shopee = {
      title: '',
      descriptionText: '',
      attributes: {
        brand: DEFAULT_SHOPEE_VALUES.brand,
        origin: DEFAULT_SHOPEE_VALUES.origin,
        material: DEFAULT_SHOPEE_VALUES.material,
        size: DEFAULT_SHOPEE_VALUES.size,
      },
      leadTime: DEFAULT_SHOPEE_VALUES.leadTime,
      minimumOrderQty: DEFAULT_SHOPEE_VALUES.minimumOrderQty,
      jitInvitationCode: DEFAULT_SHOPEE_VALUES.jitInvitationCode,
    }
  } else {
    // 已有 shopee 对象时, 确保新字段存在
    if ((result.shopee as Record<string, unknown>).minimumOrderQty === undefined) {
      (result.shopee as Record<string, unknown>).minimumOrderQty = DEFAULT_SHOPEE_VALUES.minimumOrderQty
    }
    if ((result.shopee as Record<string, unknown>).jitInvitationCode === undefined) {
      (result.shopee as Record<string, unknown>).jitInvitationCode = DEFAULT_SHOPEE_VALUES.jitInvitationCode
    }
  }

  // pim 扩展字段
  if (result.pim === undefined || result.pim === null) {
    result.pim = { syncedAt: null, status: 'draft' }
  }

  // SKU 数组升级
  const skus = result.skus as Array<Record<string, unknown>> | undefined
  if (Array.isArray(skus)) {
    result.skus = skus.map((sku) => ({
      ...sku,
      stock: sku.stock !== undefined ? sku.stock : 0,
      skuNameEn: sku.skuNameEn !== undefined ? sku.skuNameEn : '',
      imageUrl: sku.imageUrl !== undefined ? sku.imageUrl : '',
    }))
  }

  // r2 字段：v3 已有则保留，v1/v2 则设空
  if (!hasR2 && result.r2 === undefined) {
    result.r2 = undefined
  }

  // assets 字段：旧版本缺失时留空（后续重新导出时自动构建）
  if (result.assets === undefined) {
    result.assets = undefined
  }

  return result
}

// 判断是否为有效的 product.json 对象
export function isValidProductJson(obj: unknown): obj is Record<string, unknown> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    !Array.isArray(obj) &&
    typeof (obj as Record<string, unknown>).title === 'string'
  )
}

// 主迁移入口
// 根据 toolVersion 自动选择迁移路径
export function migrateProductJson(
  rawData: Record<string, unknown>
): Record<string, unknown> {
  const version = parseMajorVersion(rawData.toolVersion as string | undefined)

  switch (version) {
    case 1:
      return migrateV1ToV4(rawData)
    case 2:
      return migrateV2ToV4(rawData)
    case 3:
      return migrateV3ToV4(rawData)
    case 4:
      // v4.x 无需迁移，但确保所有可选字段存在
      return applyV4Defaults(rawData, true)
    default:
      console.warn(`[migration] 未知 toolVersion: ${rawData.toolVersion}，按 v1 处理`)
      return migrateV1ToV4(rawData)
  }
}

// 获取版本信息
export function getMigrationInfo(rawData: Record<string, unknown>): {
  currentVersion: string
  majorVersion: number
  needsMigration: boolean
  missingFields: string[]
} {
  const currentVersion = (rawData.toolVersion as string) || '1.0.0'
  const majorVersion = parseMajorVersion(currentVersion)
  const missingFields: string[] = []

  if (!rawData.localPath) missingFields.push('localPath')
  if (!rawData.shopee) missingFields.push('shopee')
  if (!rawData.pim) missingFields.push('pim')
  if (!rawData.assets) missingFields.push('assets')

  const skus = rawData.skus as Array<Record<string, unknown>> | undefined
  if (Array.isArray(skus)) {
    const hasStock = skus.every((s) => s.stock !== undefined)
    const hasSkuNameEn = skus.every((s) => s.skuNameEn !== undefined)
    if (!hasStock) missingFields.push('skus[].stock')
    if (!hasSkuNameEn) missingFields.push('skus[].skuNameEn')
  }

  return {
    currentVersion,
    majorVersion,
    needsMigration: majorVersion < 4 || missingFields.length > 0,
    missingFields,
  }
}
