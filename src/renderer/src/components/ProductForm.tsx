import { useState, useEffect, useCallback } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import {
  CATEGORY_CODE_MAP,
  STYLE_CODE_MAP,
  STYLE_KEYWORD_MAP,
  INVALID_FILENAME_BLACKLIST,
  MEANINGLESS_NAME_REGEX,
  CATEGORY_TO_SHOPEE,
} from '@shared/constants'
import { BasicInfoSection } from './step3/sections/BasicInfoSection'
import { ShopeeInfoSection } from './step3/sections/ShopeeInfoSection'
import { SkuTableSection } from './step3/sections/SkuTableSection'
import { PackagingSection } from './step3/sections/PackagingSection'

// 货源类目选项
const CATEGORY_OPTIONS = Object.entries(CATEGORY_CODE_MAP).map(([name, code]) => ({ code, name }))

// 根据颜色/风格名称模糊匹配风格编码
const getStyleCode = (detectedStyleOrColor: string): string => {
  if (!detectedStyleOrColor) return 'MX'

  for (const [name, code] of Object.entries(STYLE_CODE_MAP)) {
    if (detectedStyleOrColor.includes(name) || name.includes(detectedStyleOrColor)) {
      return code
    }
  }

  for (const [key, code] of Object.entries(STYLE_KEYWORD_MAP)) {
    if (detectedStyleOrColor.toLowerCase().includes(key)) {
      return code
    }
  }

  return 'MX'
}

const getCategoryCode = (categoryNameOrCode: string): string => {
  const codes = Object.values(CATEGORY_CODE_MAP)
  if (codes.includes(categoryNameOrCode)) return categoryNameOrCode
  return CATEGORY_CODE_MAP[categoryNameOrCode] || 'XX'
}

// 无效名称黑名单（社交/截图/AI生成/临时文件等）
function isInvalidFilename(name: string): boolean {
  if (!name) return true
  const lower = name.toLowerCase()
  if (/^[\d_-]+$/.test(lower)) return true
  return INVALID_FILENAME_BLACKLIST.some((kw) => lower.includes(kw.toLowerCase()))
}

function isMeaninglessName(fileName: string): boolean {
  if (!fileName) return true
  const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName
  return MEANINGLESS_NAME_REGEX.some((regex) => regex.test(nameWithoutExt))
}

// SKU英文名截断保护：超过28字符时截到最后一个完整单词
function truncateSkuNameEn(name: string): string {
  if (!name || name.length <= 28) return name || ''
  const truncated = name.slice(0, 28)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated
}

function extractSkuFromFilename(filename: string): string | null {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
  if (isInvalidFilename(nameWithoutExt)) return null
  if (isMeaninglessName(filename)) return null

  const cleaned = nameWithoutExt
    .replace(/[_\-\s]*\d+$/, '')
    .replace(/\(\d+\)$/, '')
    .replace(/（\d+）$/, '')
    .replace(/[_\-\s]+$/, '')
    .replace(/\s+/g, '')
    .trim()

  if (!cleaned || cleaned.length < 1) return null
  if (isInvalidFilename(cleaned)) return null
  return cleaned
}

