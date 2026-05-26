// ==================== 图片压缩 (Sharp, 主进程专用) ====================

import sharp from 'sharp'
import { readFile, stat } from 'fs/promises'

const MAX_WIDTH = 512
const MAX_HEIGHT = 512
const JPEG_QUALITY = 65

// 基于 (文件路径 + mtime) 的内存缓存
const imageCache = new Map<string, { base64: string; mtime: number }>()

export function clearImageCache(): void {
  imageCache.clear()
}

export async function compressImageToBase64(filePath: string): Promise<string> {
  try {
    const fileStat = await stat(filePath)
    const mtime = fileStat.mtimeMs
    const cached = imageCache.get(filePath)
    if (cached && cached.mtime === mtime) {
      return cached.base64
    }

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
      .resize(width, height)
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()

    const base64 = `data:image/jpeg;base64,${compressed.toString('base64')}`
    imageCache.set(filePath, { base64, mtime })
    return base64
  } catch {
    // 缓存失败时降级为无缓存逻辑
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
      .resize(width, height)
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
    return `data:image/jpeg;base64,${compressed.toString('base64')}`
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
    .resize(width, height)
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()

  return `data:image/jpeg;base64,${compressed.toString('base64')}`
}
