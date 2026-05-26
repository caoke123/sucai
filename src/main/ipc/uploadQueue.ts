import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Config, createS3Client } from './r2Config'
import type { UploadTask, UploadQueueState, UploadManifestEntry } from '@shared/types'
import type { UploadManifest } from '@shared/types'
import {
  MIME_TYPE_MAP,
  UPLOAD_CONCURRENCY,
  UPLOAD_MAX_RETRIES,
  UPLOAD_RETRY_DELAY_MS,
  FOLDER_TO_R2_CATEGORY,
} from '@shared/constants'
import { buildR2Metadata } from '../services/export/buildR2Metadata'
import { validateR2Config } from '../services/config/validateConfig'
import { normalizeFilePath } from '@shared/utils/normalizePath'
import {
  buildManifest,
  saveManifest,
  deleteManifest,
  updateManifestEntry,
} from '../services/upload/manifest'
import { eagerEnrichProductJson } from '../services/upload/eagerEnrich'
import { atomicWriteJson } from '../services/upload/atomicWrite'
import { uploadLog } from '../services/upload/logger'

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

function logUploadSummary(
  uploadedCounts: Record<string, number>,
  failedCount: number,
  folderName: string,
): void {
  console.log(`
[R2 Upload Summary] ${folderName}
  main:        ${uploadedCounts.main || 0} files
  sku:         ${uploadedCounts.sku || 0} files
  detail:      ${uploadedCounts.detail || 0} files
  size:        ${uploadedCounts.size || 0} files
  certificate: ${uploadedCounts.certificate || 0} files
  failed:      ${failedCount} files
  total:       ${Object.values(uploadedCounts).reduce((a, b) => a + b, 0)} files`)
}

