import { useState, useEffect, useCallback } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import {
  CATEGORY_CODE_MAP,
  STYLE_CODE_MAP,
  STYLE_KEYWORD_MAP,
  INVALID_FILENAME_BLACKLIST,
  MEANINGLESS_NAME_REGEX,
  DEFAULT_SHOPEE_VALUES,
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

// 图片压缩
async function compressImageBase64(
  base64Str: string,
  maxWidth = 512,
  maxHeight = 512,
  quality = 0.65
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = base64Str
    img.onload = () => {
      let width = img.width
      let height = img.height
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        } else {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(base64Str)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(base64Str)
  })
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
  const [shopeeAiLoading, setShopeeAiLoading] = useState(false)
  const [shopeeAiError, setShopeeAiError] = useState<string | null>(null)
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

    const initialSkuList = skuImages.map((img) => {
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

    setSkuList(initialSkuList)
  }, [images])

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
      const readB64 = async (imgPath: string): Promise<string> => {
        if (!window.electronAPI) return ''
        const raw = `data:image/jpeg;base64,${await window.electronAPI.readFileBase64(imgPath)}`
        return compressImageBase64(raw)
      }

      const st = useSorterStore.getState()
      const list = st.skuList

      const mainTasks = mainImages.map((img) => ({
        type: 'main' as const,
        safeKey: img.originalPath.replace(/\\/g, '/'),
        readPath: img.originalPath,
      }))

      const skuTasks = list
        .map((sku, i) => ({
          type: 'sku' as const,
          index: i,
          readPath: sku.imagePath,
          needImage: sku.needAiName === true,
        }))
        .filter((t) => t.needImage)

      setSuccessMessage('正在并发读取全部图片（主图 + SKU图）...')

      const allReadResults = await Promise.all([
        ...mainTasks.map(async (t) => {
          const b64 = await readB64(t.readPath).catch(() => '')
          return { type: 'main' as const, safeKey: t.safeKey, b64 }
        }),
        ...skuTasks.map(async (t) => {
          const b64 = await readB64(t.readPath).catch(() => '')
          return { type: 'sku' as const, index: t.index, b64 }
        }),
      ])

      const mainB64List: string[] = []
      for (const t of mainTasks) {
        const result = allReadResults.find(
          (r) => r.type === 'main' && r.safeKey === t.safeKey
        )
        mainB64List.push(result?.b64 || '')
      }

      const skuB64ByIndex = new Map<number, string>()
      for (const r of allReadResults) {
        if (r.type === 'sku') skuB64ByIndex.set(r.index, r.b64)
      }

      setSuccessMessage('图片读取完成，正在调用 AI 识别...')

      const skuBase64List: string[] = []
      const skuIds: string[] = []
      const existingNames: string[] = []

      for (let i = 0; i < list.length; i++) {
        const s = list[i]
        const safeId = (s.imagePath || `sku-${i}`).replace(/\\/g, '/')
        skuIds.push(safeId)
        if (s.needAiName) {
          skuBase64List.push(skuB64ByIndex.get(i) || '')
          existingNames.push('')
        } else {
          skuBase64List.push('')
          existingNames.push(s.colorName)
        }
      }

      const infoResult = await window.electronAPI.callAiVision({
        mainBase64List: mainB64List,
        skuBase64List,
        skuIds,
        existingNames,
        aiConfig,
      })

      if (!infoResult.success) {
        setAiError(infoResult.error || 'AI 分析失败')
        setAiLoading(false)
        setSuccessMessage(null)
        return
      }

      setSuccessMessage('正在填写表单...')

      const infoData = infoResult.data as {
        title?: string
        shortTitle?: string
        category?: string
        description?: string
        skus?: Array<{ skuId: string; skuName: string }>
      }

      if (infoData.title) setProductInfo({ title: infoData.title })
      if (infoData.description) setProductInfo({ description: infoData.description })

      if (infoData.shortTitle) {
        setShortTitle(infoData.shortTitle)
        const s2 = useSorterStore.getState()
        const code = generateProductCode(infoData.shortTitle, s2.productCounter)
        setProductCode(code)
        setProductInfo({ productNo: code })
        incrementCounter()
      }

      if (infoData.category) {
        const catCode = getCategoryCode(infoData.category)
        updateSpu({ categoryCode: catCode, spuName: infoData.title || '' })
      }

      let skuSucceeded = 0
      if (infoData.skus && Array.isArray(infoData.skus)) {
        const s3 = useSorterStore.getState()
        for (const aiSku of infoData.skus) {
          if (!aiSku.skuId || !aiSku.skuName) continue
          const targetIndex = s3.skuList.findIndex(
            (s) => s.imagePath.replace(/\\/g, '/') === aiSku.skuId
          )
          if (targetIndex !== -1) {
            s3.updateSkuItem(targetIndex, { colorName: aiSku.skuName, needAiName: false })
            skuSucceeded++
          }
        }
      }

      const needAiCount = list.filter((s) => s.needAiName).length
      const skuFailed = needAiCount - skuSucceeded
      if (skuFailed > 0 && needAiCount > 0) {
        setAiError(`${skuSucceeded} 个 SKU 名称识别成功，${skuFailed} 个失败（可手动填写）`)
      }

      setSuccessMessage(null)
    } catch (e) {
      setAiError(`AI 调用异常：${(e as Error).message}`)
      setSuccessMessage(null)
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

  // v4 Shopee AI 英文生成
  const handleShopeeAiGenerate = async (): Promise<void> => {
    if (!window.electronAPI) {
      setShopeeAiError('AI 功能仅在桌面端可用')
      return
    }

    const st = useSorterStore.getState()
    const list = st.skuList

    if (list.length === 0) {
      setShopeeAiError('请先在图片标注步骤中标记 SKU 图')
      return
    }

    setShopeeAiLoading(true)
    setShopeeAiError(null)

    try {
      const mainImages = images.filter((img) => img.labels.includes('主图'))
      const mainImagePath = mainImages.length > 0 ? mainImages[0].originalPath : undefined

      const skuNames = list.map((sku) => sku.colorName)

      const result = await window.electronAPI.callShopeeEnglish({
        chineseTitle: productInfo.title,
        chineseDescription: productInfo.description,
        category: st.currentSpu?.categoryCode || '',
        skuNames,
        mainImagePath,
        aiConfigOverrides: aiConfig,
      })

      if (!result.success) {
        setShopeeAiError(result.error?.message || 'AI 生成失败')
        return
      }

      const { title, descriptionText, material, skuNamesEn } = result.data!

      // 回填 ShopeeInfo
      setShopeeInfo({ title, descriptionText, leadTime: DEFAULT_SHOPEE_VALUES.leadTime })
      setShopeeAttributes({ material })

      // 回填每个 SKU 的英文名
      skuNamesEn.forEach((nameEn, i) => {
        if (nameEn && i < list.length) {
          const st2 = useSorterStore.getState()
          st2.updateSkuItem(i, { skuNameEn: nameEn })
        }
      })
    } catch (e) {
      setShopeeAiError(`AI 调用异常: ${(e as Error).message}`)
    } finally {
      setShopeeAiLoading(false)
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
          aiLoading={shopeeAiLoading}
          onSetShopeeInfo={setShopeeInfo}
          onSetAttributes={setShopeeAttributes}
          onAiGenerate={handleShopeeAiGenerate}
        />

        {shopeeAiError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {shopeeAiError}
          </div>
        )}

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
