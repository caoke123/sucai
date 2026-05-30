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

const CATEGORY_OPTIONS = Object.entries(CATEGORY_CODE_MAP).map(([name, code]) => ({ code, name }))

const getStyleCode = (detectedStyleOrColor: string): string => {
  if (!detectedStyleOrColor) return 'MX'
  for (const [name, code] of Object.entries(STYLE_CODE_MAP)) {
    if (detectedStyleOrColor.includes(name) || name.includes(detectedStyleOrColor)) return code
  }
  for (const [key, code] of Object.entries(STYLE_KEYWORD_MAP)) {
    if (detectedStyleOrColor.toLowerCase().includes(key)) return code
  }
  return 'MX'
}

const getCategoryCode = (categoryNameOrCode: string): string => {
  const codes = Object.values(CATEGORY_CODE_MAP)
  if (codes.includes(categoryNameOrCode)) return categoryNameOrCode
  return CATEGORY_CODE_MAP[categoryNameOrCode] || 'XX'
}

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
    .replace(/[_\-\s]*\d+$/, '').replace(/\(\d+\)$/, '').replace(/（\d+）$/, '')
    .replace(/[_\-\s]+$/, '').replace(/\s+/g, '').trim()
  if (!cleaned || cleaned.length < 1) return null
  if (isInvalidFilename(cleaned)) return null
  return cleaned
}

