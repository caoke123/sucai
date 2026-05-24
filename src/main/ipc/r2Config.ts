import { ipcMain, app } from 'electron'
import { readFile, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { R2Config } from '@shared/types'

// 默认 R2 配置模板 (不含密钥, 用户需通过设置面板填入)
const DEFAULT_R2_CONFIG: R2Config = {
  endpoint: 'https://40c4c9ea1e5d8a746dd7e3075bfaa3d3.r2.cloudflarestorage.com',
  accessKeyId: '',
  secretAccessKey: '',
  bucket: 'yuntu-products',
  customDomain: 'https://yutu.nv315.top',
}

let configPath = ''
let cachedConfig: R2Config = { ...DEFAULT_R2_CONFIG }

// 初始化配置文件路径 (启动时调用, 确保 cachedConfig 已从文件加载)
export function initR2Config(): void {
  configPath = join(app.getPath('userData'), 'r2-config.json')
  // 同步尝试从文件加载已有配置
  try {
    const fsSync = require('fs')
    if (fsSync.existsSync(configPath)) {
      const raw = fsSync.readFileSync(configPath, 'utf-8')
      cachedConfig = { ...DEFAULT_R2_CONFIG, ...JSON.parse(raw) }
    }
  } catch {
    // 文件不存在或损坏, 使用默认值
  }
}

// 读取配置
async function loadConfig(): Promise<R2Config> {
  try {
    await access(configPath)
    const raw = await readFile(configPath, 'utf-8')
    cachedConfig = { ...DEFAULT_R2_CONFIG, ...JSON.parse(raw) }
  } catch {
    // 首次运行，写回默认配置
    await writeFile(configPath, JSON.stringify(DEFAULT_R2_CONFIG, null, 2), 'utf-8')
    cachedConfig = { ...DEFAULT_R2_CONFIG }
  }
  return cachedConfig
}

// 保存配置
async function saveConfig(config: Partial<R2Config>): Promise<void> {
  cachedConfig = { ...cachedConfig, ...config }
  await writeFile(configPath, JSON.stringify(cachedConfig, null, 2), 'utf-8')
}

// 根据配置创建 S3 客户端
function createS3Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

export function registerR2ConfigHandlers(): void {
  // 配置文件路径需要在 app.whenReady 之后才能确定
  // 由主进程在 app.whenReady 中调用 initR2Config

  // 获取配置
  ipcMain.handle('r2-config-get', async (): Promise<R2Config> => {
    if (!configPath) return cachedConfig
    await loadConfig()
    return cachedConfig
  })

  // 保存配置
  ipcMain.handle(
    'r2-config-set',
    async (_event, config: Partial<R2Config>): Promise<void> => {
      await saveConfig(config)
    }
  )

  // 测试连接
  ipcMain.handle(
    'r2-config-test',
    async (): Promise<{ success: boolean; error?: string }> => {
      console.log('[R2 Config] 开始测试连接, bucket:', cachedConfig.bucket, 'endpoint:', cachedConfig.endpoint)
      try {
        if (!cachedConfig.accessKeyId || !cachedConfig.secretAccessKey) {
          return { success: false, error: 'R2 密钥未配置，请先填入 Access Key ID 和 Secret Access Key' }
        }

        const client = createS3Client(cachedConfig)

        await client.send(
          new ListObjectsV2Command({
            Bucket: cachedConfig.bucket,
            MaxKeys: 1,
          })
        )

        console.log('[R2 Config] 连接测试成功')
        return { success: true }
      } catch (error) {
        const msg = (error as Error).message || String(error)
        console.error('[R2 Config] 连接测试失败:', msg)
        return { success: false, error: msg }
      }
    }
  )
}

// 导出辅助函数供 uploadQueue 使用
export function getR2Config(): R2Config {
  return cachedConfig
}

export { createS3Client }