const PINYIN_INITIALS: Record<string, string> = {
  '色': 'S', '白': 'B', '黑': 'H', '红': 'H', '蓝': 'L', '绿': 'L', '黄': 'H', '紫': 'Z', '粉': 'F',
  '灰': 'H', '银': 'Y', '棕': 'Z', '橙': 'C', '米': 'M', '咖': 'K', '花': 'H', '格': 'G',
  '大': 'D', '中': 'Z', '小': 'X', '厚': 'H', '薄': 'B', '长': 'C', '短': 'D', '宽': 'K', '高': 'G',
  '新': 'X', '款': 'K', '季': 'J', '春': 'C', '夏': 'X', '秋': 'Q', '冬': 'D', '男': 'N', '女': 'N',
  '儿': 'E', '童': 'T', '宝': 'B', '家': 'J', '居': 'J', '用': 'Y', '品': 'P', '装': 'Z', '饰': 'S',
  '材': 'C', '料': 'L', '棉': 'M', '麻': 'M', '丝': 'S', '毛': 'M', '皮': 'P', '革': 'G', '木': 'M',
  '编': 'B', '织': 'Z', '纺': 'F', '手': 'S', '机': 'J', '电': 'D', '数': 'S', '码': 'M', '鞋': 'X',
  '服': 'F', '帽': 'M', '包': 'B', '袋': 'D', '箱': 'X', '椅': 'Y', '桌': 'Z', '床': 'C', '柜': 'G',
  '灯': 'D', '具': 'J', '文': 'W', '体': 'T', '运': 'Y', '动': 'D', '户': 'H', '外': 'W', '旅': 'L',
  '行': 'X', '美': 'M', '容': 'R', '化': 'H', '妆': 'Z', '洗': 'X', '护': 'H', '食': 'S',
  '饮': 'Y', '生': 'S', '鲜': 'X', '冷': 'L', '冻': 'D', '宠': 'C', '物': 'W', '园': 'Y',
  '艺': 'Y', '工': 'G', '汽': 'Q', '车': 'C', '安': 'A', '防': 'F', '办': 'B', '公': 'G', '印': 'Y',
  '刷': 'S', '纸': 'Z', '塑': 'S', '胶': 'J', '金': 'J', '属': 'S', '玻': 'B', '璃': 'L', '陶': 'T',
  '瓷': 'C', '日': 'R', '货': 'H', '礼': 'L', '赠': 'Z', '促': 'C', '销': 'X', '定': 'D',
  '制': 'Z', '挂': 'G', '绳': 'S', '链': 'L', '圈': 'Q', '环': 'H', '扣': 'K', '钩': 'G',
  '贴': 'T', '牌': 'P', '卡': 'K', '珠': 'Z', '钻': 'Z', '钉': 'D', '线': 'X',
  '带': 'D', '套': 'T', '壳': 'K', '罩': 'Z', '垫': 'D', '毯': 'T', '被': 'B', '枕': 'Z', '巾': 'J',
  '浴': 'Y', '卫': 'W', '厨': 'C', '房': 'F', '餐': 'C', '锅': 'G', '碗': 'W', '筷': 'K', '勺': 'S',
  '杯': 'B', '壶': 'H', '瓶': 'P', '罐': 'G', '盒': 'H', '篮': 'L', '架': 'J', '层': 'C',
  '网': 'W', '筛': 'S', '笔': 'B', '刀': 'D', '剪': 'J', '尺': 'C', '针': 'Z', '钳': 'Q',
  '质': 'Z', '量': 'Z', '价': 'J', '特': 'T', '惠': 'H', '批': 'P', '发': 'F', '零': 'L', '售': 'S',
  '清': 'Q', '仓': 'C', '甩': 'S', '卖': 'M', '爆': 'B', '热': 'R', '潮': 'C', '流': 'L', '风': 'F',
  '一': 'Y', '二': 'E', '三': 'S', '四': 'S', '五': 'W', '六': 'L', '七': 'Q', '八': 'B', '九': 'J',
  '十': 'S', '千': 'Q', '万': 'W', '亿': 'Y',
}

function toPinyinInitials(text: string): string {
  let result = ''
  for (const char of text) {
    if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toUpperCase()
    } else if (PINYIN_INITIALS[char]) {
      result += PINYIN_INITIALS[char]
    }
  }
  return result
}

function generateProductCode(shortTitle: string, counter: number): string {
  const initials = toPinyinInitials(shortTitle).slice(0, 4)
  const numStr = String(counter).padStart(5, '0')
  return `${initials}${numStr}`
}

// ==================== 主组件 ====================