export function ProductForm(): JSX.Element {
  const {
    productInfo,
    images,
    shortTitle,
    productCode,
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
  const [previewSpuCode, setPreviewSpuCode] = useState<string>('')

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

  // 切换产品时清理主进程图片缓存和预分析结果
  useEffect(() => {
    if (productCode) {
      window.electronAPI?.clearImageCache()
      globalThis.__aiPrefetchResult = undefined
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

  // 短标题/类目变更 → 查询预估主编码预览（不消耗序列号）
  useEffect(() => {
    if (!shortTitle || !currentSpu?.categoryCode) {
      setPreviewSpuCode('')
      return
    }
    const doPreview = async (): Promise<void> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (window as any).api
        if (!api?.db?.getSpuCodePreview) return
        const res = await api.db.getSpuCodePreview({
          categoryCode: currentSpu!.categoryCode,
          shortTitle,
        })
        if (res.success && res.data) {
          setPreviewSpuCode(res.data.spuCode)
        }
      } catch {
        setPreviewSpuCode('')
      }
    }
    doPreview()
  }, [shortTitle, currentSpu?.categoryCode])

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
        const normalizedId = String(s.skuId).replace(/\\/g, '/')
        let targetIndex = currentList.findIndex(
          (item) => item.imagePath.replace(/\\/g, '/') === normalizedId
        )
        // 兜底：按文件名匹配（模型可能改变路径格式）
        if (targetIndex === -1) {
          const fileName = normalizedId.split('/').pop()?.split('?')[0] ?? ''
          targetIndex = currentList.findIndex(
            (item) => item.imagePath.replace(/\\/g, '/').endsWith(fileName)
          )
        }
        // 末级兜底：按 SKU 数组位置匹配（模型编造了 skuId 但顺序保真）
        if (targetIndex === -1) {
          const skuArray = data.skus as Array<Record<string, unknown>>
          const posIndex = skuArray.findIndex((x) => x.skuId === s.skuId)
          if (posIndex >= 0 && posIndex < currentList.length) {
            targetIndex = posIndex
          }
        }
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

    // 消费预分析结果（Step2→Step3 后台静默获取）
    const prefetched = globalThis.__aiPrefetchResult as Record<string, unknown> | undefined
    if (prefetched) {
      globalThis.__aiPrefetchResult = undefined
      if (prefetched.title && typeof prefetched.title === 'string') setProductInfo({ title: prefetched.title })
      if (prefetched.shortTitle && typeof prefetched.shortTitle === 'string') setShortTitle(prefetched.shortTitle)
      if (prefetched.category && typeof prefetched.category === 'string') {
        const catCode = getCategoryCode(prefetched.category)
        updateSpu({ categoryCode: catCode, spuName: prefetched.category })
        setProductInfo({ category: prefetched.category })
      }
      if (prefetched.description && typeof prefetched.description === 'string') setProductInfo({ description: prefetched.description })
      if (prefetched.material && typeof prefetched.material === 'string') setProductInfo({ material: prefetched.material })
      if (prefetched.pattern && typeof prefetched.pattern === 'string') setProductInfo({ pattern: prefetched.pattern })
      if (prefetched.shopee) {
        const sh = prefetched.shopee as Record<string, unknown>
        if (sh.title && typeof sh.title === 'string') setShopeeInfo({ title: sh.title })
      }
    }

    setAiLoading(true)
    setAiError(null)
    const hasPrefetch = !!prefetched

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
        skipBasicInfo: hasPrefetch,
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

          // 提取完整 SKU 对象（含中英文名）—— 容错模式：逐字段提取，不要求固定顺序
          const skuBlockRe = /\{[^}]*"skuId"\s*:\s*"([^"]+)"[^}]*\}/g
          let match
          while ((match = skuBlockRe.exec(text)) !== null) {
            const block = match[0]
            const skuId = match[1]
            if (!this.filledSkuIds.has(skuId)) {
              const nameMatch = block.match(/"skuName"\s*:\s*"([^"]+)"/)
              const enMatch = block.match(/"skuNameEn"\s*:\s*"([^"]+)"/)
              if (!nameMatch) continue
              this.filledSkuIds.add(skuId)
              const normalizedId = skuId.replace(/\\/g, '/')
              let idx = list.findIndex((s) => s.imagePath.replace(/\\/g, '/') === normalizedId)
              // 兜底：按文件名匹配
              if (idx === -1) {
                const fileName = normalizedId.split('/').pop()?.split('?')[0] ?? ''
                idx = list.findIndex((s) => s.imagePath.replace(/\\/g, '/').endsWith(fileName))
              }
              if (idx !== -1) {
                const s3 = useSorterStore.getState()
                s3.updateSkuItem(idx, { colorName: nameMatch[1], skuNameEn: truncateSkuNameEn(enMatch?.[1] || ''), needAiName: false })
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
      setValidationError('请先确认 SKU 编码已生成')
      return
    }

    setValidationError(null)
    setSubmitLoading(true)

    try {
      // ===== Step 1: 确保 SPU 编码存在 =====
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api
      let currentSpuCode = st.productCode

      if (api?.db?.createSpu && (st.shortTitle || st.productInfo.title)) {
        // 用户手动填写了产品编号则传递 spuCode，否则由后端序列生成
        const manualCode = st.productInfo.productNo || st.productCode || undefined
        const spuRes = await api.db.createSpu({
          shortTitle: st.shortTitle,
          spuName: st.productInfo.title || st.shortTitle,
          categoryCode: spu.categoryCode,
          styleCode: spu.styleCode,
          spuCode: manualCode,
          outerPackLength: spu.outerPackLength,
          outerPackWidth: spu.outerPackWidth,
          outerPackHeight: spu.outerPackHeight,
          outerPackWeight: spu.outerPackWeight,
        })
        if (!spuRes.success || !spuRes.data) {
          throw new Error(`[SPU] ${spuRes.error ?? '编码已存在或数据库异常'}`)
        }
        currentSpuCode = spuRes.data.spuCode
        st.setProductCode(currentSpuCode)
      }

      if (!currentSpuCode) {
        currentSpuCode = st.productInfo.productNo || st.productCode
      }
      // 确保 productInfo.productNo 始终与当前 SPU 编码同步
      if (currentSpuCode) {
        st.setProductInfo({ productNo: currentSpuCode })
      }
      if (!currentSpuCode) {
        throw new Error('[SPU] 产品编码未生成，请先完成 AI 智能填表')
      }

      // ===== Step 2: 逐条写入 SKU =====
      if (api?.db?.createSku) {
        for (let skuIdx = 0; skuIdx < list.length; skuIdx++) {
          const sku = list[skuIdx]
          const skuRes = await api.db.createSku({
            spuCode: currentSpuCode,
            categoryCode: spu.categoryCode,
            colorName: sku.colorName,
            styleCode: getStyleCode(sku.colorName),
            indexInProduct: skuIdx + 1,
            dimensions: sku.dimensions || undefined,
            weight: sku.weight || undefined,
            costPrice: sku.costPrice || undefined,
            sellingPrice: sku.sellingPrice || undefined,
          })
          if (!skuRes.success) {
            throw new Error(`[SKU] ${sku.colorName}: ${skuRes.error}`)
          }
        }
      }

      // ===== Step 3: 逐条写入素材记录 =====
      if (api?.db?.recordAsset) {
        // 建立 SKU 名称 → skuCode 的映射（用于 SKU图关联）
        const skuNameToCode = new Map<string, string>()
        for (let idx = 0; idx < list.length; idx++) {
          const sku = list[idx]
          if (sku.colorName) {
            const code = [
              currentSpuCode,
              spu.categoryCode,
              getStyleCode(sku.colorName),
              String(idx + 1).padStart(4, '0'),
            ].join('-')
            skuNameToCode.set(sku.colorName, code)
          }
        }

        const assetTypeMap: Record<string, 'main_image' | 'sku_image' | 'detail_image' | 'video'> = {
          '主图': 'main_image',
          'SKU图': 'sku_image',
          '详情图': 'detail_image',
          '尺寸图': 'detail_image',
        }

        for (const image of st.images) {
          for (const label of image.labels) {
            const assetType = assetTypeMap[label]
            if (!assetType) continue

            // SKU图关联对应的 skuCode
            let associatedSkuCode: string | undefined
            if (assetType === 'sku_image' && image.skuSpec) {
              associatedSkuCode = skuNameToCode.get(image.skuSpec)
            }

            const assetRes = await api.db.recordAsset({
              spuCode: currentSpuCode,
              skuCode: associatedSkuCode,
              assetType,
              filePath: image.originalPath,
              sortOrder: image.order ?? 0,
            })
            if (!assetRes.success) {
              throw new Error(`[Asset] ${image.fileName}: ${assetRes.error}`)
            }
          }
        }
      }

      // ===== Step 4: 物理导出素材包 =====
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
            compressResults: st.compress.results,
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
          previewSpuCode={previewSpuCode}
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
