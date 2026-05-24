import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { ImageFile, ImageLabel, ProductInfo, SkuSpecRow, SkuItem, SpuData, PackagingPreset } from '@shared/types'
import { DEFAULT_AI_CONFIG } from '@shared/constants'

type Step = 'folder' | 'labeling' | 'info' | 'preview' | 'done'

interface SorterStore {
  // 步骤控制
  currentStep: Step
  setStep: (step: Step) => void

  // 目录路径
  sourceFolderPath: string
  outputFolderPath: string
  setSourceFolderPath: (path: string) => void
  setOutputFolderPath: (path: string) => void

  // 图片列表（多标签数组）
  images: ImageFile[]
  setImages: (images: ImageFile[]) => void
  setImageLabel: (id: string, label: ImageLabel, skuSpec?: string) => void
  removeImageLabel: (id: string, label: ImageLabel) => void
  setMultipleLabels: (ids: string[], labels: ImageLabel[]) => void

  // 当前激活的标签（标注模式下）
  activeLabel: ImageLabel
  setActiveLabel: (label: ImageLabel) => void

  // 已选中待标注的图片 ID
  selectedImageIds: string[]
  toggleImageSelected: (id: string) => void
  clearSelection: () => void
  selectAll: () => void

  // AI 生成的短标题（用于文件夹命名与编号前缀）
  shortTitle: string
  setShortTitle: (title: string) => void

  // 产品主编号生成
  productCode: string
  setProductCode: (code: string) => void
  productCounter: number
  incrementCounter: () => void

  // AI 配置（豆包大模型默认参数，持久化存储）
  aiConfig: { apiKey: string; baseUrl: string; model: string }
  setAiConfig: (config: Partial<SorterStore['aiConfig']>) => void
  resetAiConfig: () => void

  // SKU 批量操作（作用于 images 中所有 SKU图 图片）
  updateSkuInfo: (id: string, fields: { skuSpec?: string; size?: string; weight?: string }) => void
  batchUpdateAllSkus: (size: string, weight: string) => void

  // 产品信息
  productInfo: ProductInfo
  setProductInfo: (info: Partial<ProductInfo>) => void
  addSkuSpec: () => void
  removeSkuSpec: (id: string) => void
  updateSkuSpec: (id: string, field: 'spec1' | 'spec2', value: string) => void
  generateSkuCombinations: () => void

  // 加载状态
  isLoading: boolean
  setLoading: (loading: boolean) => void

  // 输出结果
  outputPath: string
  setOutputPath: (path: string) => void

  // SPU 产品数据
  currentSpu: SpuData | null
  updateSpu: (data: Partial<SpuData>) => void
  clearSpu: () => void

  // SKU 列表
  skuList: SkuItem[]
  setSkuList: (list: SkuItem[]) => void
  updateSkuItem: (index: number, fields: Partial<SkuItem>) => void

  // 纸箱包装预设
  packagingPresets: PackagingPreset[]
  setPresets: (presets: PackagingPreset[]) => void
  selectedPresetId: number | null
  setSelectedPresetId: (id: number | null) => void

  // 重置所有状态
  reset: () => void

  // 仅清理当前产品数据（保留 aiConfig 和 productCounter）
  resetCurrentProduct: () => void
}

const defaultProductInfo: ProductInfo = {
  title: '',
  currency: 'CNY',
  sourceUrl: '',
  sourcePlatform: '1688',
  productNo: '',
  category: '',
  description: '',
  attributes: '',
  spec1Name: '颜色',
  spec2Name: '尺码',
  skuSpecs: [],
}

const defaultSpu: SpuData = {
  spuCode: '',
  spuName: '',
  categoryCode: '',
  styleCode: '',
  outerPackLength: 0,
  outerPackWidth: 0,
  outerPackHeight: 0,
  outerPackWeight: 0,
}