function detectFileType(relativePath: string): 'main' | 'detail' | 'sku' | 'unknown' {
  const parts = relativePath.replace(/\\/g, '/').split('/')
  if (parts.length < 2) return 'unknown'
  const dir = parts[0]
  const cat = FOLDER_TO_R2_CATEGORY[dir]
  if (cat === 'main') return 'main'
  if (cat === 'detail') return 'detail'
  if (cat === 'sku') return 'sku'
  return 'unknown'
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
    const totalFiles = files.length
    if (totalFiles === 0) {
      throw new Error('素材包目录为空，没有可上传的文件')
    }

    uploadLog(task.taskId, `addTask: ${totalFiles} files, bucket: ${config.bucket}`)

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
      // errors handled inside uploadProduct
    } finally {
      this.isProcessing = false
      this.processNext()
    }
  }

  private async uploadProduct(task: UploadTask): Promise<void> {
    const taskId = task.taskId
    const config = getR2Config()
    const client = createS3Client(config)
    const basePath = task.localPackagePath

    const baseUrl = config.customDomain || ''
    const encodedFolder = encodeURIComponent(task.folderName)

    try {
      // ===== Step 1: 扫描 + 构建 Manifest =====
      task.progress = 0
      this.pushStateToRenderer()

      const allFiles = getAllFiles(basePath, basePath)
      const productJsonFile = allFiles.find((f) => f === 'product.json' || f.endsWith('/product.json'))
      const otherFiles = allFiles.filter((f) => f !== productJsonFile)

      uploadLog(taskId, `scan: ${allFiles.length} files`)

      // 读取 product.json
      let productJson: Record<string, unknown> = {}
      if (productJsonFile) {
        try {
          const raw = fs.readFileSync(path.join(basePath, productJsonFile), 'utf-8')
          productJson = JSON.parse(raw)
        } catch { /* ignore */ }
      }

      // 构建 Manifest
      const manifest = buildManifest(
        taskId, task.productNo, basePath, task.folderName,
        otherFiles.map((relPath) => {
          const fullPath = path.join(basePath, relPath)
          const normRel = relPath.replace(/\\/g, '/')
          const type = detectFileType(relPath)
          return {
            type: type === 'unknown' ? 'detail' : type,
            localPath: fullPath,
            relativePath: normRel,
            r2Key: `products/${task.folderName}/${normRel}`,
          }
        })
      )
      saveManifest(manifest)
      uploadLog(taskId, `manifest: ${manifest.entries.length} entries`)

      task.totalFiles = otherFiles.length
      this.pushStateToRenderer()

      // ===== Step 2: 逐文件上传 + 即时回写 =====
      const uploadedCounts: Record<string, number> = {}
      let failedCount = 0

      const uploadFile = async (entry: UploadManifestEntry): Promise<void> => {
        const fileBuffer = fs.readFileSync(entry.localPath)
        const s3Key = entry.r2Key

        uploadLog(taskId, `upload: ${entry.relativePath}`)

        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: getContentType(entry.localPath),
          })
        )

        // 构建 CDN URL
        const urlParts = s3Key.split('/')
        const cdnUrl = baseUrl + '/' + urlParts.map((seg) => encodeURIComponent(seg)).join('/')

        // 更新 manifest entry
        updateManifestEntry(manifest, entry.id, {
          status: 'success',
          r2Url: cdnUrl,
        })

        // 即时回写 product.json
        entry.r2Url = cdnUrl
        eagerEnrichProductJson(productJson, entry)

        // 原子写入 product.json
        atomicWriteJson(path.join(basePath, 'product.json'), productJson)

        // 持久化 manifest
        saveManifest(manifest)

        const cat = entry.type
        uploadedCounts[cat] = (uploadedCounts[cat] || 0) + 1
        task.uploadedFiles++
        task.progress = Math.round((task.uploadedFiles / task.totalFiles) * 100)
        this.pushStateToRenderer()

        uploadLog(taskId, `enrich: ${entry.type} r2Url written`)
      }

      const safeUpload = async (entry: UploadManifestEntry): Promise<void> => {
        try {
          await uploadFile(entry)
        } catch (err) {
          failedCount++
          updateManifestEntry(manifest, entry.id, {
            status: 'failed',
            errorMessage: (err as Error).message,
          })
          saveManifest(manifest)
          uploadLog(taskId, `FAIL: ${entry.relativePath} — ${(err as Error).message}`, 'error')
          task.uploadedFiles++
          task.progress = Math.round((task.uploadedFiles / task.totalFiles) * 100)
          this.pushStateToRenderer()
        }
      }

      // 并发上传 (不包含 product.json)
      const concurrency = UPLOAD_CONCURRENCY
      for (let i = 0; i < manifest.entries.length; i += concurrency) {
        const batch = manifest.entries.slice(i, i + concurrency)
        await Promise.all(batch.map(safeUpload))
      }

      logUploadSummary(uploadedCounts, failedCount, task.folderName)

      // ===== Step 3: 构建简化 r2 字段 + 上传最终 product.json =====
      productJson.r2 = {
        basePath: `products/${task.folderName}/`,
        syncedAt: new Date().toISOString(),
      }

      const finalS3Key = `products/${task.folderName}/product.json`
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: finalS3Key,
          Body: JSON.stringify(productJson, null, 2),
          ContentType: 'application/json',
        })
      )
      uploadLog(taskId, 'final product.json uploaded')

      // 最终原子写回
      atomicWriteJson(path.join(basePath, 'product.json'), productJson)
      uploadLog(taskId, 'writeBack: done')

      // 清理 manifest
      deleteManifest(basePath)
      uploadLog(taskId, 'manifest cleaned')

      // ===== Step 4: 完成 =====
      task.status = 'done'
      task.progress = 100
      task.completedAt = new Date().toISOString()
      task.publicBaseUrl = `${baseUrl}/products/${encodedFolder}/`
      this.pushStateToRenderer()
      uploadLog(taskId, 'DONE')
    } catch (error) {
      const msg = (error as Error).message
      uploadLog(taskId, `ERROR: ${msg}`, 'error')

      task.retryCount++
      if (task.retryCount < UPLOAD_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS))
        task.status = 'pending'
        task.errorMessage = undefined
        this.tasks = this.tasks.filter((t) => t.taskId !== task.taskId)
        this.tasks.unshift(task)
      } else {
        task.status = 'failed'
        task.errorMessage = msg
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
