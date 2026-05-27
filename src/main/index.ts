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
          text: `[PRODUCT CONTEXT]
${payload.folderName ? `素材包文件夹: ${payload.folderName}\n` : ''}${payload.productTitle ? `产品中文标题: ${payload.productTitle}\n` : ''}${payload.productCategory ? `产品类目: ${payload.productCategory}\n` : ''}${payload.originalFileNames && payload.originalFileNames.length > 0 ? `原始图片文件名:\n${payload.originalFileNames.map((f, i) => `  [${i}] ${f}`).join('\n')}\n` : ''}
[YOUR TASK]
你是跨境电商选品专家。基于产品上下文和图片，一次性完成以下任务。
输出纯 JSON，不带 Markdown 代码块，不带注释。

[TASK 1 - 基础信息]
- title: 中文标题（≤60字，优化已有标题）
- shortTitle: 中文短标题（≤10字，用于文件夹命名）
- category: 只能从「包包挂件/手机挂件/车内配饰/毛绒玩具」中选一个
- description: 中文卖点描述（2-3句，简洁实用）

[TASK 2 - 属性识别]

material（材质）规则：
- 必须且只能从以下列表中选择1个最匹配的值，不能自造
- 优先根据图片视觉判断，结合产品标题辅助确认
- 材质列表：
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

pattern（图案）规则：
- 输出英文，1-3个单词，Title Case
- 根据图片视觉特征判断，参考以下分类：
  外观形状类：Heart / Star / Moon / Crown / Bow / Flower
  卡通IP类：Cartoon / Animal / Bear / Cat / Bunny / Frog
  运动器材类：Baseball / Tennis / Badminton / Basketball / Football
  色彩构成类：Solid Color / Color Block / Gradient / Plaid / Striped
  食物类：Croissant / Cherry / Fruit / Candy
  其他：Geometric / Abstract / Letter / Number
- 若产品有多个SKU颜色，图案指造型/外观，不指颜色

[TASK 3 - SKU名称]
对每个SKU图片：
- skuName: 中文款式名（2-10汉字，体现颜色/款式/特征，每个SKU不同）
- skuNameEn: 英文款式名（2-5词，Title Case，≤28个字符）
  超过28字符时必须缩短，优先保留最关键的特征词
  示例：
  ✓ "Blue Sausage Mouth Charm"（25字符，合格）
  ✗ "Colorful Rainbow Striped Braided Rope Charm"（44字符，超限）
  → 改为 "Rainbow Striped Rope Charm"（26字符，合格）
- 中文名已确定的SKU：skuName原样返回，只生成skuNameEn
- 请确保skus数组包含每一个SKU，不遗漏

[TASK 4 - Shopee平台内容]

shopee.title 规则：
- 纯英文
- 总字符数严格控制在 120-160 之间（含空格）
- 必须包含关键词列表中至少3个词组，不能少于3个
- 关键词自然融入句子，不堆砌、不重复
- 关键词列表（至少选3个，选与产品最相关的）：
  bag charm / bag charms / bag accessories / keychain / keychains /
  keychain cute / cute keychain / keychain for bag / bag keychain /
  keychain accessories / keychain y2k / keychain cute for bag /
  bag keychain accessories / bag keychain aesthetic / bag charms accessories /
  handbag charm / key chain / key chain holder / bag charm accessories /
  cherry keychain / cherry bag charm / cherry charm / cherry key chain /
  croissant keychain / croissant bag charm / cat keychain / bunny keychain /
  turtle keychain / snoopy keychain / snoopy accessories / snoopy /
  bag accessories keychains and pins / accessories for bag /
  palawit sa bag / keychain for bag aesthetic

生成步骤（按顺序执行）：
第一步：从关键词列表中选出3个与产品最相关的词组
第二步：将这3个关键词自然融入标题句子中
第三步：统计字符数，如果少于120则补充产品描述词汇
第四步：如果超过160则精简非关键词部分
第五步：确认关键词数量 ≥ 3，字符数在 120-160 之间

示例（仅作格式参考，不要照抄）：
「Cute Cartoon Sausage Mouth Bag Charm, Colorful Tassel
 Keychain for Bag, Funny Bag Accessories for Bags & Keys
 Y2K Style Keychain Cute Pendant」
→ 包含：bag charm / keychain for bag / bag accessories / keychain cute
→ 字符数：约155

shopee.descriptionText 规则：
- 纯英文，格式化纯文本，不使用 Markdown（不用#*-等符号）
- 按以下六段固定结构输出，每段标题全大写加方括号：

[PRODUCT NAME]
（产品英文名，1行）

[SPECIFICATIONS]
（材质/尺寸/重量/颜色数量等关键规格，3-5行）

[USE SCENARIOS]
（适用场景，2-3句，平实描述）

[DESCRIPTION]
（产品特点，3-4句，不夸张，实事求是）

[HOW TO USE]
（使用方法，2-3句，简单明了）

[CARE INSTRUCTIONS]
（保养方式，2-3句，拿不准写通用保养方法）

- 段与段之间空一行
- 语言平实，避免过度营销用语

shopee.material: 与 material 字段保持一致（同一个值）

[OUTPUT FORMAT]
输出严格符合以下 JSON 结构，不添加任何其他字段：

{
  "title": "...",
  "shortTitle": "...",
  "category": "...",
  "description": "...",
  "material": "...",
  "pattern": "...",
  "shopee": {
    "title": "...",
    "descriptionText": "...",
    "material": "..."
  },
  "skus": [
    {
      "skuId": "完整路径/文件名.jpg",
      "skuName": "茱萸粉毛球款",
      "skuNameEn": "Rose Pink Pom Pom Charm"
    }
  ]
}

⚠️ 最终检查清单（输出前逐项确认）：
1. material 的值必须来自材质列表，不能自造
2. shopee.title 字符数在 120-160 之间，
   不足120必须补充描述词汇，超过160必须精简
3. shopee.title 包含至少3个关键词（不能少于3个），
   生成后逐个核对关键词是否真实出现在标题中
4. skus 数组包含所有 SKU，无遗漏
5. 输出纯 JSON，无 Markdown 代码块
6. 每个 skuNameEn 字符数 ≤ 28，超出必须精简`,
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
