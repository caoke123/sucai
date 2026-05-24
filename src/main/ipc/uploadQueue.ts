import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Config, createS3Client } from './r2Config'
import type { UploadTask, UploadQueueState } from '../../shared/types'
import {
  MIME_TYPE_MAP,
  UPLOAD_CONCURRENCY,
  UPLOAD_MAX_RETRIES,
  UPLOAD_RETRY_DELAY_MS,
} from '../../shared/constants'
import { buildR2Metadata } from '../services/export/buildR2Metadata'

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPE_MAP[ext] || 'application/octet-stream'
}

// 递归获取目录下所有文件（返回相对路径）
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

// 递归获取目录下所有空文件夹（不含文件的目录）
function getEmptyDirs(dirPath: string, basePath: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  let hasFiles = false
  let hasSubDirs = false

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      hasSubDirs = true
      results.push(...getEmptyDirs(fullPath, basePath))
    } else {
      hasFiles = true
    }
  }

  // 当前目录没有文件时，自身即为"空目录"
  if (!hasFiles) {
    const relativePath = path.relative(basePath, dirPath)
    if (relativePath) {
      results.push(relativePath)
    }
  }

  // 即使有子目录，也要检查当前目录是否有文件
  // 如果没有文件但子目录不是空目录，仍需要占位
  // 但如果子目录也是空的，父目录需要同时保留
  // 这里简化：只要当前目录无文件就加占位
  return results
}

export class UploadQueueManager {
  private tasks: UploadTask[] = []
  private isProcessing = false
  private mainWindow: BrowserWindow | null = null

  // 设置主窗口引用
  setWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  // 推送当前状态到渲染进程
  private pushStateToRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('upload-queue-update', this.getQueueState())
    }
  }

  // 获取队列状态
  getQueueState(): UploadQueueState {
    return {
      tasks: [...this.tasks],
      isProcessing: this.isProcessing,
    }
  }

  // 加入任务
  addTask(task: Omit<UploadTask, 'status' | 'progress' | 'totalFiles' | 'uploadedFiles' | 'retryCount' | 'createdAt'>): void {
    const config = getR2Config()
    if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
      throw new Error('R2 配置不完整，请先在设置中完成 R2 云存储配置')
    }

    // 统计文件数 + 空目录数
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

  // 重试失败任务
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

  // 移除任务（仅 done 或 failed ）
  removeTask(taskId: string): void {
    this.tasks = this.tasks.filter((t) => t.taskId !== taskId || (t.status !== 'done' && t.status !== 'failed'))
    this.pushStateToRenderer()
  }

  // 清除已完成
  clearCompleted(): void {
    this.tasks = this.tasks.filter((t) => t.status !== 'done')
    this.pushStateToRenderer()
  }

  // 处理下一个 pending 任务
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

  // 上传单个产品素材包
  private async uploadProduct(task: UploadTask): Promise<void> {
    const config = getR2Config()
    const client = createS3Client(config)
    const basePath = task.localPackagePath

    // 构建 CDN 基础 URL
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

      // 读取本地 product.json 原始内容
      let originalJson: Record<string, unknown> = {}
      if (productJsonFile) {
        try {
          const raw = fs.readFileSync(path.join(basePath, productJsonFile), 'utf-8')
          originalJson = JSON.parse(raw)
        } catch {
          // product.json 损坏时使用空对象
        }
      }

      // 检查是否已存在 r2 字段（重试场景）
      const alreadyHasR2 = !!originalJson.r2

      // totalFiles = 图片文件 + 空目录 + product.json
      task.totalFiles = otherFiles.length + emptyDirs.length + 1
      this.pushStateToRenderer()

      // ===== Step 2: 并发上传图片和空目录 =====
      const uploadedPaths: Array<{ relativePath: string; s3Key: string }> = []

      // 上传单个文件的通用函数
      const uploadFile = async (relativePath: string): Promise<void> => {
        const fullPath = path.join(basePath, relativePath)
        const s3Key = `products/${task.folderName}/${relativePath.replace(/\\/g, '/')}`

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

      // 上传空目录占位
      const uploadEmptyDir = async (relativePath: string): Promise<void> => {
        const dirKey = `products/${task.folderName}/${relativePath.replace(/\\/g, '/')}/`
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

      // 合并上传列表
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
          console.error('写回本地 product.json 失败:', (writeErr as Error).message)
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
        await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS))
        task.status = 'pending'
        task.errorMessage = undefined
        this.tasks = this.tasks.filter((t) => t.taskId !== task.taskId)
        this.tasks.unshift(task)
      } else {
        task.status = 'failed'
        task.errorMessage = errMsg
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
