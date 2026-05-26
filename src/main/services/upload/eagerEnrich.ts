// ==================== 逐文件即时回写 ====================

import type { UploadManifestEntry } from '@shared/types'
import { normalizeFilePath } from '@shared/utils/normalizePath'

function normKey(p: string): string {
  return normalizeFilePath(p).toLowerCase()
}

export function eagerEnrichProductJson(
  productJson: Record<string, unknown>,
  entry: UploadManifestEntry,
): boolean {
  const images = productJson.images as Record<string, Array<Record<string, unknown>>> | undefined
  if (!images) {
    console.log('[EAGER] no images field in productJson')
    return false
  }

  switch (entry.type) {
    case 'main':
    case 'detail': {
      const list = images[entry.type]
      if (!list) {
        console.log(`[EAGER] no ${entry.type} list in images`)
        return false
      }
      const target = list.find(
        (img) => normKey(img.localPath as string) === normKey(entry.localPath)
      )
      if (target) {
        target.r2Url = entry.r2Url
        console.log(`[EAGER] MATCH: ${entry.type} ${(target.fileName)} ← ${entry.r2Url.slice(0, 60)}...`)
        return true
      }
      console.log(`[EAGER] MISS: ${entry.type} — entry.localPath=${normKey(entry.localPath)}`)
      console.log(`[EAGER] avail: ${list.map((i) => normKey(i.localPath as string)).join(' | ')}`)
      return false
    }
    case 'sku': {
      const skus = productJson.skus as Array<Record<string, unknown>> | undefined
      if (!skus || !entry.skuCode) {
        console.log('[EAGER] no skus or no skuCode')
        return false
      }
      const target = skus.find((s) => s.skuCode === entry.skuCode)
      if (target) {
        const imgs = (target as Record<string, unknown>).images as Record<string, unknown> | undefined
        if (imgs?.primary) {
          ;(imgs.primary as Record<string, unknown>).r2Url = entry.r2Url
          console.log(`[EAGER] MATCH: sku ${entry.skuCode} primary.r2Url ← ${entry.r2Url.slice(0, 60)}...`)
          return true
        }
        console.log(`[EAGER] sku ${entry.skuCode} has no primary image`)
        return false
      }
      console.log(`[EAGER] MISS: skuCode=${entry.skuCode} not found in skus list`)
      return false
    }
  }
  return false
}