export const useSorterStore = create<SorterStore>()(
  persist(
    immer((set) => ({
      currentStep: 'folder',
      setStep: (step) =>
        set((state) => {
          state.currentStep = step
        }),

      sourceFolderPath: '',
      outputFolderPath: '',
      setSourceFolderPath: (path) =>
        set((state) => {
          state.sourceFolderPath = path
        }),
      setOutputFolderPath: (path) =>
        set((state) => {
          state.outputFolderPath = path
        }),

      images: [],
      setImages: (images) =>
        set((state) => {
          state.images = images
        }),
      setImageLabel: (id, label, skuSpec) =>
        set((state) => {
          const img = state.images.find((i) => i.id === id)
          if (!img) return
          // 更新 skuSpec
          if (skuSpec !== undefined) img.skuSpec = skuSpec
          // 如果设为未分类，清空所有标签
          if (label === '未分类') {
            img.labels = ['未分类']
            return
          }
          // 从未分类升级为实际分类时，清空未分类
          img.labels = img.labels.filter((l) => l !== '未分类')
          // 追加标签（去重）
          if (!img.labels.includes(label)) {
            img.labels.push(label)
          }
        }),
      removeImageLabel: (id, label) =>
        set((state) => {
          const img = state.images.find((i) => i.id === id)
          if (!img) return
          img.labels = img.labels.filter((l) => l !== label)
          // 如果移除后没有标签了，回退为未分类
          if (img.labels.length === 0) {
            img.labels = ['未分类']
          }
        }),
      setMultipleLabels: (ids, labels) =>
        set((state) => {
          state.images.forEach((img) => {
            if (!ids.includes(img.id)) return
            // 如果 labels 包含"未分类"，清空所有标签
            if (labels.includes('未分类')) {
              img.labels = ['未分类']
              return
            }
            // 合并：移去现有"未分类" + 追加新标签（去重）
            const merged = Array.from(
              new Set([
                ...img.labels.filter((l) => l !== '未分类'),
                ...labels,
              ])
            )
            img.labels = merged.length > 0 ? merged : ['未分类']
          })
        }),

      // AI 配置（豆包大模型默认值，开箱即用）
      aiConfig: {
        apiKey: DEFAULT_AI_CONFIG.apiKey,
        baseUrl: DEFAULT_AI_CONFIG.baseUrl,
        model: DEFAULT_AI_CONFIG.model,
      },
      setAiConfig: (config) =>
        set((state) => {
          Object.assign(state.aiConfig, config)
        }),
      resetAiConfig: () =>
        set((state) => {
          state.aiConfig = {
            apiKey: DEFAULT_AI_CONFIG.apiKey,
            baseUrl: DEFAULT_AI_CONFIG.baseUrl,
            model: DEFAULT_AI_CONFIG.model,
          }
        }),

      // 更新单张 SKU 图片的规格/尺寸/重量
      updateSkuInfo: (id, fields) =>
        set((state) => {
          const img = state.images.find((i) => i.id === id)
          if (!img) return
          if (fields.skuSpec !== undefined) img.skuSpec = fields.skuSpec
          if (fields.size !== undefined) img.size = fields.size
          if (fields.weight !== undefined) img.weight = fields.weight
        }),

      // 批量广播尺寸和重量到所有 SKU 图
      batchUpdateAllSkus: (size, weight) =>
        set((state) => {
          state.images.forEach((img) => {
            if (img.labels.includes('SKU图')) {
              img.size = size
              img.weight = weight
            }
          })
        }),

      activeLabel: '主图',
      setActiveLabel: (label) =>
        set((state) => {
          state.activeLabel = label
          state.selectedImageIds = []
        }),

      // AI 生成的短标题
      shortTitle: '',
      setShortTitle: (title) =>
        set((state) => {
          state.shortTitle = title
        }),

      // 产品主编号生成器
      productCode: '',
      setProductCode: (code) =>
        set((state) => {
          state.productCode = code
        }),
      productCounter: 1,
      incrementCounter: () =>
        set((state) => {
          state.productCounter += 1
        }),

      selectedImageIds: [],
      toggleImageSelected: (id) =>
        set((state) => {
          const index = state.selectedImageIds.indexOf(id)
          if (index !== -1) {
            state.selectedImageIds.splice(index, 1)
          } else {
            state.selectedImageIds.push(id)
          }
        }),
      clearSelection: () =>
        set((state) => {
          state.selectedImageIds = []
        }),
      selectAll: () =>
        set((state) => {
          state.selectedImageIds = state.images.map((i) => i.id)
        }),

      productInfo: { ...defaultProductInfo },
      setProductInfo: (info) =>
        set((state) => {
          Object.assign(state.productInfo, info)
        }),
      addSkuSpec: () =>
        set((state) => {
          state.productInfo.skuSpecs.push({
            id: `sku_${Date.now()}`,
            spec1: '',
            spec2: '',
          })
        }),
      removeSkuSpec: (id) =>
        set((state) => {
          state.productInfo.skuSpecs = state.productInfo.skuSpecs.filter(
            (s) => s.id !== id
          )
        }),
      updateSkuSpec: (id, field, value) =>
        set((state) => {
          const spec = state.productInfo.skuSpecs.find((s) => s.id === id)
          if (spec) spec[field] = value
        }),
      generateSkuCombinations: () =>
        set((state) => {
          // 收集所有已标注为 SKU图 且含有 skuSpec 的图片的规格值，作为 spec1 备选集
          const spec1Values = Array.from(
            new Set(
              state.images
                .filter(
                  (img) =>
                    img.labels.includes('SKU图') &&
                    img.skuSpec &&
                    img.skuSpec.trim() !== ''
                )
                .map((img) => img.skuSpec as string)
            )
          )

          // 收集当前 skuSpecs 中所有已填写的 spec2 的非空值，作为 spec2 备选集
          const spec2Values = Array.from(
            new Set(
              state.productInfo.skuSpecs
                .map((s) => s.spec2)
                .filter((v): v is string => v !== undefined && v !== null && v.trim() !== '')
            )
          )

          if (spec1Values.length === 0 || spec2Values.length === 0) return

          // 计算笛卡尔积（全排列）
          const combinations: SkuSpecRow[] = []
          for (const spec1 of spec1Values) {
            for (const spec2 of spec2Values) {
              combinations.push({
                id: `sku_${Date.now()}_${spec1}_${spec2}`,
                spec1,
                spec2,
              })
            }
          }

          state.productInfo.skuSpecs = combinations
        }),

      isLoading: false,
      setLoading: (loading) =>
        set((state) => {
          state.isLoading = loading
        }),

      outputPath: '',
      setOutputPath: (path) =>
        set((state) => {
          state.outputPath = path
        }),

      // SPU 产品数据
      currentSpu: null,
      updateSpu: (data) =>
        set((state) => {
          if (state.currentSpu) {
            Object.assign(state.currentSpu, data)
          } else {
            state.currentSpu = { ...defaultSpu, ...data } as SpuData
          }
        }),
      clearSpu: () =>
        set((state) => {
          state.currentSpu = null
        }),

      // SKU 列表
      skuList: [],
      setSkuList: (list) =>
        set((state) => {
          state.skuList = list
        }),
      updateSkuItem: (index, fields) =>
        set((state) => {
          if (index >= 0 && index < state.skuList.length) {
            Object.assign(state.skuList[index], fields)
          }
        }),

      // 纸箱包装预设
      packagingPresets: [],
      setPresets: (presets) =>
        set((state) => {
          state.packagingPresets = presets
        }),
      selectedPresetId: null,
      setSelectedPresetId: (id) =>
        set((state) => {
          state.selectedPresetId = id
        }),

      reset: () =>
        set((state) => {
          state.currentStep = 'folder'
          state.sourceFolderPath = ''
          // outputFolderPath 保留（通过 persist 持久化）
          state.images = []
          state.selectedImageIds = []
          state.activeLabel = '主图'
          state.productInfo = { ...defaultProductInfo }
          state.currentSpu = null
          state.skuList = []
          state.packagingPresets = []
          state.selectedPresetId = null
          state.outputPath = ''
          state.shortTitle = ''
        }),

      // 仅清理当前产品数据（保留 counter 和 outputFolderPath）
      resetCurrentProduct: () =>
        set((state) => {
          state.currentStep = 'folder'
          state.sourceFolderPath = ''
          state.images = []
          state.selectedImageIds = []
          state.activeLabel = '主图'
          state.productInfo = { ...defaultProductInfo }
          state.currentSpu = null
          state.skuList = []
          state.packagingPresets = []
          state.selectedPresetId = null
          state.outputPath = ''
          state.shortTitle = ''
          state.productCode = ''
          // 注意：不清空 outputFolderPath（用户偏好保留）
          // 注意：不清空 productCounter（全局编号连续性）
        }),
    })),
    {
      name: 'material-sorter-storage',
      storage: createJSONStorage(() => localStorage),
      // 持久化 outputFolderPath、productCounter 和 aiConfig
      partialize: (state) => ({
        outputFolderPath: state.outputFolderPath,
        productCounter: state.productCounter,
        aiConfig: state.aiConfig,
      }),
    }
  )
)
