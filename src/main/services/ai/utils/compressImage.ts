// ==================== 图片压缩 (Sharp, 主进程专用) ====================

import sharp from 'sharp'
import { readFile, stat } from 'fs/promises'

const MAX_WIDTH = 480
const MAX_HEIGHT = 480
const JPEG_QUALITY = 60
const MAX_CACHE_SIZE = 100

// ==================== 缓存条目类型 ====================

interface CacheEntry {
  base64: string
  fileSize: number
}

// ==================== 内存缓存管理器 ====================

class ImageCompressionCache {
  private static cache = new Map<string, CacheEntry>()

  static get(key: string): CacheEntry | null {
    const hit = this.cache.get(key)
    if (hit) {
      console.log(`[Sharp Cache] 命中缓存，0ms 返回: ${key}`)
      return hit
    }
    return null
  }

  static set(key: string, entry: CacheEntry): void {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
    this.cache.set(key, entry)
    console.log(`[Sharp Cache] 已缓存: ${key} (总数: ${this.cache.size}, ${(entry.fileSize / 1024).toFixed(1)}KB)`)
  }

  static clear(): void {
    const size = this.cache.size
    this.cache.clear()
    console.log(`[Sharp Cache] 已清空，释放 ${size} 个缓存项`)
  }

  static get size(): number {
    return this.cache.size
  }
}

export const clearImageCompressionCache = (): void => ImageCompressionCache.clear()

// ==================== 图片准备（读取+压缩+缓存） ====================

interface PrepareStats {
  hitCount: number
  missCount: number
}

export async function prepareImageBase64(
  imagePath: string,
  stats?: PrepareStats,
): Promise<string> {
  try {
    const normalized = imagePath.replace(/\\/g, '/')
    const fileStat = await stat(imagePath)
    const cacheKey = `${normalized}::${fileStat.mtimeMs}`

    const cached = ImageCompressionCache.get(cacheKey)
    if (cached) {
      if (stats) stats.hitCount++
      return cached.base64
    }
    if (stats) stats.missCount++

    const buffer = await readFile(imagePath)

    const metadata = await sharp(buffer).metadata()
    if (!metadata.width || !metadata.height) {
      throw new Error(`无法读取图片尺寸: ${imagePath}`)
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
    ImageCompressionCache.set(cacheKey, { base64, fileSize: fileStat.size })
    return base64
  } catch (error) {
    console.error(`[Sharp Cache] 图片处理失败: ${imagePath}`, error)
    return ''
  }
}

// ==================== 原有接口兼容层 ====================

export async function compressImageToBase64(filePath: string): Promise<string> {
  return prepareImageBase64(filePath)
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
