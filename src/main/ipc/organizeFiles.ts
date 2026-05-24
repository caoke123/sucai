import { ipcMain } from 'electron'
import type { OrganizeRequest, OrganizeResult } from '@shared/types'
import { generateFolderStructure } from '../services/export/generateFolderStructure'
import { renameAndCopyImages } from '../services/export/renameImages'
import { buildProductJsonData, writeProductJson } from '../services/export/buildProductJson'

export function registerOrganizeFilesHandler(): void {
  ipcMain.handle('organize-files', async (_event, payload: OrganizeRequest): Promise<OrganizeResult> => {
    try {
      const { outputFolderPath, images, productInfo, shortTitle, skuList, outerPackaging } = payload

      if (!outputFolderPath) {
        return { success: false, error: '输出目录路径不能为空' }
      }

      // 生成文件夹结构
      const { packagePath } = generateFolderStructure(
        outputFolderPath,
        productInfo.productNo,
        shortTitle || '',
        productInfo.title
      )

      // 复制并重命名图片
      renameAndCopyImages(packagePath, images)

      // 生成 product.json
      const productData = buildProductJsonData({
        productInfo,
        skuList: skuList || [],
        outerPackaging,
      })
      writeProductJson(packagePath, productData)

      return { success: true, outputPath: packagePath }
    } catch (error) {
      return {
        success: false,
        error: `生成素材包失败: ${(error as Error).message}`,
      }
    }
  })
}
