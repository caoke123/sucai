// ==================== 全局异常容错 ====================
process.on('uncaughtException', (error) => {
  console.error('【未捕获的主进程异常】:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('【未处理的 Promise 拒绝】:', promise, '原因:', reason)
})

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerSelectDirectoryHandler } from './ipc/selectDirectory'
import { registerScanFolderHandler } from './ipc/scanFolder'
import { registerOrganizeFilesHandler } from './ipc/organizeFiles'
import { registerDbHandlers } from './ipc/dbHandlers'
import { registerR2ConfigHandlers, initR2Config } from './ipc/r2Config'
import { UploadQueueManager, registerUploadQueueHandlers } from './ipc/uploadQueue'
import {
  initAiConfig,
  getConfig,
  saveConfig,
  generateShopeeEnglish,
} from './services/ai'
import type { AiProviderConfig } from './services/ai/provider/doubaoProvider'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    title: '雨图饰品素材分拣系统',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: '#f8f9fa',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  // 注册业务 IPC
  registerSelectDirectoryHandler()
  registerScanFolderHandler()
  registerOrganizeFilesHandler()
  registerDbHandlers()
  registerR2ConfigHandlers()

  // R2 上传队列单例
  const uploadQueueManager = new UploadQueueManager()
  uploadQueueManager.setWindow(mainWindow)
  registerUploadQueueHandlers(uploadQueueManager)

  // 打开本地文件夹
  ipcMain.handle('open-path', async (_event, dirPath: string): Promise<string> => {
    return shell.openPath(dirPath)
  })

  // 读取文件 Base64
  ipcMain.handle('read-file-base64', async (_event, filePath: string): Promise<string> => {
    const data = await readFile(filePath)
    return data.toString('base64')
  })

  // 获取 AI 配置
  ipcMain.handle('get-ai-config', async (): Promise<AiProviderConfig> => {
    return getConfig()
  })

  // 保存 AI 配置
  ipcMain.handle('save-ai-config', async (_event, config: AiProviderConfig): Promise<void> => {
    await saveConfig(config)
  })

  // AI 视觉分析核心通道（主图分析 + SKU 命名 + 类目识别）
  ipcMain.handle(
    'call-ai-vision',
    async (
      _event,
      payload: {
        mainBase64List: string[];
        skuBase64List: string[];
        skuIds: string[];
        existingNames?: string[];
        aiConfig?: { apiKey: string; baseUrl: string; model: string }
      }
    ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
      try {
        const config = payload.aiConfig?.apiKey ? payload.aiConfig : await getConfig()
        if (!config.apiKey) {
          return { success: false, error: 'AI 配置中未设置 API Key，请在系统配置中填入密钥' }
        }

        const contentParts: Array<Record<string, unknown>> = []

        // 主图
        for (const b64 of payload.mainBase64List) {
          contentParts.push({ type: 'image_url', image_url: { url: b64 } })
        }

        // SKU 图：每张图前附加唯一 ID 文本标签；已有名称的不传图片
        const existing = payload.existingNames || []
        for (let i = 0; i < payload.skuBase64List.length; i++) {
          const skuId = (payload.skuIds[i] || `sku-${i}`).replace(/\\/g, '/')
          if (existing[i]) {
            contentParts.push({
              type: 'text',
              text: `SKU_ID: ${skuId} — 已有名称"${existing[i]}"，无需识别，请勿在skus数组中返回`,
            })
          } else if (payload.skuBase64List[i]) {
            contentParts.push({ type: 'text', text: `SKU_ID: ${skuId} — 请识别此图的款式名称` })
            contentParts.push({ type: 'image_url', image_url: { url: payload.skuBase64List[i] } })
          }
        }

        contentParts.push({
          type: 'text',
          text: `你是一个跨境电商选品与数据录入专家。我为你提供了一系列产品图片，在每张 SKU 图片之前，我都用文本标明了该图片的【SKU_ID】。

请你仔细观察标记为"请识别此图"的 SKU 图片，为它生成一个精准且吸引人的【SKU 款式名称】。
- 不要仅局限于颜色！可以是款式、样式、图案、材质或特定风格（如："miu系挂绳针织裙"、"复古做旧款"、"珍珠白蝴蝶结"、"库洛米同款"）。
- 名字简练，控制在 10 个中文字符以内。
- 如果标记为"已有名称，无需识别"，请跳过，不要在 skus 数组中返回它。

此外：
1. [category] 必须且只能从 "包包挂件"、"手机挂件"、"车内配饰"、"毛绒玩具" 中选择。
2. 为产品生成标题(title，≤60字)、短标题(shortTitle，≤10字)、卖点描述(description)。

⚠️【极其重要】：在输出的 JSON 中，skus 数组内的每一个对象，必须包含 skuId 字段，且该字段的值必须与我发给你的图片标签【SKU_ID】完全一致！绝对不能张冠李戴！

输出纯 JSON，不带 Markdown 代码块，格式如下：
{
  "title": "...",
  "shortTitle": "...",
  "category": "包包挂件",
  "description": "...",
  "skus": [
    { "skuId": "a_001", "skuName": "茱萸粉毛球款" }
  ]
}`,
        })

        const res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: contentParts }],
            max_tokens: 2000,
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          return { success: false, error: `AI 接口返回错误: ${res.status} ${errText}` }
        }

        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ''
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(jsonStr)
        } catch (parseError) {
          console.error('AI 返回的原始内容(JSON解析失败):', jsonStr.substring(0, 500))
          return { success: false, error: `AI 返回数据格式异常: ${(parseError as Error).message}` }
        }

        return { success: true, data: parsed }
      } catch (error) {
        return { success: false, error: `AI 调用失败: ${(error as Error).message}` }
      }
    }
  )

  // 单图 SKU 识别（1对1 精准识图）
  ipcMain.handle(
    'call-single-sku-vision',
    async (_event, payload: { base64Data: string; aiConfig?: { apiKey: string; baseUrl: string; model: string } }): Promise<{ success: boolean; specName?: string; error?: string }> => {
      try {
        const config = payload.aiConfig?.apiKey ? payload.aiConfig : await getConfig()
        if (!config.apiKey) {
          return { success: false, error: 'AI 配置中未设置 API Key' }
        }

        const res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: payload.base64Data } },
                  {
                    type: 'text',
                    text: '你是一个跨境电商多语言产品专家。请仔细观察这张单一的商品规格图（SKU图），提取并输出它所代表的具体颜色、款式或规格名称。\n\n【输出规则】：\n1. 需要输出一个好听、高档的中文款式名称（如："茱萸粉"、"摩卡棕"、"雾霾蓝"、"奶酪黄"）。\n2. 字数控制在 2 到 6 个汉字。\n3. 严格禁止返回任何 markdown 标记、禁止返回 JSON、禁止提供任何解释或"以下是结果"等废话。直接输出名字本身。',
                  },
                ],
              },
            ],
            max_tokens: 30,
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          return { success: false, error: `AI 接口返回错误: ${res.status} ${errText}` }
        }

        const data = await res.json()
        const specName = (data.choices?.[0]?.message?.content || '').trim()
        return { success: true, specName }
      } catch (error) {
        return { success: false, error: `SKU 识别失败: ${(error as Error).message}` }
      }
    }
  )

  // v4 Shopee 英文生成 (通过 AI Service Layer)
  ipcMain.handle(
    'call-shopee-english',
    async (
      _event,
      payload: {
        chineseTitle: string
        chineseDescription: string
        category: string
        skuNames: string[]
        mainImagePath?: string
        aiConfigOverrides?: { apiKey: string; baseUrl: string; model: string }
      }
    ): Promise<{ success: boolean; data?: { title: string; descriptionText: string; material: string; skuNamesEn: string[] }; error?: { type: string; message: string } }> => {
      const result = await generateShopeeEnglish({
        chineseTitle: payload.chineseTitle,
        chineseDescription: payload.chineseDescription,
        category: payload.category,
        skuNames: payload.skuNames,
        mainImagePath: payload.mainImagePath,
        aiConfigOverrides: payload.aiConfigOverrides,
      })

      if (!result.success) {
        return {
          success: false,
          error: { type: result.error!.type, message: result.error!.message },
        }
      }

      return { success: true, data: result.data }
    }
  )

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.setMenu(null) // 隐藏顶部默认菜单栏
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initAiConfig()
  initR2Config()

  electronApp.setAppUserModelId('com.material-sorter')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
