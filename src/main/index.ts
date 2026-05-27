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
  translateSingleSku,
  translateSkuBatch,
} from './services/ai'
import type { AiProviderConfig } from './services/ai/provider/doubaoProvider'
import { clearImageCompressionCache, prepareImageBase64 } from './services/ai/utils/compressImage'

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

  // 清理图片压缩缓存
  ipcMain.handle('clear-image-cache', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      clearImageCompressionCache()
      return { success: true }
    } catch (err) {
      console.error('[IPC] 清理图片缓存失败:', err)
      return { success: false, error: String(err) }
    }
  })

  // 缓存预热：后台静默预压缩所有图片
  ipcMain.handle('preheat-image-cache', async (_event, imagePaths: string[]): Promise<{ preheated: number }> => {
    const chunks: string[][] = []
    for (let i = 0; i < imagePaths.length; i += 5) {
      chunks.push(imagePaths.slice(i, i + 5))
    }
    let preheated = 0
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map((p) =>
          prepareImageBase64(p).then(() => { preheated++ }).catch(() => {})
        )
      )
    }
    console.log(`[缓存预热] 完成 ${preheated}/${imagePaths.length} 张`)
    return { preheated }
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

  // AI 视觉分析核心通道（主图分析 + SKU 命名 + 类目识别 + Shopee 本地化）
  ipcMain.handle(
    'call-ai-vision',
    async (
      _event,
      payload: {
        mainImagePaths: string[]
        skuImagePaths: string[]
        skuIds: string[]
        existingNames?: string[]
        productTitle?: string
        productCategory?: string
        originalFileNames?: string[]
        folderName?: string
        aiConfig?: { apiKey: string; baseUrl: string; model: string }
      }
    ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
      try {
        const config = payload.aiConfig?.apiKey ? payload.aiConfig : await getConfig()
        if (!config.apiKey) {
          return { success: false, error: 'AI 配置中未设置 API Key' }
        }

        // 主进程统一处理所有图片（读取+Sharp压缩+缓存，并发执行）
        const t = Date.now()
        const stats = { hitCount: 0, missCount: 0 }
        const [mainBase64List, skuBase64List] = await Promise.all([
          Promise.all(payload.mainImagePaths.map((p) =>
            prepareImageBase64(p, stats)
          )),
          Promise.all(payload.skuImagePaths.map((p) =>
            prepareImageBase64(p, stats).catch(() => '')
          )),
        ])
        console.log(
          `[图片处理] 共 ${payload.mainImagePaths.length + payload.skuImagePaths.length} 张，` +
          `耗时 ${Date.now() - t}ms，命中 ${stats.hitCount} 张，压缩 ${stats.missCount} 张`
        )

        const contentParts: Array<Record<string, unknown>> = []

        // 主图
        for (const b64 of mainBase64List) {
          if (b64) contentParts.push({ type: 'image_url', image_url: { url: b64 } })
        }

        // 结构化上下文 (仅 push 一次, 在 SKU 循环之前)
        contentParts.push({
          type: 'text',
          text: `[PRODUCT CONTEXT — PRIMARY SOURCE, READ FIRST]
${payload.folderName ? `素材包文件夹: ${payload.folderName}\n` : ''}${payload.productTitle ? `产品中文标题: ${payload.productTitle}\n` : ''}${payload.productCategory ? `产品类目: ${payload.productCategory}\n` : ''}${payload.originalFileNames && payload.originalFileNames.length > 0 ? `原始图片文件名:\n${payload.originalFileNames.map((f, i) => `  [${i}] ${f}`).join('\n')}\n` : ''}
[YOUR TASK]
你是一个跨境电商选品与数据录入及本地化专家。

基于以上产品上下文（文件夹名/标题/原始文件名），结合图片内容作为辅助确认，请一次性完成以下任务：

1. 确认或优化产品中文标题(title, ≤60字)
2. 生成短标题(shortTitle, ≤10字)，用于文件夹命名
3. 从 "包包挂件"、"手机挂件"、"车内配饰"、"毛绒玩具" 中选择最合适的类目(category)
4. 生成卖点描述(description)
5. 对标记为"请识别此图"的 SKU 图片生成款式名称（中文 + 英文，同步输出）
6. 额外任务：同步生成专门针对 Shopee 平台优化的英文推广内容（包括英文标题、英文描述、材质属性）

[SHOPEE PLATFORM LOCALIZATION RULES]
- 标题 (shopee.title): 英文 Title Case，34-180个字符，自然融入3个热搜关键词
- 描述 (shopee.descriptionText): 500-1500字符，纯文本，包含 [IMAGE] 占位符。第一段核心卖点，第二段特性说明，第三段使用场景
- 材质 (shopee.material): 2-4个英文材质词，逗号分隔，如 "Plush, PP Cotton"

[SKU 命名规则]
- 每张图必须生成不同的款式名称，禁止多张图返回相同名称
- 优先参考该图对应的原始文件名（originalFileNames 中对应索引），从文件名提取变体特征
- 变体特征包括但不限于：颜色、材质、数量、尺寸、配件、款式、图案等
- 文件名中有明确特征词（如"绿色"、"3件套"、"带挂钩"）必须保留在款式名称中
- 文件名无明显特征时，仔细观察图片，描述与其他图片最明显的差异点
- 2-10个中文字符
- 对于标注"中文名已确定"的SKU：skuName必须原样使用提供的中文名不要修改，skuNameEn根据图片生成准确英文名，该SKU必须出现在返回的skus数组中
- 请确保skus数组中每个skuId都对应一条记录，不要遗漏任何SKU

[ENGLISH SKU NAME RULES]
- 每个 SKU 必须同时生成对应的英文款式名称（skuNameEn）
- 英文名 2-5个单词，Title Case，用于 Shopee 等跨境平台
- 必须是该 SKU 英文变体名，不是裸颜色词，不是纯产品名
- 参考中文名和产品标题，组合变体特征词 + 产品类型词
- 示例：中文"蓝色香肠嘴挂件" → 英文"Blue Sausage Mouth Charm"

⚠️ 极其重要：必须返回以下格式的纯 JSON 对象，不要包含 markdown 标记：
{
  "title": "...",
  "shortTitle": "...",
  "category": "...",
  "description": "...",
  "shopee": {
    "title": "...",
    "descriptionText": "...",
    "material": "..."
  },
  "skus": [
    {
      "skuId": "D:/images/blue.jpg",
      "skuName": "蓝色香肠嘴挂件",
      "skuNameEn": "Blue Sausage Mouth Charm"
    }
  ]
}`,
        })

        // SKU 图：每张图前附加唯一 ID 文本标签
        const existing = payload.existingNames || []
        for (let i = 0; i < payload.skuIds.length; i++) {
          const skuId = (payload.skuIds[i] || `sku-${i}`).replace(/\\/g, '/')
          const b64 = skuBase64List[i] || ''
          if (existing[i]) {
            // 中文名已确定，传图辅助翻译英文名
            if (b64) {
              contentParts.push({ type: 'image_url', image_url: { url: b64 } })
            }
            contentParts.push({
              type: 'text',
              text: `SKU_ID: ${skuId} — 中文名已确定为"${existing[i]}"，请直接用此中文名作为skuName，并根据图片生成准确的英文名skuNameEn`,
            })
          } else if (b64) {
            contentParts.push({
              type: 'text',
              text: `SKU_ID: ${skuId} — 请识别此图，生成中文名skuName和英文名skuNameEn`,
            })
            contentParts.push({ type: 'image_url', image_url: { url: b64 } })
          } else {
            // 图片读取失败，仅发送文字标签让AI尽力生成
            contentParts.push({
              type: 'text',
              text: `SKU_ID: ${skuId} — 请识别此图（图片读取失败，请根据其他SKU的风格推测此SKU的名称，生成中文名skuName和英文名skuNameEn）`,
            })
          }
        }

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
            stream: true,
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          return { success: false, error: `AI 接口返回错误: ${res.status} ${errText}` }
        }

        // 流式读取并实时推送给渲染进程
        const reader = res.body?.getReader()
        if (!reader) {
          return { success: false, error: 'AI 接口不支持流式响应' }
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''

        // 异步处理流式读取，不阻塞 handler 返回
        ;(async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''

              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data: ')) continue
                const data = trimmed.slice(6)
                if (data === '[DONE]') continue
                try {
                  const chunk = JSON.parse(data)
                  const delta = chunk.choices?.[0]?.delta?.content
                  if (delta) {
                    fullContent += delta
                    _event.sender.send('ai-vision-stream', { delta })
                  }
                } catch { /* 跳过解析失败的行 */ }
              }
            }
          } catch (streamErr) {
            console.error('[AI Stream] 流式读取异常:', streamErr)
            _event.sender.send('ai-vision-stream', { error: (streamErr as Error).message, done: true })
            return
          }

          // 流结束：发送完成信号 + 完整 JSON 供渲染进程兜底解析
          const jsonStr = fullContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          try {
            const parsed = JSON.parse(jsonStr)
            _event.sender.send('ai-vision-stream', { done: true, data: parsed })
          } catch (parseError) {
            console.error('AI 返回的原始内容(JSON解析失败):', jsonStr.substring(0, 500))
            _event.sender.send('ai-vision-stream', { error: `AI 返回数据格式异常: ${(parseError as Error).message}`, done: true })
          }
        })()

        // 流式模式下立即返回，流数据通过 ai-vision-stream 事件推送
        return { success: true, streaming: true }
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
        originalFileNames?: string[]
        mainImagePath?: string
        aiConfigOverrides?: { apiKey: string; baseUrl: string; model: string }
      }
    ): Promise<{ success: boolean; data?: { title: string; descriptionText: string; material: string }; error?: { type: string; message: string } }> => {
      const result = await generateShopeeEnglish({
        chineseTitle: payload.chineseTitle,
        chineseDescription: payload.chineseDescription,
        category: payload.category,
        skuNames: payload.skuNames,
        originalFileNames: payload.originalFileNames,
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

  // v4.5 单 SKU 英文翻译
  ipcMain.handle(
    'call-translate-sku',
    async (
      _event,
      payload: {
        chineseTitle: string
        category: string
        skuName: string
        skuFileName?: string
        skuImagePath?: string
        aiConfigOverrides?: { apiKey: string; baseUrl: string; model: string }
      }
    ): Promise<{ success: boolean; data?: { nameEn: string }; error?: { type: string; message: string } }> => {
      const result = await translateSingleSku(payload)

      if (!result.success) {
        return { success: false, error: { type: result.error!.type, message: result.error!.message } }
      }

      return { success: true, data: result.data }
    }
  )

  // v4.5 批量 SKU 英文翻译
  ipcMain.handle(
    'call-translate-sku-batch',
    async (
      _event,
      payload: {
        skuList: Array<{ id: string; skuName: string; skuFileName?: string; skuImagePath?: string }>
        title: string
        category: string
        aiConfigOverrides?: { apiKey: string; baseUrl: string; model: string }
      }
    ): Promise<{ success: boolean; data?: { results: Array<{ id: string; nameEn: string }> }; error?: { type: string; message: string } }> => {
      const result = await translateSkuBatch({
        skuList: payload.skuList,
        title: payload.title,
        category: payload.category,
        aiConfigOverrides: payload.aiConfigOverrides,
      })

      if (!result.success) {
        return { success: false, error: { type: result.error!.type, message: result.error!.message } }
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
