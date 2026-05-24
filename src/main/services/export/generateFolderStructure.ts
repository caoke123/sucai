import fs from 'fs'
import path from 'path'
import { PACKAGE_SUB_FOLDERS, PACKAGE_SUFFIX } from '@shared/constants'

export function safeFolderName(rawName: string): string {
  return rawName
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
}

export function buildPackageName(productNo: string, shortTitle: string, fallbackTitle: string): string {
  let folderBaseName: string
  if (shortTitle && shortTitle.trim()) {
    folderBaseName = shortTitle.trim()
  } else {
    folderBaseName = fallbackTitle.replace(/\s/g, '').substring(0, 10)
  }
  const safeName = safeFolderName(folderBaseName).substring(0, 30)
  const codePrefix = productNo ? `[${productNo}] ` : ''
  return `${codePrefix}${safeName}${PACKAGE_SUFFIX}`
}

export interface PackageStructure {
  packagePath: string
  packageName: string
}

export function generateFolderStructure(
  outputFolderPath: string,
  productNo: string,
  shortTitle: string,
  fallbackTitle: string
): PackageStructure {
  const packageName = buildPackageName(productNo, shortTitle, fallbackTitle)
  const packagePath = path.join(outputFolderPath, packageName)

  // 覆盖已存在的旧素材包
  if (fs.existsSync(packagePath)) {
    fs.rmSync(packagePath, { recursive: true, force: true })
  }

  // 创建子文件夹
  for (const folder of PACKAGE_SUB_FOLDERS) {
    fs.mkdirSync(path.join(packagePath, folder), { recursive: true })
  }

  return { packagePath, packageName }
}
