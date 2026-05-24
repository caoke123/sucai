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
    const validation = validateR2Config(config)
    if (!validation.valid) {
      throw new Error(validation.message)
    }

    const files = getAllFiles(task.localPackagePath, task.localPackagePath)
    const emptyDirs = getEmptyDirs(task.localPackagePath, task.localPackagePath)
    const totalFiles = files.length + emptyDirs.length
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
        } catch {
          // product.json 损坏时使用空对象
        }
      }

      const alreadyHasR2 = !!originalJson.r2

      task.totalFiles = otherFiles.length + emptyDirs.length + 1
      this.pushStateToRenderer()

      // ===== Step 2: 并发上传所有文件 =====
      const uploadedPaths: Array<{ relativePath: string; s3Key: string }> = []

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

      const uploadEmptyDir = async (relativePath: string): Promise<void> => {
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
            item.type === 'file' ? uploadFile(item.path) : uploadEmptyDir(item.path)
          )
        )
      }

      // 输出上传统计
      logUploadSummary(uploadedPaths, task.folderName)

      // ===== Step 3: 构建 r2 字段 =====
      if (!alreadyHasR2) {
        task.progress = Math.round(((task.totalFiles - 1) / task.totalFiles) * 100)
        this.pushStateToRenderer()

        const skus = (originalJson.skus as Array<Record<string, unknown>>) || []
        const { r2Field, updatedSkus } = buildR2Metadata({
          folderName: task.folderName,
          baseUrl,
          uploadedPaths,
          originalSkus: skus,
        })

        const finalJson = {
          ...originalJson,
          r2: r2Field,
          skus: updatedSkus,
        }

        // v4: 更新 assets 中的 r2Url + uploaded 标记
        const existingAssets = originalJson.assets as Record<string, Array<Record<string, unknown>>> | undefined
        if (existingAssets) {
          const enrichedAssets: Record<string, Array<Record<string, unknown>>> = {}
          for (const [cat, descriptors] of Object.entries(existingAssets)) {
            enrichedAssets[cat] = (descriptors as Array<Record<string, unknown>>).map((d) => {
              const fileName = d.fileName as string
              const catImages = (r2Field.images as Record<string, Array<{ fileName: string; url: string }>>)[cat] || []
              const matched = catImages.find((img) => img.fileName === fileName)
              return matched ? { ...d, r2Url: matched.url, uploaded: true } : d
            })
          }
          finalJson.assets = enrichedAssets as unknown as typeof originalJson.assets
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
