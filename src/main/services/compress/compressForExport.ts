// ==================== 图片压缩导出服务 (sharp) ====================

import sharp from 'sharp'
import { stat, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { CompressResult } from '@shared/types'

const MAX_SIDE = 1000
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const INITIAL_QUALITY = 85
const MIN_QUALITY = 60
const QUALITY_STEP = 10

export interface CompressForExportOutput {
  destPath: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
  skipped: boolean
}

export async function compressForExport(
  srcPath: string,
  destPath: string,
): Promise<CompressForExportOutput> {
  const fileStat = await stat(srcPath)
  const originalSize = fileStat.size

  const image = sharp(srcPath)
  const metadata = await image.metadata()

  const origWidth = metadata.width ?? 0
  const origHeight = metadata.height ?? 0

  // 计算缩放后的尺寸（最大边 ≤ 1000，不放大）
  let width = origWidth
  let height = origHeight
  const maxDim = Math.max(width, height)

  if (maxDim > MAX_SIDE) {
    if (width > height) {
      height = Math.round((height * MAX_SIDE) / width)
      width = MAX_SIDE
    } else {
      width = Math.round((width * MAX_SIDE) / height)
      height = MAX_SIDE
    }
  }

  // 尝试递减质量，直到体积 < 2MB 或降至最低质量
  let quality = INITIAL_QUALITY
  let compressedBuf: Buffer | null = null

  await mkdir(dirname(destPath), { recursive: true })

  while (quality >= MIN_QUALITY) {
    const buf = await image
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer()

    if (buf.length <= MAX_FILE_SIZE || quality <= MIN_QUALITY) {
      compressedBuf = buf
      break
    }
    quality -= QUALITY_STEP
  }

  if (!compressedBuf) {
    throw new Error(`图片压缩失败: ${srcPath}`)
  }

  // 写临时文件
  const { writeFile } = await import('fs/promises')
  await writeFile(destPath, compressedBuf)

  const skipped = width === origWidth && height === origHeight && compressedBuf.length >= originalSize

  return {
    destPath,
    originalSize,
    compressedSize: compressedBuf.length,
    width,
    height,
    skipped,
  }
}
