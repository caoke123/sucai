// ==================== PIM 嵌入模式本地 Agent ====================
// Express 服务，为 PIM 中台的 Web 前端提供文件系统操作能力
// 端口 18899，由 PIM 前端的 useFileSystem Hook 通过 HTTP 调用

import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import sharp from 'sharp'
import type { ScanFolderResult, ImageFile, OrganizeRequest, OrganizeResult } from '../src/shared/types'
import { IMAGE_EXTENSIONS, THUMBNAIL_SIZE } from '../src/shared/constants'
import { generateFolderStructure } from '../src/main/services/export/generateFolderStructure'
import { renameAndCopyImages } from '../src/main/services/export/renameImages'
import { buildProductJsonData, writeProductJson } from '../src/main/services/export/buildProductJson'

const IMAGE_EXT_SET = new Set(IMAGE_EXTENSIONS)
const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// POST /scan-folder — 扫描文件夹中的图片，返回缩略图 Base64
app.post('/scan-folder', async (req, res): Promise<void> => {
  try {
    const { folderPath } = req.body as { folderPath: string }
    if (!folderPath || !fs.existsSync(folderPath)) {
      res.status(400).json({ success: false, error: '文件夹路径不存在' })
      return
    }

    const allFiles = fs.readdirSync(folderPath)
    const imageFiles = allFiles.filter((fileName) => {
      const ext = path.extname(fileName).toLowerCase()
      return IMAGE_EXT_SET.has(ext)
    })

    if (imageFiles.length === 0) {
      res.json({ success: true, images: [] } satisfies ScanFolderResult)
      return
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
            console.warn(`[Agent] 跳过无法处理的文件: ${fileName}`)
            return null
          }
        })
      )
      results.push(...chunkResults.filter((r): r is ImageFile => r !== null))
    }

    res.json({ success: true, images: results } satisfies ScanFolderResult)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `扫描文件夹失败: ${(error as Error).message}`,
    } satisfies ScanFolderResult)
  }
})

// POST /organize-files — 整理文件，生成素材包，写入 product.json
app.post('/organize-files', async (req, res): Promise<void> => {
  try {
    const payload = req.body as OrganizeRequest
    const { outputFolderPath, images, productInfo, shortTitle, skuList, outerPackaging, shopeeInfo } = payload

    if (!outputFolderPath) {
      res.status(400).json({ success: false, error: '输出目录路径不能为空' })
      return
    }

    const { packagePath } = generateFolderStructure(
      outputFolderPath,
      productInfo.productNo,
      shortTitle || '',
      productInfo.title
    )

    const renamedFiles = renameAndCopyImages(packagePath, images)

    const productData = buildProductJsonData({
      productInfo,
      skuList: skuList || [],
      outerPackaging,
      shopeeInfo,
      localPackagePath: packagePath,
      renamedFiles,
    })
    writeProductJson(packagePath, productData)

    res.json({ success: true, outputPath: packagePath } satisfies OrganizeResult)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `生成素材包失败: ${(error as Error).message}`,
    } satisfies OrganizeResult)
  }
})

// POST /open-path — 在系统文件管理器中打开文件夹
app.post('/open-path', async (req, res): Promise<void> => {
  try {
    const { dirPath } = req.body as { dirPath: string }
    if (!dirPath || !fs.existsSync(dirPath)) {
      res.status(400).json('文件夹路径不存在')
      return
    }

    const platform = process.platform
    let command: string
    if (platform === 'win32') {
      command = `explorer.exe "${dirPath}"`
    } else if (platform === 'darwin') {
      command = `open "${dirPath}"`
    } else {
      command = `xdg-open "${dirPath}"`
    }

    exec(command, (err) => {
      if (err) {
        res.status(500).json(err.message)
      } else {
        res.json(dirPath)
      }
    })
  } catch (error) {
    res.status(500).json((error as Error).message)
  }
})

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '4.5.0' })
})

const PORT = 18899
app.listen(PORT, () => {
  console.log(`[Agent] 素材分拣 PIM-Agent 已启动 → http://localhost:${PORT}`)
})
