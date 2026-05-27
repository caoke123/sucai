// ==================== product.json v4.5 Builder ====================

import path from 'path'
import type { ProductOutput, ProductInfo } from '@shared/types'
import type { SkuItem, ShopeeInfo, ProductImages, ProductImage, SkuOutputV45 } from '@shared/types'
import type { ProductAssets, AssetFile } from '@shared/types'
import { TOOL_VERSION } from '@shared/constants'

export interface ExportV45Input {
  productInfo: ProductInfo
  skuList: SkuItem[]
  outerPackaging?: {
    length: number
    width: number
    height: number
    weight: number
    presetName: string
  }
  shopeeInfo?: ShopeeInfo
  localPackagePath?: string
  assetManifest?: ProductAssets
  createdAt?: string
}

function parseSizeString(raw: string): { length: number; width: number; height: number; unit: 'cm' } {
  if (!raw || typeof raw !== 'string') {
    return { length: 0, width: 0, height: 0, unit: 'cm' }
  }
  const parts = raw.split(/[x×X]/).map((p) => parseFloat(p.trim()) || 0)
  if (parts.length >= 3) return { length: parts[0], width: parts[1], height: parts[2], unit: 'cm' }
  if (parts.length === 2) return { length: parts[0], width: parts[1], height: 0, unit: 'cm' }
  if (parts.length === 1) return { length: parts[0], width: 0, height: 0, unit: 'cm' }
  return { length: 0, width: 0, height: 0, unit: 'cm' }
}

function sortImagesByIndex(assets: AssetFile[]): ProductImage[] {
  return assets
    .map((img, i) => {
      const match = img.fileName.match(/(\d+)/)
      return { img, sortKey: match ? parseInt(match[1], 10) : i }
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((item, index) => ({
      index,
      fileName: item.img.fileName,
      localPath: item.img.localPath,
      r2Url: item.img.r2Url || '',
    }))
}

export function buildV45ProductJson(input: ExportV45Input): ProductOutput {
  const { productInfo, skuList, shopeeInfo, localPackagePath, assetManifest, createdAt } = input
  const now = new Date().toISOString()

  // SKU 输出
  const skus: SkuOutputV45[] = (skuList || []).map((sku, i) => {
    const skuAsset = assetManifest?.sku?.[i]
    return {
      index: i,
      skuCode: sku.skuCode,
      nameZh: sku.colorName,
      nameEn: sku.skuNameEn || '',
      weight: sku.weight ?? 0,
      size: parseSizeString(sku.dimensions || ''),
      pricing: {
        cost: sku.costPrice ?? 0,
        selling: sku.sellingPrice ?? 0,
        currency: 'CNY',
      },
      stock: sku.stock ?? 0,
      images: {
        primary: skuAsset
          ? { index: 0, fileName: skuAsset.fileName, localPath: skuAsset.localPath, r2Url: skuAsset.r2Url || '' }
          : null,
      },
    }
  })

  // 图片输出
  const images: ProductImages = {
    main: assetManifest ? sortImagesByIndex(assetManifest.main || []) : [],
    detail: assetManifest ? sortImagesByIndex(assetManifest.detail || []) : [],
  }

  // Shopee platform
  const shopee = shopeeInfo
    ? {
        title: shopeeInfo.title || '',
        description: shopeeInfo.descriptionText || '',
        category: [] as string[],
        attributes: {
          brand: shopeeInfo.attributes?.brand || 'NoBrand',
          origin: shopeeInfo.attributes?.origin || '中国大陆',
          material: shopeeInfo.attributes?.material || '',
        },
        logistics: {
          leadTime: shopeeInfo.leadTime ?? 5,
          minimumOrderQty: shopeeInfo.minimumOrderQty ?? 5,
          jit: !!shopeeInfo.jitInvitationCode,
        },
        invitation: {
          code: shopeeInfo.jitInvitationCode || '',
        },
        status: 'draft' as const,
        publishedAt: null,
        shopeeItemId: null,
      }
    : {
        title: '',
        description: '',
        category: [] as string[],
        attributes: { brand: 'NoBrand', origin: '中国大陆', material: '' },
        logistics: { leadTime: 5, minimumOrderQty: 5, jit: false },
        invitation: { code: '' },
        status: 'draft' as const,
        publishedAt: null,
        shopeeItemId: null,
      }

  return {
    productNo: productInfo.productNo || '',
    toolVersion: TOOL_VERSION,
    createdAt: createdAt || now,
    updatedAt: now,
    internal: {
      title: productInfo.title,
      description: productInfo.description || '',
      category: productInfo.category || '',
      localPath: localPackagePath || '',
    },
    platforms: { shopee },
    skus,
    images,
    pim: { syncedAt: null, status: 'ready', notes: '' },
    r2: { basePath: '', syncedAt: '' }, // 空字符串 = 未同步；uploadQueue 以 !!basePath && !!syncedAt 判断是否已上传
  }
}