export function ProductForm(): JSX.Element {
  const {
    productInfo,
    images,
    shortTitle,
    productCode,
    productCounter,
    aiConfig,
    skuList,
    currentSpu,
    packagingPresets,
    selectedPresetId,
    sourceFolderPath,
    outputFolderPath,
    shopeeInfo,
    setProductInfo,
    setShortTitle,
    setProductCode,
    incrementCounter,
    updateSkuInfo,
    setSkuList,
    updateSkuItem,
    updateSpu,
    setPresets,
    setShopeeInfo,
    setShopeeAttributes,
    setStep,
  } = useSorterStore()

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [translatingSkuCode, setTranslatingSkuCode] = useState<string | null>(null)
  const [batchTranslating, setBatchTranslating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // 批量填充栏本地状态
  const [batchLength, setBatchLength] = useState('')
  const [batchWidth, setBatchWidth] = useState('')
  const [batchHeight, setBatchHeight] = useState('')
  const [batchWeight, setBatchWeight] = useState('')
  const [batchCost, setBatchCost] = useState('')
  const [batchSelling, setBatchSelling] = useState('')
  const [batchStock, setBatchStock] = useState('')

  // 拉取纸箱预设
  useEffect(() => {
    const loadPresets = async (): Promise<void> => {
      if (!window.api?.db) return
      try {
        const result = await window.api.db.getPackagingPresets()
        if (result.success && result.data) {
          setPresets(result.data)
        }
      } catch {
        // 数据库未连接时静默失败
      }
    }
    loadPresets()
  }, [setPresets])

  // 标注图片 → SKU 列表自动同步
  useEffect(() => {
    const st = useSorterStore.getState()
    if (st.skuList.length > 0) return
    if (images.length === 0) return

    const skuImages = images.filter((img) => img.labels.includes('SKU图'))
    if (skuImages.length === 0) return

    // 按 skuSpec 去重，相同 skuSpec 只保留第一张
    const seen = new Set<string>()
    const dedupedSkuImages = skuImages.filter((img) => {
      const key = img.skuSpec?.trim() || img.fileName
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const initialSkuList = dedupedSkuImages.map((img) => {
      const filenameColor = extractSkuFromFilename(img.fileName)
      const colorName = img.skuSpec || filenameColor || ''
      const needAiName = !colorName

      return {
        skuCode: '',
        colorName,
        dimensions: img.size || '',
        weight: img.weight ? Number(img.weight) : 0,
        costPrice: 0,
        sellingPrice: 0,
        stock: 0,
        skuNameEn: '',
        imagePath: img.originalPath,
        previewUrl: img.thumbnailDataUrl,
        needAiName,
      }
    })

    const colorNameCount = new Map<string, number>()
    for (const sku of initialSkuList) {
      if (sku.colorName) {
        colorNameCount.set(sku.colorName, (colorNameCount.get(sku.colorName) ?? 0) + 1)
      }
    }
    const dedupedList = initialSkuList.map((sku) => {
      if (sku.colorName && (colorNameCount.get(sku.colorName) ?? 0) > 1) {
        return { ...sku, colorName: '', needAiName: true }
      }
      return sku
    })

    setSkuList(dedupedList)
  }, [images])

  // 切换产品时清理主进程图片缓存
  useEffect(() => {
    if (productCode) {
      window.electronAPI?.clearImageCache()
    }
  }, [productCode])

  // 内部类目变更 → 自动同步 Shopee 平台类目
  useEffect(() => {
    const cat = productInfo.category
    if (cat && CATEGORY_TO_SHOPEE[cat]) {
      const st = useSorterStore.getState()
      if (!st.shopeeInfo.category || st.shopeeInfo.category.length === 0) {
        st.setShopeeInfo({ category: CATEGORY_TO_SHOPEE[cat] })
      }
    }
  }, [productInfo.category])

  // 类目/SKU颜色变更 → 重新计算所有 SKU 编码
  useEffect(() => {
    const st = useSorterStore.getState()
    const categoryName = st.currentSpu?.categoryCode || ''
    if (!categoryName) return
    const catCode = getCategoryCode(categoryName)
    const currentList = st.skuList
    if (currentList.length === 0) return

    const updated = currentList.map((sku, i) => ({
      ...sku,
      skuCode: `${catCode}-${getStyleCode(sku.colorName)}-${String(i + 1).padStart(4, '0')}`,
    }))
    st.setSkuList(updated)
  }, [currentSpu?.categoryCode, skuList.map((s) => s.colorName).join(',')])

  // 流式完成后的兜底回填（确保所有字段不遗漏）
  const finalBackfill = (data: Record<string, unknown>, getSkuList: () => typeof skuList): void => {
    const s2 = useSorterStore.getState()
    if (data.title && typeof data.title === 'string') setProductInfo({ title: data.title })
    if (data.description && typeof data.description === 'string') setProductInfo({ description: data.description })
    if (data.category && typeof data.category === 'string') {
      const catCode = getCategoryCode(data.category)
      updateSpu({ categoryCode: catCode, spuName: data.category })
      setProductInfo({ category: data.category })
    }
    if (data.shortTitle && typeof data.shortTitle === 'string') {
      setShortTitle(data.shortTitle)
      const code = generateProductCode(data.shortTitle, s2.productCounter)
      setProductCode(code)
      setProductInfo({ productNo: code })
      incrementCounter()
    }
    if (data.material && typeof data.material === 'string') setProductInfo({ material: data.material })
    if (data.pattern && typeof data.pattern === 'string') setProductInfo({ pattern: data.pattern })
    if (data.shopee) {
      const sh = data.shopee as Record<string, unknown>
      if (sh.title && typeof sh.title === 'string') setShopeeInfo({ title: sh.title })
      if (sh.descriptionText && typeof sh.descriptionText === 'string') setShopeeInfo({ descriptionText: sh.descriptionText })
      if (sh.material && typeof sh.material === 'string') setProductInfo({ material: sh.material })
    }
    if (data.skus && Array.isArray(data.skus)) {
      const currentList = getSkuList()
      const s3 = useSorterStore.getState()
      for (const aiSku of data.skus) {
        const s = aiSku as Record<string, unknown>
        if (!s.skuId || !s.skuName) continue
        const targetIndex = currentList.findIndex(
          (item) => item.imagePath.replace(/\\/g, '/') === s.skuId
        )
        if (targetIndex !== -1) {
          s3.updateSkuItem(targetIndex, {
            colorName: s.skuName as string,
            skuNameEn: truncateSkuNameEn((s.skuNameEn as string) || ''),
            needAiName: false,
          })
        }
      }
    }
  }

  // AI 一键智能填表
  const handleAiFill = async (): Promise<void> => {
    const mainImages = images.filter((img) => img.labels.includes('主图')).slice(0, 1)
    if (mainImages.length === 0) {
      setAiError('请先在图片标注步骤中标记至少一张主图')
      return
    }
    setAiLoading(true)
    setAiError(null)

    try {
      const st = useSorterStore.getState()
      const list = st.skuList

      const mainImagePaths = mainImages.map((img) => img.originalPath)
      const skuImagePaths: string[] = []
      const skuIds: string[] = []
      const existingNames: string[] = []

      for (let i = 0; i < list.length; i++) {
        const s = list[i]
        const safeId = (s.imagePath || `sku-${i}`).replace(/\\/g, '/')
        skuIds.push(safeId)
        skuImagePaths.push(s.imagePath || '')
        if (s.needAiName) {
          existingNames.push('')
        } else {
          existingNames.push(s.colorName)
        }
      }

      // 收集原始文件名
      const allOriginalNames = images.map((img) => img.fileName || '')

      setSuccessMessage('AI 正在分析图片...')

      // 流式启动：主进程立即返回，增量数据通过事件推送
      const streamResult = await window.electronAPI.callAiVision({
        mainImagePaths,
        skuImagePaths,
        skuIds,
        existingNames,
        productTitle: st.productInfo.title || undefined,
        productCategory: st.currentSpu?.spuName || st.productInfo.category || undefined,
        originalFileNames: allOriginalNames,
        folderName: st.productCode ? `[${st.productCode}] ${st.shortTitle}_素材包` : undefined,
        aiConfig,
      })

      if (!streamResult.success) {
        setAiError(streamResult.error || 'AI 分析失败')
        setAiLoading(false)
        setSuccessMessage(null)
        return
      }

      // 流式回填：通过 StreamJsonParser 实时提取已完成字段并立即回填
      let accumulated = ''
      let firstTitleFilled = false
      let firstSkuFilled = false

      const parser = {
        filled: { title: false, shortTitle: false, category: false, description: false, shopeeTitle: false, material: false, pattern: false },
        filledSkuIds: new Set<string>(),

        feed(delta: string): void {
          accumulated += delta
          const text = accumulated

          // 提取标题
          if (!this.filled.title) {
            const m = text.match(/"title"\s*:\s*"([^"]{1,200})"/)
            if (m) { setProductInfo({ title: m[1] }); this.filled.title = true; setSuccessMessage('正在生成 SKU 名称...') }
          }
          // 提取短标题
          if (!this.filled.shortTitle) {
            const m = text.match(/"shortTitle"\s*:\s*"([^"]{1,50})"/)
            if (m) { setShortTitle(m[1]); this.filled.shortTitle = true }
          }
          // 提取类目
          if (!this.filled.category) {
            const m = text.match(/"category"\s*:\s*"([^"]{1,50})"/)
            if (m) {
              const catCode = getCategoryCode(m[1])
              updateSpu({ categoryCode: catCode, spuName: m[1] })
              setProductInfo({ category: m[1] })
              if (catCode === 'BG') {
                const s = useSorterStore.getState()
                if (!s.shopeeInfo.jitInvitationCode) s.setShopeeInfo({ jitInvitationCode: 'IVCN202507240989' })
              }
              this.filled.category = true
            }
          }
          // 提取描述
          if (!this.filled.description) {
            const m = text.match(/"description"\s*:\s*"((?:[^"\\]|\\.){1,500})"/)
            if (m) { setProductInfo({ description: m[1] }); this.filled.description = true }
          }
          // 提取 Shopee 标题
          if (!this.filled.shopeeTitle) {
            const m = text.match(/"shopee"\s*:\s*\{[^}]*"title"\s*:\s*"([^"]{1,200})"/)
            if (m) { setShopeeInfo({ title: m[1] }); this.filled.shopeeTitle = true }
          }
          // 提取材质
          if (!this.filled.material) {
            const m = text.match(/"material"\s*:\s*"([^"]{1,100})"/)
            if (m) { setProductInfo({ material: m[1] }); this.filled.material = true }
          }
          // 提取图案
          if (!this.filled.pattern) {
            const m = text.match(/"pattern"\s*:\s*"([^"]{1,100})"/)
            if (m) { setProductInfo({ pattern: m[1] }); this.filled.pattern = true }
          }

          // 提取完整 SKU 对象（含中英文名）
          const skuRe = /\{\s*"skuId"\s*:\s*"([^"]+)"\s*,\s*"skuName"\s*:\s*"([^"]+)"\s*,\s*"skuNameEn"\s*:\s*"([^"]+)"\s*\}/g
          let match
          while ((match = skuRe.exec(text)) !== null) {
            const [, skuId, skuName, skuNameEn] = match
            if (!this.filledSkuIds.has(skuId)) {
              this.filledSkuIds.add(skuId)
              const idx = list.findIndex((s) => s.imagePath.replace(/\\/g, '/') === skuId)
              if (idx !== -1) {
                const s3 = useSorterStore.getState()
                s3.updateSkuItem(idx, { colorName: skuName, skuNameEn: truncateSkuNameEn(skuNameEn || ''), needAiName: false })
                if (!firstSkuFilled) { setSuccessMessage('正在生成剩余 SKU 名称...'); firstSkuFilled = true }
              }
            }
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        window.electronAPI.onAiVisionStream(({ delta, done, error, data }) => {
          if (error) {
            window.electronAPI.offAiVisionStream()
            setAiError(error)
            setAiLoading(false)
            setSuccessMessage(null)
            resolve()
            return
          }
          if (done) {
            window.electronAPI.offAiVisionStream()
            // 完整 JSON 兜底：流式未能提取的字段用最终数据补充
            if (data) {
              finalBackfill(data, () => useSorterStore.getState().skuList)
            }
            setSuccessMessage(null)
            setAiLoading(false)
            resolve()
            return
          }
          if (delta) {
            parser.feed(delta)
            if (!firstTitleFilled && parser.filled.title) {
              firstTitleFilled = true
            }
          }
        })
      })

    } catch (error) {
      console.error('[AI填表] 执行出错:', error)
      setAiError(error instanceof Error ? error.message : 'AI填表失败，请重试')
    } finally {
      setAiLoading(false)
    }
  }

  // 批量填充
  const handleBatchFill = (): void => {
    const parts = [batchLength, batchWidth, batchHeight].filter(Boolean)
    const dimensions = parts.length === 3 ? parts.join('x') : ''
    const weight = batchWeight ? Number(batchWeight) : undefined
    const costPrice = batchCost ? Number(batchCost) : undefined
    const sellingPrice = batchSelling ? Number(batchSelling) : undefined
    const stock = batchStock ? Number(batchStock) : undefined

    if (skuList.length === 0) return

    const updatedList = skuList.map((sku) => {
      const updated = { ...sku }
      if (dimensions) updated.dimensions = dimensions
      if (weight !== undefined && !isNaN(weight)) updated.weight = weight
      if (costPrice !== undefined && !isNaN(costPrice)) updated.costPrice = costPrice
      if (sellingPrice !== undefined && !isNaN(sellingPrice)) updated.sellingPrice = sellingPrice
      if (stock !== undefined && !isNaN(stock)) updated.stock = stock
      return updated
    })
    setSkuList(updatedList)

    setBatchLength('')
    setBatchWidth('')
    setBatchHeight('')
    setBatchWeight('')
    setBatchCost('')
    setBatchSelling('')
    setBatchStock('')
  }

  // 复用上一行数据
  const handleCopyPreviousSku = (idx: number): void => {
    if (idx === 0) return
    const prev = skuList[idx - 1]
    updateSkuItem(idx, {
      dimensions: prev.dimensions,
      weight: prev.weight,
      costPrice: prev.costPrice,
      sellingPrice: prev.sellingPrice,
    })
  }

  // 纸箱预设选中
  const handlePresetSelect = useCallback(
    (presetId: string): void => {
      if (!presetId) return
      const preset = packagingPresets.find((p) => String(p.id) === presetId)
      if (!preset) return
      updateSpu({
        outerPackLength: preset.length,
        outerPackWidth: preset.width,
        outerPackHeight: preset.height,
        outerPackWeight: preset.weight,
      })
    },
    [packagingPresets, updateSpu]
  )

  // v4.5 单 SKU 英文翻译
  const handleTranslateSku = async (index: number): Promise<void> => {
    if (!window.electronAPI) return
    const st = useSorterStore.getState()
    const sku = st.skuList[index]
    if (!sku || !sku.colorName) return

    const targetCode = sku.skuCode || sku.colorName
    setTranslatingSkuCode(targetCode)
    try {
      const result = await window.electronAPI.callTranslateSku({
        chineseTitle: productInfo.title,
        category: currentSpu?.categoryCode || '',
        skuName: sku.colorName,
        skuFileName: sku.imagePath?.replace(/^.*[\\/]/, '') || '',
        skuImagePath: sku.imagePath,
        aiConfigOverrides: aiConfig,
      })

      if (result.success && result.data?.nameEn) {
        const st2 = useSorterStore.getState()
        const targetIdx = st2.skuList.findIndex(
          (s) => s.skuCode === targetCode || s.colorName === targetCode
        )
        if (targetIdx !== -1) {
          st2.updateSkuItem(targetIdx, { skuNameEn: truncateSkuNameEn(result.data.nameEn) })
        }
      }
    } catch (err) {
      console.error('[SKU Translate] 异常:', err)
    } finally {
      setTranslatingSkuCode(null)
    }
  }

  // v4.5 批量 SKU 翻译
  const handleTranslateAllSkus = async (): Promise<void> => {
    if (!window.electronAPI) return
    const st = useSorterStore.getState()
    const needTranslate = st.skuList
      .map((sku, i) => ({ sku, i }))
      .filter(({ sku }) => !sku.skuNameEn && sku.colorName)

    if (needTranslate.length === 0) return

    setBatchTranslating(true)
    try {
      const result = await window.electronAPI.callTranslateSkuBatch({
        skuList: needTranslate.map(({ sku }) => ({
          id: sku.skuCode || sku.colorName,
          skuName: sku.colorName,
          skuFileName: sku.imagePath?.replace(/^.*[\\/]/, '') || '',
          skuImagePath: sku.imagePath,
        })),
        title: productInfo.title,
        category: currentSpu?.categoryCode || '',
        aiConfigOverrides: aiConfig,
      })

      if (result.success && result.data?.results) {
        const st2 = useSorterStore.getState()
        for (const r of result.data.results) {
          if (!r.nameEn) continue
          const targetIdx = st2.skuList.findIndex(
            (s) => s.skuCode === r.id || s.colorName === r.id
          )
          if (targetIdx !== -1) {
            st2.updateSkuItem(targetIdx, { skuNameEn: truncateSkuNameEn(r.nameEn) })
          }
        }
      }
    } catch (err) {
      console.error('[Batch Translate] 异常:', err)
    } finally {
      setBatchTranslating(false)
    }
  }

  // 保存新预设
  const handleSavePreset = async (): Promise<void> => {
    const st = useSorterStore.getState()
    const spu = st.currentSpu
    if (!spu) return
    const name = window.prompt('请输入新纸箱预设名称（如：13号加厚3层）：')
    if (!name?.trim()) return
    try {
      const result = await window.api.db.savePackagingPreset({
        name: name.trim(),
        length: spu.outerPackLength,
        width: spu.outerPackWidth,
        height: spu.outerPackHeight,
        weight: spu.outerPackWeight,
      })
      if (result.success) {
        const refreshed = await window.api.db.getPackagingPresets()
        if (refreshed.success && refreshed.data) {
          setPresets(refreshed.data)
        }
      }
    } catch {
      // 数据库不可用时静默
    }
  }

  // SKU图片路径解析
  const getSkuImageSrc = (sku: { imagePath: string; previewUrl?: string }): string => {
    if (
      sku.previewUrl &&
      (sku.previewUrl.startsWith('blob:') || sku.previewUrl.startsWith('data:') || sku.previewUrl.startsWith('http'))
    ) {
      return sku.previewUrl
    }
    if (sku.imagePath) {
      if (sku.imagePath.startsWith('file://') || sku.imagePath.startsWith('blob:')) {
        return sku.imagePath
      }
      const normalizedPath = sku.imagePath.replace(/\\/g, '/')
      return `file:///${normalizedPath}`.replace(/file:\/\/\/\//g, 'file:///')
    }
    return ''
  }

  // 确认提交
  const handleSubmit = async (): Promise<void> => {
    const st = useSorterStore.getState()
    const spu = st.currentSpu
    const list = st.skuList

    if (!productInfo.title.trim()) {
      setValidationError('请填写产品标题')
      return
    }
    if (!spu?.categoryCode) {
      setValidationError('请先选择货源类目，以生成 SKU 编码')
      return
    }
    if (list.length === 0) {
      setValidationError('SKU 列表不能为空')
      return
    }
    const hasEmptySkuName = list.some((s) => !s.colorName.trim())
    if (hasEmptySkuName) {
      setValidationError('请为每个 SKU 填写名称')
      return
    }
    const hasEmptySkuCode = list.some((s) => !s.skuCode)
    if (hasEmptySkuCode) {
      setValidationError('部分 SKU 编码未生成，请确保已选择货源类目')
      return
    }

    const allEmptySpecs = list.every(
      (s) => !s.dimensions && !s.weight && !s.costPrice && !s.sellingPrice
    )
    if (allEmptySpecs) {
      setSuccessMessage('已跳过规格与价格录入，可后续补充')
    }

    setValidationError(null)
    setSubmitLoading(true)

    try {
      if (window.electronAPI && outputFolderPath) {
        st.setLoading(true)
        try {
          const archivePayload = {
            sourceFolderPath,
            outputFolderPath,
            images: st.images,
            productInfo: st.productInfo,
            shortTitle: st.shortTitle,
            skuList: st.skuList,
            shopeeInfo: st.shopeeInfo,
            outerPackaging: {
              length: spu?.outerPackLength ?? 0,
              width: spu?.outerPackWidth ?? 0,
              height: spu?.outerPackHeight ?? 0,
              weight: spu?.outerPackWeight ?? 0,
              presetName:
                packagingPresets.find((p) => p.id === selectedPresetId)?.name || '',
            },
          }
          const orgResult = await window.electronAPI.organizeFiles(archivePayload)
          if (!orgResult.success) {
            console.warn('物理归档警告:', orgResult.error)
          }
        } finally {
          st.setLoading(false)
        }
      }

      setSuccessMessage('分拣成功，数据已整理完成！')
      setTimeout(() => {
        setSuccessMessage(null)
        setStep('preview')
      }, 1200)
    } catch (e) {
      setValidationError(`提交失败: ${(e as Error).message}`)
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <BasicInfoSection
          productInfo={productInfo}
          shortTitle={shortTitle}
          productCode={productCode}
          currentSpu={currentSpu}
          aiLoading={aiLoading}
          aiError={aiError}
          categoryOptions={CATEGORY_OPTIONS}
          onSetProductInfo={setProductInfo}
          onSetShortTitle={setShortTitle}
          onSetProductCode={setProductCode}
          onUpdateSpu={updateSpu}
          onAiFill={handleAiFill}
        />

        <ShopeeInfoSection
          shopeeInfo={shopeeInfo}
          onSetShopeeInfo={setShopeeInfo}
          onSetAttributes={setShopeeAttributes}
        />

        <SkuTableSection
          skuList={skuList}
          batchLength={batchLength}
          batchWidth={batchWidth}
          batchHeight={batchHeight}
          batchWeight={batchWeight}
          batchCost={batchCost}
          batchSelling={batchSelling}
          batchStock={batchStock}
          onBatchLengthChange={setBatchLength}
          onBatchWidthChange={setBatchWidth}
          onBatchHeightChange={setBatchHeight}
          onBatchWeightChange={setBatchWeight}
          onBatchCostChange={setBatchCost}
          onBatchSellingChange={setBatchSelling}
          onBatchStockChange={setBatchStock}
          onBatchFill={handleBatchFill}
          onUpdateSkuItem={updateSkuItem}
          onCopyPreviousSku={handleCopyPreviousSku}
          onAiTranslateSku={handleTranslateSku}
          translatingSkuCode={translatingSkuCode}
          batchTranslating={batchTranslating}
          onAiTranslateAll={handleTranslateAllSkus}
          getSkuImageSrc={getSkuImageSrc}
        />

        <PackagingSection
          packagingPresets={packagingPresets}
          currentSpu={currentSpu}
          onPresetSelect={handlePresetSelect}
          onSavePreset={handleSavePreset}
          onUpdateSpu={updateSpu}
        />

        {/* 底部导航 */}
        {validationError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {validationError}
          </div>
        )}
        {successMessage && (
          <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-600">
            {successMessage}
          </div>
        )}
        <div className="flex items-center justify-between pt-2 pb-8">
          <button
            onClick={() => setStep('labeling')}
            className="px-5 py-2.5 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                       rounded-md text-sm font-medium hover:bg-gray-50 transition-colors duration-150"
          >
            ← 上一步：图片标注
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitLoading}
            className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                       hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-150 flex items-center gap-2"
          >
            {submitLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                正在提交...
              </>
            ) : (
              '确认分拣 / 物理归档 →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
