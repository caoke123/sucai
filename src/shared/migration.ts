// ==================== product.json 版本迁移模块 ====================

import { DEFAULT_SHOPEE_VALUES, TOOL_VERSION } from './constants'

function parseVersion(version?: string): string {
  return version || '1.0.0'
}

function isLegacy(version: string): boolean {
  const match = version.match(/^(\d+)\.(\d+)/)
  if (!match) return true
  const major = parseInt(match[1])
  const minor = parseInt(match[2]) || 0
  return major < 4 || (major === 4 && minor < 5)
}

function parseSize(raw: unknown): { length: number; width: number; height: number; unit: string } {
  // 已经是对象格式
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    return {
      length: Number(o.length) || 0,
      width: Number(o.width) || 0,
      height: Number(o.height) || 0,
      unit: (o.unit as string) || 'cm',
    }
  }
  // 字符串格式 "6x6x12"
  const str = String(raw || '')
  if (!str) return { length: 0, width: 0, height: 0, unit: 'cm' }
  const parts = str.split(/[x×X]/).map((p) => parseFloat(p.trim()) || 0)
  if (parts.length >= 3) return { length: parts[0], width: parts[1], height: parts[2], unit: 'cm' }
  if (parts.length === 2) return { length: parts[0], width: parts[1], height: 0, unit: 'cm' }
  if (parts.length === 1) return { length: parts[0], width: 0, height: 0, unit: 'cm' }
  return { length: 0, width: 0, height: 0, unit: 'cm' }
}

function migrateLegacyToV45(data: Record<string, unknown>): Record<string, unknown> {
  console.warn('[migration] 检测到旧版 product.json (v4.x), 已自动升级为 v4.5 结构')

  const now = new Date().toISOString()
  const oldSkus = (data.skus as Array<Record<string, unknown>>) || []
  const oldShopee = data.shopee as Record<string, unknown> | undefined
  const oldR2 = data.r2 as Record<string, unknown> | undefined

  const newSkus = oldSkus.map((sku, i) => {
    const size = sku.size !== undefined ? sku.size : sku.dimensions || ''
    return {
      index: i,
      skuCode: sku.skuCode || '',
      nameZh: (sku.skuName as string) || (sku.colorName as string) || '',
      nameEn: (sku.skuNameEn as string) || '',
      weight: Number(sku.weight) || 0,
      size: parseSize(size),
      pricing: {
        cost: Number(sku.costPrice) || 0,
        selling: Number(sku.sellingPrice) || 0,
        currency: 'CNY',
      },
      stock: Number(sku.stock) || 0,
      images: {
        primary: null,
      },
    }
  })

  // 绑定 SKU 图片
  const oldAssets = data.assets as Record<string, Array<Record<string, unknown>>> | undefined
  if (oldAssets?.sku) {
    const skuAssets = oldAssets.sku
    newSkus.forEach((sku: Record<string, unknown>, i: number) => {
      if (skuAssets[i]) {
        (sku.images as Record<string, unknown>).primary = {
          index: 0,
          fileName: skuAssets[i].fileName || '',
          localPath: skuAssets[i].localPath || '',
          r2Url: skuAssets[i].r2Url || (oldSkus[i]?.imageUrl as string) || '',
        }
      }
    })
  }

  // 构建 images
  const newImages = { main: [] as Array<Record<string, unknown>>, detail: [] as Array<Record<string, unknown>> }
  if (oldAssets) {
    const sortFn = (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const matchA = (a.fileName as string).match(/(\d+)/)
      const matchB = (b.fileName as string).match(/(\d+)/)
      return (matchA ? parseInt(matchA[1]) : 0) - (matchB ? parseInt(matchB[1]) : 0)
    }
    for (const cat of ['main', 'detail'] as const) {
      const assets = oldAssets[cat] || []
      newImages[cat] = [...assets].sort(sortFn).map((img: Record<string, unknown>, index: number) => ({
        index,
        fileName: img.fileName || '',
        localPath: img.localPath || '',
        r2Url: img.r2Url || '',
      }))
    }
  }

  return {
    productNo: data.productNo || '',
    toolVersion: TOOL_VERSION,
    createdAt: data.createdAt || now,
    updatedAt: now,
    internal: {
      title: data.title || '',
      description: data.description || '',
      category: data.category || '',
      localPath: data.localPath || '',
    },
    platforms: {
      shopee: {
        title: oldShopee?.title || '',
        description: oldShopee?.descriptionText || '',
        category: [],
        attributes: {
          brand: oldShopee?.attributes
            ? (oldShopee.attributes as Record<string, unknown>).brand || DEFAULT_SHOPEE_VALUES.brand
            : DEFAULT_SHOPEE_VALUES.brand,
          origin: oldShopee?.attributes
            ? (oldShopee.attributes as Record<string, unknown>).origin || DEFAULT_SHOPEE_VALUES.origin
            : DEFAULT_SHOPEE_VALUES.origin,
          '材质': oldShopee?.attributes
            ? (oldShopee.attributes as Record<string, unknown>)['材质'] || (oldShopee.attributes as Record<string, unknown>).material || ''
            : '',
          '图案': oldShopee?.attributes
            ? (oldShopee.attributes as Record<string, unknown>)['图案'] || ''
            : '',
          '商品类型': oldShopee?.attributes
            ? (oldShopee.attributes as Record<string, unknown>)['商品类型'] || '其他'
            : '其他',
          'Custom Product': oldShopee?.attributes
            ? (oldShopee.attributes as Record<string, unknown>)['Custom Product'] || 'No'
            : 'No',
        },
        logistics: {
          leadTime: Number(oldShopee?.leadTime) || 5,
          minimumOrderQty: Number(oldShopee?.minimumOrderQty) || 5,
          jit: !!(oldShopee?.jitInvitationCode),
        },
        invitation: {
          code: (oldShopee?.jitInvitationCode as string) || '',
        },
        status: 'draft',
        publishedAt: null,
        shopeeItemId: null,
      },
    },
    skus: newSkus,
    images: newImages,
    pim: {
      status: ((data.pim as Record<string, unknown>)?.status as string) === 'draft' ? 'ready' : ((data.pim as Record<string, unknown>)?.status || 'ready'),
      syncedAt: (data.pim as Record<string, unknown>)?.syncedAt || null,
      notes: ((data.pim as Record<string, unknown>)?.notes as string) || '',
    },
    r2: {
      basePath: oldR2?.basePath || '',
      syncedAt: oldR2?.syncedAt || '',
    },
  }
}

// 主迁移入口
export function migrateProductJson(rawData: Record<string, unknown>): Record<string, unknown> {
  const currentVersion = parseVersion(rawData.toolVersion as string)

  if (isLegacy(currentVersion)) {
    return migrateLegacyToV45(rawData)
  }

  // 已是 v4.5+, 确保 updatedAt 存在
  if (!rawData.updatedAt) {
    rawData.updatedAt = new Date().toISOString()
  }

  return rawData
}

export function isValidProductJson(obj: unknown): obj is Record<string, unknown> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    !Array.isArray(obj) &&
    (typeof (obj as Record<string, unknown>).productNo === 'string' ||
     typeof (obj as Record<string, unknown>).title === 'string')
  )
}
