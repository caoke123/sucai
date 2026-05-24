import { useState, useEffect, useCallback } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import {
  CATEGORY_CODE_MAP,
  STYLE_CODE_MAP,
  STYLE_KEYWORD_MAP,
  INVALID_FILENAME_BLACKLIST,
  MEANINGLESS_NAME_REGEX,
  DEFAULT_AI_CONFIG,
} from '../../../shared/constants'

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

// 根据类目名称或编码获取编码
const getCategoryCode = (categoryNameOrCode: string): string => {
  const codes = Object.values(CATEGORY_CODE_MAP)
  if (codes.includes(categoryNameOrCode)) return categoryNameOrCode
  return CATEGORY_CODE_MAP[categoryNameOrCode] || 'XX'
}

// 常用中文字符 → 拼音首字母映射
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

// 将中文短标题转换为拼音首字母（英文保留原样，中文取首字母）
function toPinyinInitials(text: string): string {
  let result = ''
  for (const char of text) {
    if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toUpperCase()
    } else if (PINYIN_INITIALS[char]) {
      result += PINYIN_INITIALS[char]
    }
    // 其他字符跳过
  }
  return result
}

// 生成产品主编号：拼音首字母大写前缀（≤4位）+ 5位零填充计数器
function generateProductCode(shortTitle: string, counter: number): string {
  const initials = toPinyinInitials(shortTitle).slice(0, 4)
  const numStr = String(counter).padStart(5, '0')
  return `${initials}${numStr}`
}

// 无效名称黑名单（社交/截图/AI生成/临时文件等）
function isInvalidFilename(name: string): boolean {
  if (!name) return true
  const lower = name.toLowerCase()

  // 纯数字 / 纯数字+下划线+减号（时间戳等）
  if (/^[\d_-]+$/.test(lower)) return true

  return INVALID_FILENAME_BLACKLIST.some((kw) => lower.includes(kw.toLowerCase()))
}

// 判断文件名是否无意义（纯数字/相机默认/随机哈希等）
function isMeaninglessName(fileName: string): boolean {
  if (!fileName) return true
  const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName

  return MEANINGLESS_NAME_REGEX.some((regex) => regex.test(nameWithoutExt))
}

// 从文件名智能提取 SKU 规格名（有意义文件名 → 净化后返回，无意义 → null）
function extractSkuFromFilename(filename: string): string | null {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')

  // 原始文件名黑名单过滤
  if (isInvalidFilename(nameWithoutExt)) return null
  if (isMeaninglessName(filename)) return null

  // 有意义文件名：净化尾部数字、下划线、括号
  const cleaned = nameWithoutExt
    .replace(/[_\-\s]*\d+$/, '')
    .replace(/\(\d+\)$/, '')
    .replace(/（\d+）$/, '')
    .replace(/[_\-\s]+$/, '')
    .replace(/\s+/g, '')
    .trim()

  if (!cleaned || cleaned.length < 1) return null
  // 净化后再次校验
  if (isInvalidFilename(cleaned)) return null
  return cleaned
}

// ==================== 图片压缩工具 ====================

/**
 * 将 Base64 图片等比缩放 + JPEG 压缩，确保体积在几百 KB 以内
 */
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
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality)
      resolve(compressedBase64)
    }
    img.onerror = () => {
      resolve(base64Str)
    }
  })
}

