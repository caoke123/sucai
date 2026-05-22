import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import type { ScanFolderResult, ImageFile } from '../../shared/types'

// 支持的图片格式
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'])

export function registerScanFolderHandler(): void {
  ipcMain.handle('scan-folder', async (_event, folderPath: string): Promise<ScanFolderResult> => {
    try {
      // 读取文件夹内所有文件
      const allFiles = fs.readdirSync(folderPath)
      const imageFiles = allFiles.filter((fileName) => {
        const ext = path.extname(fileName).toLowerCase()
        return IMAGE_EXTENSIONS.has(ext)
      })

      if (imageFiles.length === 0) {
        return { success: true, images: [] }
      }

      // 并发生成所有图片的缩略图（每次最多并发 5 张，避免内存溢出）
      const results: ImageFile[] = []
      const chunkSize = 5

      for (let i = 0; i < imageFiles.length; i += chunkSize) {
        const chunk = imageFiles.slice(i, i + chunkSize)
        const chunkResults = await Promise.all(
          chunk.map(async (fileName, chunkIndex): Promise<ImageFile | null> => {
            const filePath = path.join(folderPath, fileName)
            const ext = path.extname(fileName).toLowerCase()
            const globalIndex = i + chunkIndex

            try {
              // 生成 200x200 缩略图，JPEG 格式，质量 75
              const thumbBuffer = await sharp(filePath)
                .resize(200, 200, { fit: 'cover', position: 'centre' })
                .jpeg({ quality: 75 })
                .toBuffer()

              const imageFile: ImageFile = {
                id: `img_${globalIndex}`,
                originalPath: filePath,
                thumbnailDataUrl: `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`,
                fileName,
                fileExt: ext,
                labels: ['未分类'],
              }
              return imageFile
            } catch {
              // 单张图片处理失败时跳过，不中断整体流程
              console.warn(`跳过无法处理的文件: ${fileName}`)
              return null
            }
          })
        )
        results.push(...chunkResults.filter((r): r is ImageFile => r !== null))
      }

      return { success: true, images: results }
    } catch (error) {
      return {
        success: false,
        error: `扫描文件夹失败: ${(error as Error).message}`,
      }
    }
  })
}
