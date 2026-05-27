// ==================== 图片压缩 (Sharp, 主进程专用) ====================

import sharp from 'sharp'
import { readFile, stat } from 'fs/promises'

const MAX_WIDTH = 512
const MAX_HEIGHT = 512
const JPEG_QUALITY = 65
const MAX_CACHE_SIZE = 100

// ==================== 内存缓存管理器 ====================

class ImageCompressionCache {
  private static cache = new Map<string, string>()

  static get(filePath: string): string | null {
    const normalizedPath = filePath.replace(/\\/g, '/')
    const hit = this.cache.get(normalizedPath)
    if (hit) {
      console.log(`[Sharp Cache] 命中缓存，0ms 返回: ${normalizedPath}`)
      return hit
    }
    return null
  }

  static set(filePath: string, base64: string): void {
    const normalizedPath = filePath.replace(/\\/g, '/')
    // FIFO 淘汰: 超过上限时删除最早插入的条目
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
    this.cache.set(normalizedPath, base64)
    console.log(`[Sharp Cache] 已缓存: ${normalizedPath} (总数: ${this.cache.size})`)
  }

  static clear(): void {
    const size = this.cache.size
    this.cache.clear()
    console.log(`[Sharp Cache] 已清空，释放 ${size} 个缓存项`)
  }
}

// 导出清空方法供外部调用
export const clearImageCompressionCache = (): void => ImageCompressionCache.clear()

// ==================== 图片压缩 ====================

export async function compressImageToBase64(filePath: string): Promise<string> {
  // 先查缓存
  const cached = ImageCompressionCache.get(filePath)
  if (cached) return cached

  try {
    const fileStat = await stat(filePath)
    const buffer = await readFile(filePath)

    const metadata = await sharp(buffer).metadata()
    if (!metadata.width || !metadata.height) {
      throw new Error(`无法读取图片尺寸: ${filePath}`)
    }

    let width = metadata.width
    let height = metadata.height

    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
      if (width > height) {
        height = Math.round((height * MAX_WIDTH) / width)
        width = MAX_WIDTH
      } else {
        width = Math.round((width * MAX_HEIGHT) / height)
        height = MAX_HEIGHT
      }
    }

    const compressed = await sharp(buffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()

    const base64 = `data:image/jpeg;base64,${compressed.toString('base64')}`
    ImageCompressionCache.set(filePath, base64)
    return base64
  } catch (error) {
    console.error(`[Sharp Cache] 图片压缩失败: ${filePath}`, error)
    throw error
  }
}

export async function compressBufferToBase64(buf: Buffer): Promise<string> {
  const metadata = await sharp(buf).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('无法读取图片缓冲区尺寸')
  }

  let width = metadata.width
  let height = metadata.height

  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    if (width > height) {
      height = Math.round((height * MAX_WIDTH) / width)
      width = MAX_WIDTH
    } else {
      width = Math.round((width * MAX_HEIGHT) / height)
      height = MAX_HEIGHT
    }
  }

  const compressed = await sharp(buf)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()

  return `data:image/jpeg;base64,${compressed.toString('base64')}`
}
