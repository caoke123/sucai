// ==================== 图片压缩 IPC Handler ====================

import { ipcMain } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdir, rm } from 'fs/promises'
import { compressForExport } from '../services/compress/compressForExport'
import sharp from 'sharp'
import { stat as fsStat } from 'fs/promises'
import type { CompressResult } from '@shared/types'

interface CompressInput {
  id: string
  srcPath: string
}

const TEMP_ROOT = join(tmpdir(), 'yutuzhupin-compress')

let cleanupDone = false

export async function cleanupCompressTemp(): Promise<void> {
  if (cleanupDone) return
  cleanupDone = true
  try {
    await rm(TEMP_ROOT, { recursive: true, force: true })
    console.log('[Compress] Temp dir cleaned:', TEMP_ROOT)
  } catch {
    // 忽略清理失败
  }
}

export function registerCompressImagesHandler(): void {
  ipcMain.handle(
    'compress-images',
    async (
      event,
      payload: { images: CompressInput[]; sessionId: string },
    ): Promise<CompressResult[]> => {
      const sessionDir = join(TEMP_ROOT, payload.sessionId)
      await mkdir(sessionDir, { recursive: true })

      const results: CompressResult[] = []

      for (const img of payload.images) {
        const ext = '.jpg'
        const destPath = join(sessionDir, `${img.id}${ext}`)
        try {
          const out = await compressForExport(img.srcPath, destPath)
          const result: CompressResult = {
            id: img.id,
            srcPath: img.srcPath,
            destPath: out.destPath,
            originalSize: out.originalSize,
            compressedSize: out.compressedSize,
            width: out.width,
            height: out.height,
            skipped: out.skipped,
          }
          results.push(result)
          event.sender.send('compress-progress', { id: img.id, result })
        } catch (err) {
          console.error(`[Compress] Failed: ${img.id}`, err)
          const result: CompressResult = {
            id: img.id,
            srcPath: img.srcPath,
            destPath: img.srcPath, // fallback
            originalSize: 0,
            compressedSize: 0,
            width: 0,
            height: 0,
            skipped: true,
          }
          results.push(result)
          event.sender.send('compress-progress', { id: img.id, result })
        }
      }

      return results
    },
  )

  // 预分析：返回每张图是否需要压缩
  ipcMain.handle(
    'compress-images-analyze',
    async (
      _event,
      payload: { images: CompressInput[] },
    ): Promise<Array<{ id: string; srcPath: string; originalSize: number; width: number; height: number; needCompress: boolean }>> => {
      const results: Array<{ id: string; srcPath: string; originalSize: number; width: number; height: number; needCompress: boolean }> = []
      for (const img of payload.images) {
        try {
          const fileStat = await fsStat(img.srcPath)
          const meta = await sharp(img.srcPath).metadata()
          const w = meta.width ?? 0
          const h = meta.height ?? 0
          const maxDim = Math.max(w, h)
          results.push({
            id: img.id,
            srcPath: img.srcPath,
            originalSize: fileStat.size,
            width: w,
            height: h,
            needCompress: fileStat.size > 2 * 1024 * 1024 || maxDim > 1000,
          })
        } catch {
          results.push({ id: img.id, srcPath: img.srcPath, originalSize: 0, width: 0, height: 0, needCompress: false })
        }
      }
      return results
    },
  )
}
