import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import type { OrganizeRequest, OrganizeResult, ProductOutput, ImageFile } from '../../shared/types'
import { LABEL_TO_FOLDER, PACKAGE_SUB_FOLDERS, PACKAGE_SUFFIX, TOOL_VERSION } from '../../shared/constants'

// 生成安全的文件夹名
function safeFolderName(rawName: string): string {
  return rawName
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
}

// 生成无冲突的文件名（若目标已存在则追加序号 _1, _2 ...）
function getUniqueFileName(destDir: string, baseName: string, ext: string): string {
  let candidate = `${baseName}${ext}`
  if (!fs.existsSync(path.join(destDir, candidate))) {
    return candidate
  }
  let counter = 1
  while (fs.existsSync(path.join(destDir, `${baseName}_${counter}${ext}`))) {
    counter++
  }
  return `${baseName}_${counter}${ext}`
}

export function registerOrganizeFilesHandler(): void {
  ipcMain.handle('organize-files', async (_event, payload: OrganizeRequest): Promise<OrganizeResult> => {
    try {
      const { outputFolderPath, images, productInfo, shortTitle, skuList, outerPackaging } = payload

      // 文件夹命名：[产品编号] 短标题_素材包
      let folderBaseName: string
      if (shortTitle && shortTitle.trim()) {
        folderBaseName = shortTitle.trim()
      } else {
        folderBaseName = productInfo.title.replace(/\s/g, '').substring(0, 10)
      }
      const safeName = safeFolderName(folderBaseName).substring(0, 30)
      const codePrefix = productInfo.productNo ? `[${productInfo.productNo}] ` : ''
      const packageName = `${codePrefix}${safeName}${PACKAGE_SUFFIX}`
      const packagePath = path.join(outputFolderPath, packageName)

      // 如果目标文件夹已存在，先删除（覆盖重新生成）
      if (fs.existsSync(packagePath)) {
        fs.rmSync(packagePath, { recursive: true, force: true })
      }

      // 创建所有子文件夹（包括空的产品视频文件夹）
      for (const folder of PACKAGE_SUB_FOLDERS) {
        fs.mkdirSync(path.join(packagePath, folder), { recursive: true })
      }

      // 按标签分组图片（支持多标签：同一图片可出现在多个分组）
      const groupedImages: Record<string, ImageFile[]> = {}
      for (const image of images) {
        for (const label of image.labels) {
          if (label === '未分类') continue
          if (!groupedImages[label]) groupedImages[label] = []
          groupedImages[label].push(image)
        }
      }

      // 复制并重命名文件
      for (const [label, labelImages] of Object.entries(groupedImages)) {
        const folderName = LABEL_TO_FOLDER[label]
        if (!folderName) continue

        const destDir = path.join(packagePath, folderName)

        labelImages.forEach((image, index) => {
          const count = index + 1
          let newFileName: string

          if (label === 'SKU图' && image.skuSpec) {
            newFileName = getUniqueFileName(destDir, `${image.skuSpec}`, image.fileExt)
          } else {
            const labelName = label.replace('图', '')
            newFileName = `${labelName}_${count}${image.fileExt}`
          }

          fs.copyFileSync(image.originalPath, path.join(destDir, newFileName))
        })
      }

      // 生成 product.json
      const productOutput: ProductOutput = {
        title: productInfo.title,
        productNo: productInfo.productNo || '',
        category: productInfo.category || '',
        description: productInfo.description || '',
        outerPackaging: {
          length: outerPackaging?.length ?? null,
          width: outerPackaging?.width ?? null,
          height: outerPackaging?.height ?? null,
          weight: outerPackaging?.weight ?? null,
          presetName: outerPackaging?.presetName || '',
        },
        skus: (skuList || []).map((sku) => ({
          skuCode: sku.skuCode,
          skuName: sku.colorName,
          size: sku.dimensions || '',
          weight: sku.weight ?? 0,
          costPrice: sku.costPrice ?? 0,
          sellingPrice: sku.sellingPrice ?? 0,
          image: path.basename(sku.imagePath || ''),
        })),
        createdAt: new Date().toISOString(),
        toolVersion: TOOL_VERSION,
      }

      const jsonPath = path.join(packagePath, 'product.json')
      fs.writeFileSync(jsonPath, JSON.stringify(productOutput, null, 2), 'utf-8')

      return { success: true, outputPath: packagePath }
    } catch (error) {
      return {
        success: false,
        error: `生成素材包失败: ${(error as Error).message}`,
      }
    }
  })
}
