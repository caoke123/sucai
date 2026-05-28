// ==================== 全局异常容错 ====================
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection:', promise, 'reason:', reason)
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
import { registerCompressImagesHandler, cleanupCompressTemp } from './ipc/compressImages'
import { safeJsonParse } from '@shared/utils/safeJsonParse'
import { pool } from './db'

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

  // 图片压缩（步骤2.5）
  registerCompressImagesHandler()

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
      console.error('[IPC] Failed to clear image cache:', err)
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
    console.log(`[Preheat] Done ${preheated}/${imagePaths.length} images`)
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

  // AI 预分析：Step2 进入 Step3 前静默调用，仅传主图做基础识别
  ipcMain.handle(
    'call-ai-prefetch',
    async (_event, payload: {
      mainImagePath: string
      folderName: string
      originalFileNames: string[]
      productTitle?: string
      productCategory?: string
      aiConfig?: { apiKey: string; baseUrl: string; model: string }
    }): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
      try {
        const config = payload.aiConfig?.apiKey ? payload.aiConfig : await getConfig()
        if (!config.apiKey) return { success: false, error: '未配置 API Key' }

        const mainB64 = await prepareImageBase64(payload.mainImagePath)

        const prompt = `你是跨境电商选品专家。基于图片和文件夹信息快速完成基础信息识别。
输出纯JSON（不带Markdown代码块）：

素材包文件夹: ${payload.folderName || ''}
${payload.productTitle ? `已有标题: ${payload.productTitle}\n` : ''}原始文件名: ${(payload.originalFileNames || []).slice(0, 5).join(', ')}

[TASK 1] title: ≤60字中文标题 | shortTitle: ≤10字 |
         category: 包包挂件/手机挂件/车内配饰/毛绒玩具 |
         description: 2-3句中文卖点 | material: 从材质白名单选1个 |
         pattern: 1-3个英文词Title Case

[TASK 2] shopee.title: 纯英文120-160字符，
         从以下关键词选3-5个最相关的自然融入：
         bag charm / cute keychain / handbag charm / keychain for bag /
         bag charms / keychains / bag accessories / cute keychain for bag

输出格式：
{"title":"...","shortTitle":"...","category":"...","description":"...",
 "material":"...","pattern":"...",
 "shopee":{"title":"..."}}`

        const res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: mainB64 } },
                { type: 'text', text: prompt }
              ]
            }],
            max_tokens: 800,
          }),
        })

        if (!res.ok) return { success: false, error: `API错误: ${res.status}` }
        const data = await res.json()
        const raw = (data.choices?.[0]?.message?.content || '')
          .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = safeJsonParse(raw)
        return { success: true, data: parsed }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

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
        skipBasicInfo?: boolean
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
          `[Image Process] ${payload.mainImagePaths.length + payload.skuImagePaths.length} total, ` +
          `${Date.now() - t}ms, ${stats.hitCount} hit, ${stats.missCount} miss`
        )

        const contentParts: Array<Record<string, unknown>> = []

        // 主图
        for (const b64 of mainBase64List) {
          if (b64) contentParts.push({ type: 'image_url', image_url: { url: b64 } })
        }

        // 结构化上下文 (仅 push 一次, 在 SKU 循环之前)
        const skipBasic = payload.skipBasicInfo === true

        const mainPrompt = `[PRODUCT CONTEXT]
${payload.folderName ? `素材包文件夹: ${payload.folderName}\n` : ''}${payload.productTitle ? `产品中文标题: ${payload.productTitle}\n` : ''}${payload.productCategory ? `产品类目: ${payload.productCategory}\n` : ''}${payload.originalFileNames && payload.originalFileNames.length > 0 ? `原始图片文件名:\n${payload.originalFileNames.map((f, i) => `  [${i}] ${f}`).join('\n')}\n` : ''}
你是跨境电商选品专家。基于产品上下文和图片，一次完成以下任务，输出纯 JSON（不带Markdown代码块）。
${skipBasic ? `[预分析已完成，基础信息已填写，只需完成 SKU 识别任务]
` : `[TASK 1 - 基础信息]
title: ≤60字中文标题 | shortTitle: ≤10字 | category: 包包挂件/手机挂件/车内配饰/毛绒玩具 | description: 2-3句中文卖点描述

[TASK 2 - 属性识别]
material: 从下方 [REFERENCE DATA] 材质列表中选1个最匹配的值，禁止自造
pattern: 1-3个英文单词 Title Case，描述产品外观造型，非颜色。参考分类：外观形状(Heart/Star/Moon/Crown/Bow/Flower)、卡通IP(Cartoon/Animal/Bear/Cat/Bunny)、色彩(Solid Color/Color Block/Gradient/Plaid/Striped)、食物(Croissant/Cherry/Fruit/Candy)、其他(Geometric/Abstract/Letter/Number)

[TASK 4 - Shopee]
shopee.title: 纯英文标题，严格120-160字符（含空格）。从 [REFERENCE DATA] 关键词列表中选3-5个与本产品最相关的词自然融入。不堆砌，读起来像真人写的爆款标题。输出前数字符，不在范围内就重写。
shopee.descriptionText: 纯英文纯文本，六段结构[PRODUCT NAME]/[SPECIFICATIONS]/[USE SCENARIOS]/[DESCRIPTION]/[HOW TO USE]/[CARE INSTRUCTIONS]，每段标题全大写方括号，段间空一行，实事求是
shopee.material: 与material字段一致

