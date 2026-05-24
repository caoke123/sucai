import fs from 'fs'
import path from 'path'
import type { ImageFile } from '../../../shared/types'
import { LABEL_TO_FOLDER } from '../../../shared/constants'

export interface RenamedFile {
  sourcePath: string
  destPath: string
  label: string
  newFileName: string
}

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

export function renameAndCopyImages(packagePath: string, images: ImageFile[]): RenamedFile[] {
  const results: RenamedFile[] = []

  // 按标签分组（支持多标签：同一图片可出现在多个分组）
  const groupedImages: Record<string, ImageFile[]> = {}
  for (const image of images) {
    for (const label of image.labels) {
      if (label === '未分类') continue
      if (!groupedImages[label]) groupedImages[label] = []
      groupedImages[label].push(image)
    }
  }

  // 复制并重命名
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

      const destPath = path.join(destDir, newFileName)
      fs.copyFileSync(image.originalPath, destPath)

      results.push({
        sourcePath: image.originalPath,
        destPath,
        label,
        newFileName,
      })
    })
  }

  return results
}
