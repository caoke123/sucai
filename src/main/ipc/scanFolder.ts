import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import type { ScanFolderResult, ImageFile } from '@shared/types'
import { IMAGE_EXTENSIONS, THUMBNAIL_SIZE } from '@shared/constants'

const IMAGE_EXT_SET = new Set(IMAGE_EXTENSIONS)

export function registerScanFolderHandler(): void {
  ipcMain.handle('scan-folder', async (_event, folderPath: string): Promise<ScanFolderResult> => {
    try {
      const allFiles = fs.readdirSync(folderPath)
      const imageFiles = allFiles.filter((fileName) => {
        const ext = path.extname(fileName).toLowerCase()
        return IMAGE_EXT_SET.has(ext)
      })

      if (imageFiles.length === 0) {
        return { success: true, images: [] }
      }

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
              const thumbBuffer = await sharp(filePath)
                .resize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, { fit: 'cover', position: 'centre' })
                .jpeg({ quality: THUMBNAIL_SIZE.quality })
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