`}[TASK 3 - SKU]
每个SKU生成: skuName(2-10汉字，颜色/款式特征，各SKU不重复) + skuNameEn(2-5词Title Case，≤28字符)
中文名已确定的SKU：skuName照用原值不修改，只生成skuNameEn。skus数组必须包含每个SKU，不遗漏。

${skipBasic ? `输出格式:
{"skus":[{"skuId":"路径/文件名.jpg","skuName":"茱萸粉毛球款","skuNameEn":"Rose Pink Charm"}]}` : `输出格式:
{ "title":"...", "shortTitle":"...", "category":"...", "description":"...", "material":"...", "pattern":"...", "shopee":{"title":"...","descriptionText":"...","material":"..."}, "skus":[{"skuId":"路径/文件名.jpg","skuName":"茱萸粉毛球款","skuNameEn":"Rose Pink Charm"}] }`}

${skipBasic ? '输出前确认: skus无遗漏; 纯JSON无代码块' : '输出前确认: shopee.title 字符数在120-160之间且含≥3个关键词; skuNameEn ≤28字符; skus无遗漏; material在材质列表中; 纯JSON无代码块'}`

        contentParts.push({
          type: 'text',
          text: mainPrompt,
        })

        // 追加参考数据区段（材质列表 + Shopee 关键词），与任务指令分离
        contentParts.push({
          type: 'text',
          text: `[REFERENCE DATA — 仅供选择参考，勿改动]

材质白名单（必须从此列表选1个最匹配的值）：
  竹纤维,帆布,羊绒,棉,羊毛,尼龙,涤纶,人造丝,PVC,橡胶,硅胶,丝绒,
  ABS,粘土,纸,塑料,布面,木材,泡沫,玻璃,皮革,金属,雪纺,牛仔布,毡,
  皮毛,针织,蕾丝,亚麻,其他,丝绸,合成皮,纺织,毛圈,莱卡,人造棉,Voal,
  钻石,玉,银,珍珠,钢,编织,PU革,网状布,绒革,聚碳酸酯纤维,铝,陶瓷的,
  铜,不锈钢,涂层的,合金,平织布,热塑性弹性体,纸板,太空棉,亚克力,结石,
  精梳棉,法兰绒,超细纤维,黄麻,乙烯基胶,黄铜,胶乳,记忆泡沫,羽毛,
  聚酯纤维填充,碳素钢,羊皮,热塑性聚氨酯,玛瑙,水晶,Modal,Faux Fur,
  Corduroy,Braid,Calfskin,Cowhide,Goatskin,Lambskin,Metallic,Satin,
  Twill,Acetate,Non-woven,Polypropylene,Recycled,Aluminum Alloy,
  Artificial Leather,Shell,Silk/Satin,Straw/Bamboo,Polypropylene (PP),
  Polyethylene (PE),Polystyrene (PS),Stainless,Gauze,Mineral,
  Non-woven Fabric,Chenille,Turquoise,Resin,Iron,Polycarbonate (PC),
  Cordura,Polímero,Polycotton,Cotton Blend,Cotton Polyester,Cotton Linen,
  Silk Satin,Batik Fabric,Synthetic Fabric,Knitted Fabric,Waterproof Fabric,
  Stretch Fabric,Organza,Plush,Genuine Leather,Microfiber Leather,
  Vegan Leather,Zinc Alloy,Enamel,Rhinestone,Imitation Pearl,Beads,毛绒

Shopee 热搜关键词（title中选≥3个，选与产品最相关的）：
  handbag charm / croissant bag charm / y2k plush bunny keychain /
  dice keychain / my melody keychain / pink keychain / bag designs accessories /
  brown keychain for bag aesthetic / snoopy keychain plush / bunny keychain /
  cute keychain / snoopy stuffed toy / palawit sa bag / keychain cute /
  cinnamoroll / turtle stuffed toy / bag accessories / keychain accessories /
  accessories for bag / bag accessories keychains and pins / bag keychain aesthetic /
  chiikawa miniso / cherry bag charm / 8 ball keychain / bag chain accessories /
  red bag charm / cherry keychain coach / bag keychain accessories /
  keychain cute for bag / coach cherry charm / keychains / bag charms /
  coach cherry keychain / cherry charm / key chain / bag keychain /
  snoopy plushie / key chain holder / keychain cherry / bag charms accessories /
  turtle keychain / keychain for bag / bag accessories charms / bag charm /
  snoopy keychain / snoopy / keychain for bag aesthetic / cherry keychain /
  keychain / cherry keychain for bag`,
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
            max_tokens: 3000,
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
            console.error('[AI Stream] Read error:', streamErr)
            _event.sender.send('ai-vision-stream', { error: (streamErr as Error).message, done: true })
            return
          }

          // 流结束：发送完成信号 + 完整 JSON 供渲染进程兜底解析
          const jsonStr = fullContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          try {
            const parsed = safeJsonParse(jsonStr)
            _event.sender.send('ai-vision-stream', { done: true, data: parsed })
          } catch (parseError) {
            console.error('[AI] JSON parse failed, raw:', jsonStr.substring(0, 500))
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

  // 数据库连接测试
  pool.query('SELECT 1')
    .then(() => console.log('[DB] PostgreSQL database connected successfully!'))
    .catch((err) => console.warn('[DB] Connection failed (offline mode):', err.message))

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

// 应用退出前清理压缩临时目录
app.on('before-quit', () => {
  cleanupCompressTemp()
})
