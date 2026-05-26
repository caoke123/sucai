import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Config, createS3Client } from './r2Config'
import type { UploadTask, UploadQueueState } from '@shared/types'
import {
  MIME_TYPE_MAP,
  UPLOAD_CONCURRENCY,
  UPLOAD_MAX_RETRIES,
  UPLOAD_RETRY_DELAY_MS,
  FOLDER_TO_R2_CATEGORY,
} from '@shared/constants'
import { buildR2Metadata } from '../services/export/buildR2Metadata'
import { validateR2Config } from '../services/config/validateConfig'

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPE_MAP[ext] || 'application/octet-stream'
}

function getAllFiles(dirPath: string, basePath: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    const relativePath = path.relative(basePath, fullPath)
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, basePath))
    } else {
      results.push(relativePath)
    }
  }
  return results
}

function getEmptyDirs(dirPath: string, basePath: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  let hasFiles = false

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...getEmptyDirs(fullPath, basePath))
    } else {
      hasFiles = true
    }
  }

  if (!hasFiles) {
    const relativePath = path.relative(basePath, dirPath)
    if (relativePath) {
      results.push(relativePath)
    }
  }

  return results
}

function logUploadSummary(
  uploadedPaths: Array<{ relativePath: string; s3Key: string }>,
  folderName: string,
): void {
  const counts: Record<string, number> = { main: 0, sku: 0, detail: 0, size: 0, certificate: 0, unknown: 0 }

  for (const p of uploadedPaths) {
    const parts = p.relativePath.replace(/\\/g, '/').split('/')
    if (parts.length < 2) continue
    const dir = parts[0]
    const cat = FOLDER_TO_R2_CATEGORY[dir] || 'unknown'
    counts[cat] = (counts[cat] || 0) + 1
  }

  console.log(`
[R2 Upload Summary] ${folderName}
  main:        ${counts.main} files
  sku:         ${counts.sku} files
  detail:      ${counts.detail} files
  size:        ${counts.size} files
  certificate: ${counts.certificate} files
  unknown:     ${counts.unknown} files
  total:       ${Object.values(counts).reduce((a, b) => a + b, 0)} files`)
}

