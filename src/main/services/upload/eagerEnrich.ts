// ==================== 逐文件即时回写 ====================

import type { UploadManifestEntry } from '@shared/types'
import { normalizeFilePath } from '@shared/utils/normalizePath'

export function eagerEnrichProductJson(
  productJson: Record<string, unknown>,
  entry: UploadManifestEntry,
): void {
  const images = productJson.images as Record<string, Array<Record<string, unknown>>> | undefined
  if (!images) return

  switch (entry.type) {
    case 'main':
    case 'detail': {
      const list = images[entry.type]
      if (!list) return
      const target = list.find(
        (img) => normalizeFilePath(img.localPath as string) === entry.localPath
      )
      if (target) target.r2Url = entry.r2Url
      break
    }
    case 'sku': {
      const skus = productJson.skus as Array<Record<string, unknown>> | undefined
      if (!skus || !entry.skuCode) return
      const target = skus.find((s) => s.skuCode === entry.skuCode)
      if (target) {
        const imgs = (target as Record<string, unknown>).images as Record<string, unknown> | undefined
        if (imgs?.primary) {
          ;(imgs.primary as Record<string, unknown>).r2Url = entry.r2Url
        }
      }
      break
    }
  }
}
