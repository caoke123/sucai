import { ipcMain } from 'electron'
import type { OrganizeRequest, OrganizeResult } from '@shared/types'
import { generateFolderStructure } from '../services/export/generateFolderStructure'
import { renameAndCopyImages } from '../services/export/renameImages'
import { buildProductJsonData, writeProductJson } from '../services/export/buildProductJson'

export function registerOrganizeFilesHandler(): void {
  ipcMain.handle('organize-files', async (_event, payload: OrganizeRequest): Promise<OrganizeResult> => {
    try {
      const { outputFolderPath, images, productInfo, shortTitle, skuList, outerPackaging, shopeeInfo, compressResults } = payload

      if (!outputFolderPath) {
        return { success: false, error: '输出目录路径不能为空' }
      }

      const { packagePath } = generateFolderStructure(
        outputFolderPath,
        productInfo.productNo,
        shortTitle || '',
        productInfo.title
      )

      const renamedFiles = renameAndCopyImages(packagePath, images, compressResults)

      const productData = buildProductJsonData({
        productInfo,
        skuList: skuList || [],
        outerPackaging,
        shopeeInfo,
        localPackagePath: packagePath,
        renamedFiles,
      })
      writeProductJson(packagePath, productData)

      return { success: true, outputPath: packagePath, productData }
    } catch (error) {
      return {
        success: false,
        error: `生成素材包失败: ${(error as Error).message}`,
      }
    }
  })
}