export class UploadQueueManager {
  private tasks: UploadTask[] = []
  private isProcessing = false
  private mainWindow: BrowserWindow | null = null

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  private pushStateToRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('upload-queue-update', this.getQueueState())
    }
  }

  getQueueState(): UploadQueueState {
    return { tasks: [...this.tasks], isProcessing: this.isProcessing }
  }

  addTask(task: Omit<UploadTask, 'status' | 'progress' | 'totalFiles' | 'uploadedFiles' | 'retryCount' | 'createdAt'>): void {
    const config = getR2Config()
    console.log('[UploadQueue] addTask config:', { hasKey: !!config.accessKeyId, bucket: config.bucket, endpoint: config.endpoint })
    const validation = validateR2Config(config)
    if (!validation.valid) {
      console.error('[UploadQueue] config invalid:', validation.message)
      throw new Error(validation.message)
    }

    const files = getAllFiles(task.localPackagePath, task.localPackagePath)
    const emptyDirs = getEmptyDirs(task.localPackagePath, task.localPackagePath)
    const totalFiles = files.length + emptyDirs.length
    console.log('[UploadQueue] 扫描完成:', files.length, '文件 +', emptyDirs.length, '空目录 =', totalFiles)
    if (totalFiles === 0) {
      throw new Error('素材包目录为空，没有可上传的文件')
    }

    const newTask: UploadTask = {
      ...task,
      status: 'pending',
      progress: 0,
      totalFiles,
      uploadedFiles: 0,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    }

    this.tasks.push(newTask)
    this.pushStateToRenderer()
    this.processNext()
  }

  retryTask(taskId: string): void {
    const task = this.tasks.find((t) => t.taskId === taskId)
    if (task && task.status === 'failed') {
      task.status = 'pending'
      task.errorMessage = undefined
      task.retryCount = 0
      this.pushStateToRenderer()
      this.processNext()
    }
  }

  removeTask(taskId: string): void {
    this.tasks = this.tasks.filter((t) => t.taskId !== taskId || (t.status !== 'done' && t.status !== 'failed'))
    this.pushStateToRenderer()
  }

  clearCompleted(): void {
    this.tasks = this.tasks.filter((t) => t.status !== 'done')
    this.pushStateToRenderer()
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return
    const task = this.tasks.find((t) => t.status === 'pending')
    if (!task) return

    this.isProcessing = true
    task.status = 'uploading'
    this.pushStateToRenderer()

    try {
      await this.uploadProduct(task)
    } catch {
      // 错误在 uploadProduct 内部处理
    } finally {
      this.isProcessing = false
      this.processNext()
    }
  }

  private async uploadProduct(task: UploadTask): Promise<void> {
    const config = getR2Config()
    const client = createS3Client(config)
    const basePath = task.localPackagePath

    const accountId = config.endpoint.replace('https://', '').replace('.r2.cloudflarestorage.com', '')
    const baseUrl = config.customDomain || `https://${config.bucket}.${accountId}.r2.cloudflarestorage.com`
    const encodedFolder = encodeURIComponent(task.folderName)

    try {
      // ===== Step 1: 扫描文件 =====
      task.progress = 0
      this.pushStateToRenderer()

      const allFiles = getAllFiles(basePath, basePath)
      const emptyDirs = getEmptyDirs(basePath, basePath)
      const productJsonFile = allFiles.find((f) => f === 'product.json' || f.endsWith('/product.json'))
      const otherFiles = allFiles.filter((f) => f !== productJsonFile)

      console.log(`[R2 Upload] 扫描完成: ${allFiles.length} 个文件, ${emptyDirs.length} 个空目录, 文件夹: ${task.folderName}`)

      let originalJson: Record<string, unknown> = {}
      if (productJsonFile) {
        try {
          const raw = fs.readFileSync(path.join(basePath, productJsonFile), 'utf-8')
          originalJson = JSON.parse(raw)
          console.log('[R2 Enrich] originalJson keys:', Object.keys(originalJson))
        } catch {
          // product.json 损坏时使用空对象
        }
      }

      const alreadyHasR2 = !!originalJson.r2

      task.totalFiles = otherFiles.length + emptyDirs.length + 1
      this.pushStateToRenderer()

      // ===== Step 2: 并发上传所有文件 =====
      const uploadedPaths: Array<{ relativePath: string; s3Key: string }> = []
      const failedFiles: string[] = []

      const uploadFile = async (relativePath: string): Promise<void> => {
        const fullPath = path.join(basePath, relativePath)
        const normalizedPath = relativePath.replace(/\\/g, '/')
        const s3Key = `products/${task.folderName}/${normalizedPath}`

        console.log(`[R2 Upload] ${normalizedPath} -> ${s3Key}`)

        const fileBuffer = fs.readFileSync(fullPath)

        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: getContentType(fullPath),
          })
        )

        uploadedPaths.push({ relativePath, s3Key })
        task.uploadedFiles++
        task.progress = Math.round((task.uploadedFiles / task.totalFiles) * 100)
        this.pushStateToRenderer()
      }

      const safeUploadFile = async (relativePath: string): Promise<void> => {
        try {
          await uploadFile(relativePath)
        } catch (err) {
          failedFiles.push(relativePath)
          console.error(`[R2 Upload] 失败: ${relativePath} — ${(err as Error).message}`)
        }
      }

      const uploadEmptyDir = async (relativePath: string): Promise<void> => {
        try {
          const normalizedPath = relativePath.replace(/\\/g, '/')
          const dirKey = `products/${task.folderName}/${normalizedPath}/`
          await client.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: dirKey,
              Body: '',
              ContentType: 'application/x-directory',
            })
          )
        } catch (err) {
          console.warn(`[R2 Upload] 空目录上传失败: ${relativePath}`)
        }

        task.uploadedFiles++
        task.progress = Math.round((task.uploadedFiles / task.totalFiles) * 100)
        this.pushStateToRenderer()
      }

      // 所有文件 + 空目录合并上传
      const allUploadItems: Array<{ type: 'file' | 'dir'; path: string }> = [
        ...otherFiles.map((f) => ({ type: 'file' as const, path: f })),
        ...emptyDirs.map((d) => ({ type: 'dir' as const, path: d })),
      ]

      const concurrency = UPLOAD_CONCURRENCY
      for (let i = 0; i < allUploadItems.length; i += concurrency) {
        const batch = allUploadItems.slice(i, i + concurrency)
        await Promise.all(
          batch.map((item) =>
            item.type === 'file' ? safeUploadFile(item.path) : uploadEmptyDir(item.path)
          )
        )
      }

      if (failedFiles.length > 0) {
        console.error(`[R2 Upload] ${failedFiles.length} 个文件上传失败: ${failedFiles.join(', ')}`)
      }

      // 输出上传统计
      logUploadSummary(uploadedPaths, task.folderName)

      // ===== Step 3: 构建 r2 字段 + 回写图片 URL =====
      if (!alreadyHasR2) {
        task.progress = Math.round(((task.totalFiles - 1) / task.totalFiles) * 100)
        this.pushStateToRenderer()

        const skus = (originalJson.skus as Array<Record<string, unknown>>) || []
        const { r2Field } = buildR2Metadata({
          folderName: task.folderName,
          baseUrl,
          uploadedPaths,
          originalSkus: skus,
        })

        const finalJson = { ...originalJson }

        // 建立 localPath → url 快速索引 (normalize 路径确保跨平台匹配)
        const pathToUrl = new Map<string, string>()
        for (const catImages of Object.values(r2Field.images)) {
          for (const img of (catImages as Array<{ fileName: string; url: string }>)) {
            for (const up of uploadedPaths) {
              const upName = up.relativePath.replace(/\\/g, '/').split('/').pop() || ''
              if (upName === img.fileName) {
                const fullPath = path.normalize(path.join(basePath, up.relativePath))
                pathToUrl.set(fullPath, img.url)
                break
              }
            }
          }
        }

        console.log(`[R2 Enrich] pathToUrl map has ${pathToUrl.size} entries`)

        // v4.5: enrich images.main[]/detail[]
        const existingImages = originalJson.images as Record<string, Array<Record<string, unknown>>> | undefined
        if (existingImages) {
          console.log('[R2 Enrich] v4.5 images path detected')
          const enrichedImages: Record<string, Array<Record<string, unknown>>> = {}
          for (const cat of ['main', 'detail']) {
            let catMatch = 0; let catMiss = 0
            enrichedImages[cat] = (existingImages[cat] || []).map((img: Record<string, unknown>) => {
              const rawPath = (img.localPath as string) || ''
              const localPath = rawPath ? path.normalize(rawPath) : ''
              const url = localPath ? pathToUrl.get(localPath) : undefined
              if (url) { catMatch++ } else { catMiss++ }
              return url ? { ...img, r2Url: url } : img
            })
            console.log(`[R2 Enrich] ${cat}: ${catMatch} matched, ${catMiss} missed`)
          }
          finalJson.images = enrichedImages as unknown as typeof originalJson.images

          // v4.5: enrich skus[].images.primary
          let skuMatch = 0; let skuMiss = 0
          const enrichedSkus = ((finalJson.skus || originalJson.skus) as Array<Record<string, unknown>>).map((sku) => {
            const imagesField = (sku as Record<string, unknown>).images as Record<string, unknown> | undefined
            const primary = imagesField?.primary as Record<string, unknown> | undefined
            if (primary?.localPath) {
              const normalizedPath = path.normalize(primary.localPath as string)
              const url = pathToUrl.get(normalizedPath)
              if (url) { skuMatch++; return { ...sku, images: { primary: { ...primary, r2Url: url } } } }
              else { skuMiss++ }
            }
            return sku
          })
          finalJson.skus = enrichedSkus as typeof originalJson.skus
          console.log(`[R2 Enrich] skus: ${skuMatch} matched, ${skuMiss} missed`)
        } else {
          // 兼容旧 v4 格式 (assets)
          const existingAssets = originalJson.assets as Record<string, Array<Record<string, unknown>>> | undefined
          if (existingAssets) {
            const enrichedAssets: Record<string, Array<Record<string, unknown>>> = {}
            for (const [cat, descriptors] of Object.entries(existingAssets)) {
              enrichedAssets[cat] = (descriptors as Array<Record<string, unknown>>).map((d) => {
                const localPath = d.localPath as string
                const url = localPath ? pathToUrl.get(localPath) : undefined
                return url ? { ...d, r2Url: url, uploaded: true } : d
              })
            }
            finalJson.assets = enrichedAssets as unknown as typeof originalJson.assets
          }
          finalJson.skus = skus.map((sku) => {
            const url = (sku.imageUrl as string) || pathToUrl.get((sku.imagePath as string) || '')
            return url ? { ...sku, imageUrl: url } : sku
          })
        }

        // 精简 r2: 仅保留 basePath + syncedAt
        finalJson.r2 = {
          basePath: r2Field.basePath,
          syncedAt: r2Field.syncedAt,
        }

        // ===== Step 4: 上传最终 product.json =====
        const finalS3Key = `products/${task.folderName}/product.json`
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: finalS3Key,
            Body: JSON.stringify(finalJson, null, 2),
            ContentType: 'application/json',
          })
        )

        task.uploadedFiles++
        task.progress = Math.round((task.uploadedFiles / task.totalFiles) * 100)
        this.pushStateToRenderer()

        // ===== Step 5: 写回本地 product.json =====
        try {
          fs.writeFileSync(
            path.join(basePath, 'product.json'),
            JSON.stringify(finalJson, null, 2),
            'utf-8'
          )
          console.log('[R2 WriteBack] 本地 product.json 已更新 (含 r2Urls)')
        } catch (writeErr) {
          console.error('[R2 Upload] 写回本地 product.json 失败:', (writeErr as Error).message)
        }
      }

      // ===== Step 6: 完成 =====
      task.status = 'done'
      task.progress = 100
      task.completedAt = new Date().toISOString()
      task.publicBaseUrl = `${baseUrl}/products/${encodedFolder}/`
      this.pushStateToRenderer()
    } catch (error) {
      const step = task.uploadedFiles === 0 ? '扫描文件' : '上传过程'
      const errMsg = `${step}失败: ${(error as Error).message}`

      task.retryCount++
      if (task.retryCount < UPLOAD_MAX_RETRIES) {
        console.warn(`[R2 Upload] 重试 ${task.retryCount}/${UPLOAD_MAX_RETRIES}: ${errMsg}`)
        await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS))
        task.status = 'pending'
        task.errorMessage = undefined
        this.tasks = this.tasks.filter((t) => t.taskId !== task.taskId)
        this.tasks.unshift(task)
      } else {
        task.status = 'failed'
        task.errorMessage = errMsg
        console.error(`[R2 Upload] 上传失败 (已重试${UPLOAD_MAX_RETRIES}次): ${errMsg}`)
      }
      this.pushStateToRenderer()
    }
  }
}

export function registerUploadQueueHandlers(manager: UploadQueueManager): void {
  ipcMain.handle('upload-queue-add', async (_event, task) => {
    try {
      manager.addTask(task)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('upload-queue-retry', async (_event, taskId: string) => {
    manager.retryTask(taskId)
  })

  ipcMain.handle('upload-queue-remove', async (_event, taskId: string) => {
    manager.removeTask(taskId)
  })

  ipcMain.handle('upload-queue-get', async () => {
    return manager.getQueueState()
  })

  ipcMain.handle('upload-queue-clear-completed', async () => {
    manager.clearCompleted()
  })
}