// ==================== 组件 ====================

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
    setProductInfo,
    setShortTitle,
    setProductCode,
    incrementCounter,
    updateSkuInfo,
    setSkuList,
    updateSkuItem,
    updateSpu,
    setPresets,
    setStep,
  } = useSorterStore()

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
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

  // ==================== 组件加载：拉取纸箱预设 ====================
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

  // ==================== 标注图片 → SKU 列表自动同步（文件名优先） ====================
  useEffect(() => {
    const st = useSorterStore.getState()
    if (st.skuList.length > 0) return
    if (images.length === 0) return

    const skuImages = images.filter((img) => img.labels.includes('SKU图'))
    if (skuImages.length === 0) return

    const initialSkuList = skuImages.map((img) => {
      // 优先读取文件名提取颜色名
      const filenameColor = extractSkuFromFilename(img.fileName)
      // 若图片已有 skuSpec（标注阶段手动或 AI 识别填入），最高优先级
      const colorName = img.skuSpec || filenameColor || ''
      const needAiName = !colorName

      return {
        skuCode: '',
        colorName,
        dimensions: img.size || '',
        weight: img.weight ? Number(img.weight) : 0,
        costPrice: 0,
        sellingPrice: 0,
        imagePath: img.originalPath,
        previewUrl: img.thumbnailDataUrl,
        needAiName,
      }
    })

    setSkuList(initialSkuList)
  }, [images])

  // ==================== 类目/SKU颜色变更 → 重新计算所有 SKU 编码 ====================
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

  // ==================== AI 一键智能填表（单阶段：主图+SKU → 全部信息） ====================
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

      // 准备主图任务
      const mainTasks = mainImages.map((img) => ({
        type: 'main' as const,
        safeKey: img.originalPath.replace(/\\/g, '/'),
        readPath: img.originalPath,
      }))

      // 准备 SKU 任务（仅 needAiName=true 的需要读图）
      const skuTasks = list
        .map((sku, i) => ({
          type: 'sku' as const,
          index: i,
          readPath: sku.imagePath,
          needImage: sku.needAiName === true,
        }))
        .filter((t) => t.needImage)

      // 一次性并发读取所有图片
      setSuccessMessage('正在并发读取全部图片（主图 + SKU图）...')
      console.log(
        `[AI填表] 并发读取：主图${mainTasks.length}张，SKU图${skuTasks.length}张，跳过${list.length - skuTasks.length}张`
      )

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

      // 构建快速索引
      const mainB64List: string[] = []
      for (const t of mainTasks) {
        const result = allReadResults.find(
          (r) => r.type === 'main' && r.safeKey === t.safeKey
        )
        mainB64List.push(result?.b64 || '')
      }

      const skuB64ByIndex = new Map<number, string>()
      for (const r of allReadResults) {
        if (r.type === 'sku') {
          skuB64ByIndex.set(r.index, r.b64)
        }
      }

      // 构造 AI payload
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

      console.log(
        `[AI填表] payload 图片总数：${mainB64List.length + skuBase64List.filter(Boolean).length}张`
      )

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

      // 回填表单
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

      const needAiCount = list.filter((s) => s.needAiName).length
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

  // ==================== 批量填充（操作 skuList） ====================
  const handleBatchFill = (): void => {
    const parts = [batchLength, batchWidth, batchHeight].filter(Boolean)
    const dimensions = parts.length === 3 ? parts.join('x') : ''
    const weight = batchWeight ? Number(batchWeight) : undefined
    const costPrice = batchCost ? Number(batchCost) : undefined
    const sellingPrice = batchSelling ? Number(batchSelling) : undefined

    if (skuList.length === 0) return

    const updatedList = skuList.map((sku) => {
      const updated = { ...sku }
      if (dimensions) updated.dimensions = dimensions
      if (weight !== undefined && !isNaN(weight)) updated.weight = weight
      if (costPrice !== undefined && !isNaN(costPrice)) updated.costPrice = costPrice
      if (sellingPrice !== undefined && !isNaN(sellingPrice)) updated.sellingPrice = sellingPrice
      return updated
    })
    setSkuList(updatedList)

    setBatchLength('')
    setBatchWidth('')
    setBatchHeight('')
    setBatchWeight('')
    setBatchCost('')
    setBatchSelling('')
  }

  // 复用上一行的尺寸/重量/价格数据
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

  // 纸箱预设选中 → 自动回填 currentSpu
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

  // 保存当前尺寸为新的纸箱预设
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
        // 刷新预设列表
        const refreshed = await window.api.db.getPackagingPresets()
        if (refreshed.success && refreshed.data) {
          setPresets(refreshed.data)
        }
      }
    } catch {
      // 数据库不可用时静默
    }
  }

  // ==================== 智能图片路径解析 ====================
  const getSkuImageSrc = (sku: { imagePath: string; previewUrl?: string }): string => {
    // 优先使用浏览器内存 Blob / Data URL（绕过 Chromium 沙箱限制）
    if (
      sku.previewUrl &&
      (sku.previewUrl.startsWith('blob:') || sku.previewUrl.startsWith('data:') || sku.previewUrl.startsWith('http'))
    ) {
      return sku.previewUrl
    }
    // 降级：物理绝对路径转 file:// 协议
    if (sku.imagePath) {
      if (sku.imagePath.startsWith('file://') || sku.imagePath.startsWith('blob:')) {
        return sku.imagePath
      }
      const normalizedPath = sku.imagePath.replace(/\\/g, '/')
      return `file:///${normalizedPath}`.replace(/file:\/\/\/\//g, 'file:///')
    }
    return ''
  }

  // ==================== 确认分拣提交（离线模式，跳过数据库写入） ====================
  const handleSubmit = async (): Promise<void> => {
    const st = useSorterStore.getState()
    const spu = st.currentSpu
    const list = st.skuList

    // 核心必填校验
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

    // 检测规格/价格是否全部为空（仅提示，不阻止提交）
    const allEmptySpecs = list.every(
      (s) => !s.dimensions && !s.weight && !s.costPrice && !s.sellingPrice
    )
    if (allEmptySpecs) {
      setSuccessMessage('已跳过规格与价格录入，可后续补充')
    }

    setValidationError(null)
    setSubmitLoading(true)

    try {
      // 物理归档：按 SKU 编码重命名图片并复制到输出目录
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
        {/* ===== 产品基础信息 ===== */}
        <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-medium text-[var(--color-text-primary)]">
              产品基础信息
            </h3>
            <button
              onClick={handleAiFill}
              disabled={aiLoading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium
                         hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 active:scale-[0.98] flex items-center gap-2"
            >
              {aiLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  正在阅读并推理中...
                </>
              ) : (
                ' AI 智能填表'
              )}
            </button>
          </div>

          {/* AI 结果摘要 / 短标题编辑 */}
          {shortTitle && (
            <div className="flex items-center gap-4 bg-purple-50 border border-purple-100 rounded-lg p-3 mb-4">
              {/* 短标题输入区域 */}
              <div className="flex items-center gap-2 flex-1">
                <span className="text-purple-700 font-medium shrink-0">短标题:</span>
                <input
                  type="text"
                  className="bg-transparent border-b border-purple-200 hover:border-purple-400 focus:border-purple-600 focus:outline-none px-1 py-0.5 text-purple-900 font-semibold w-full max-w-md transition-colors"
                  value={shortTitle}
                  onChange={(e) => setShortTitle(e.target.value)}
                  placeholder="请输入短标题（用于文件夹命名）"
                />
              </div>
              {/* 编号展示区域 */}
              <div className="text-purple-700 shrink-0">
                <span className="font-medium">编号: </span>
                <span className="font-mono font-bold bg-purple-100/50 px-2 py-0.5 rounded">{productCode}</span>
              </div>
            </div>
          )}
          {aiError && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {aiError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* 产品标题 */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                产品标题 <span className="text-[var(--color-danger)]">*</span>
              </label>
              <input
                type="text"
                value={productInfo.title}
                onChange={(e) => setProductInfo({ title: e.target.value })}
                placeholder="请输入完整的产品标题"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)]"
              />
            </div>

            {/* 产品主编号 */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                产品主编号
              </label>
              <input
                type="text"
                value={productInfo.productNo}
                onChange={(e) => setProductInfo({ productNo: e.target.value })}
                placeholder="自动生成或手动输入"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] font-mono"
              />
            </div>

            {/* 货源平台 */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                货源平台
              </label>
              <select
                value={productInfo.sourcePlatform}
                onChange={(e) => setProductInfo({ sourcePlatform: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              >
                <option value="1688">1688</option>
                <option value="淘宝">淘宝</option>
                <option value="其他">其他</option>
              </select>
            </div>

            {/* 货源链接 */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                货源链接
              </label>
              <input
                type="text"
                value={productInfo.sourceUrl}
                onChange={(e) => setProductInfo({ sourceUrl: e.target.value })}
                placeholder="https://detail.1688.com/offer/xxx.html"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)]"
              />
            </div>

            {/* 货币类型 */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                货币类型
              </label>
              <select
                value={productInfo.currency}
                onChange={(e) => setProductInfo({ currency: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              >
                <option value="CNY">CNY</option>
                <option value="USD">USD</option>
              </select>
            </div>

            {/* 货源类目（联动生成 SKU 编码） */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                货源类目
              </label>
              <select
                value={currentSpu?.categoryCode || ''}
                onChange={(e) => updateSpu({ categoryCode: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              >
                <option value="">请选择类目</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* 风格自动识别提示 */}
            <div className="flex items-center">
              <span className="text-xs text-[var(--color-text-tertiary)]">
                风格编码由 SKU 名称自动匹配（白/棕/红/彩/奶/黑/灰/混色）
              </span>
            </div>

            {/* 属性 + 描述 */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                属性
              </label>
              <input
                type="text"
                value={productInfo.attributes}
                onChange={(e) => setProductInfo({ attributes: e.target.value })}
                placeholder="品牌:VOC；货号:D001（用中文分号分隔）"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                产品描述
              </label>
              <textarea
                rows={3}
                value={productInfo.description}
                onChange={(e) => setProductInfo({ description: e.target.value })}
                placeholder="产品的详细描述文本"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] resize-none"
              />
            </div>
          </div>
        </div>

        {/* ===== SKU 规格管理 ===== */}
        <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
          <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-4">
            SKU 规格管理
          </h3>

          {/* 快速批量填充栏 */}
          <div className="mb-4 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">长 (cm)</label>
              <input
                type="text"
                value={batchLength}
                onChange={(e) => setBatchLength(e.target.value)}
                placeholder="长"
                className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">宽 (cm)</label>
              <input
                type="text"
                value={batchWidth}
                onChange={(e) => setBatchWidth(e.target.value)}
                placeholder="宽"
                className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">高 (cm)</label>
              <input
                type="text"
                value={batchHeight}
                onChange={(e) => setBatchHeight(e.target.value)}
                placeholder="高"
                className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">重量 (g)</label>
              <input
                type="text"
                value={batchWeight}
                onChange={(e) => setBatchWeight(e.target.value)}
                placeholder="重量"
                className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">成本价 (元)</label>
              <input
                type="text"
                value={batchCost}
                onChange={(e) => setBatchCost(e.target.value)}
                placeholder="成本价"
                className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">售价 (元)</label>
              <input
                type="text"
                value={batchSelling}
                onChange={(e) => setBatchSelling(e.target.value)}
                placeholder="售价"
                className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <button
              onClick={handleBatchFill}
              className="px-5 py-1.5 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                         hover:bg-[var(--color-primary-hover)] transition-colors duration-150 whitespace-nowrap"
            >
              批量填充
            </button>
          </div>

          {/* SKU 逐行编辑 */}
          <div className="space-y-2">
            {skuList.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--color-text-tertiary)]">
                暂无 SKU 数据，请先在「图片标注」步骤中标记 SKU 图并生成 SKU 列表
              </div>
            ) : (
              skuList.map((sku, idx) => (
                <div
                  key={sku.skuCode || `sku-${idx}`}
                  className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 bg-white border border-gray-200 rounded-md
                             hover:border-[var(--color-primary)] transition-all duration-150"
                >
                  {/* Col 1: 图片预览 */}
                  <div className="col-span-1 flex justify-center">
                    <div
                      className="w-14 h-14 rounded-md overflow-hidden bg-gray-100 border border-gray-200 shrink-0 cursor-pointer
                                 hover:scale-110 transition-transform duration-200"
                      onClick={() => sku.imagePath && window.electronAPI?.openPath(sku.imagePath)}
                      title={sku.imagePath || '暂无图片'}
                    >
                      {sku.imagePath || sku.previewUrl ? (
                        <img
                          src={getSkuImageSrc(sku)}
                          alt={sku.colorName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl">
                          🖼
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Col 2-3: SKU 编码（只读） */}
                  <div className="col-span-2">
                    <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">SKU编码</label>
                    <input
                      type="text"
                      value={sku.skuCode}
                      readOnly
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm
                                 bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>

                  {/* Col 4-5: SKU名称 */}
                  <div className="col-span-2">
                    <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">SKU名称</label>
                    <input
                      type="text"
                      value={sku.colorName}
                      onChange={(e) => updateSkuItem(idx, { colorName: e.target.value })}
                      placeholder="如 珍珠白"
                      className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                                 focus:outline-none focus:border-[var(--color-primary)]
                                 text-[var(--color-text-primary)] bg-white"
                    />
                  </div>

                  {/* Col 6-7: 尺寸 */}
                  <div className="col-span-2">
                    <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">尺寸</label>
                    <input
                      type="text"
                      value={sku.dimensions}
                      onChange={(e) => updateSkuItem(idx, { dimensions: e.target.value })}
                      placeholder="10x5x5"
                      className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                                 focus:outline-none focus:border-[var(--color-primary)]
                                 text-[var(--color-text-primary)] bg-white"
                    />
                  </div>

                  {/* Col 8: 重量(g) */}
                  <div className="col-span-1">
                    <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">重量</label>
                    <input
                      type="number"
                      value={sku.weight || ''}
                      onChange={(e) => updateSkuItem(idx, { weight: Number(e.target.value) || 0 })}
                      placeholder="g"
                      className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                                 focus:outline-none focus:border-[var(--color-primary)]
                                 text-[var(--color-text-primary)] bg-white"
                    />
                  </div>

                  {/* Col 9: 成本价(元) */}
                  <div className="col-span-1">
                    <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">成本价</label>
                    <input
                      type="number"
                      value={sku.costPrice || ''}
                      onChange={(e) => updateSkuItem(idx, { costPrice: Number(e.target.value) || 0 })}
                      placeholder="¥"
                      className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                                 focus:outline-none focus:border-[var(--color-primary)]
                                 text-[var(--color-text-primary)] bg-white"
                    />
                  </div>

                  {/* Col 10: 售价(元) */}
                  <div className="col-span-1">
                    <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">售价</label>
                    <input
                      type="number"
                      value={sku.sellingPrice || ''}
                      onChange={(e) => updateSkuItem(idx, { sellingPrice: Number(e.target.value) || 0 })}
                      placeholder="¥"
                      className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                                 focus:outline-none focus:border-[var(--color-primary)]
                                 text-[var(--color-text-primary)] bg-white"
                    />
                  </div>

                  {/* Col 11: 操作 */}
                  <div className="col-span-1 flex justify-center">
                    {idx > 0 && (
                      <button
                        onClick={() => handleCopyPreviousSku(idx)}
                        className="px-2.5 py-1.5 text-xs text-[var(--color-primary)] bg-blue-50
                                   hover:bg-blue-100 rounded border border-blue-200
                                   transition-colors duration-150 whitespace-nowrap flex items-center gap-1"
                      >
                        <span className="text-sm">🗐</span> 复用
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===== 外包装规格管理 ===== */}
        <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
          <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-4">
            📦 外包装规格管理
          </h3>

          {/* 选择箱型预设 */}
          <div className="mb-4 flex items-center gap-4">
            <div className="flex-1 max-w-md">
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">选择箱型预设</label>
              <select
                value=""
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              >
                <option value="">-- 选择预设自动填写 --</option>
                {packagingPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.length}×{p.width}×{p.height}cm, {p.weight}g)
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSavePreset}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-md text-sm
                         hover:bg-gray-50 transition-colors duration-150 whitespace-nowrap
                         flex items-center gap-1.5 self-end"
            >
              💾 保存为新纸箱预设
            </button>
          </div>

          {/* 自定义尺寸编辑 */}
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装长 (cm)</label>
              <input
                type="number"
                value={currentSpu?.outerPackLength || ''}
                onChange={(e) => updateSpu({ outerPackLength: Number(e.target.value) || 0 })}
                placeholder="长"
                className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装宽 (cm)</label>
              <input
                type="number"
                value={currentSpu?.outerPackWidth || ''}
                onChange={(e) => updateSpu({ outerPackWidth: Number(e.target.value) || 0 })}
                placeholder="宽"
                className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装高 (cm)</label>
              <input
                type="number"
                value={currentSpu?.outerPackHeight || ''}
                onChange={(e) => updateSpu({ outerPackHeight: Number(e.target.value) || 0 })}
                placeholder="高"
                className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装重量 (g)</label>
              <input
                type="number"
                value={currentSpu?.outerPackWeight || ''}
                onChange={(e) => updateSpu({ outerPackWeight: Number(e.target.value) || 0 })}
                placeholder="重量"
                className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                           focus:outline-none focus:border-[var(--color-primary)]
                           text-[var(--color-text-primary)] bg-white"
              />
            </div>
          </div>
        </div>

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
