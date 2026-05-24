import { useState } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import { useFileSystem } from '../hooks/useFileSystem'
import type { ImageFile, ProductOutput } from '@shared/types'

// 标签 → 文件夹名称映射
const LABEL_TO_FOLDER: Record<string, string> = {
  '主图':   '产品主图',
  'SKU图':  'SKU图',
  '详情图': '详情图',
  '尺寸图': '尺寸图表',
  '证书':   '产品证书',
}

export function PreviewPanel(): JSX.Element {
  const {
    sourceFolderPath,
    outputFolderPath,
    images,
    productInfo,
    shortTitle,
    skuList,
    currentSpu,
    packagingPresets,
    selectedPresetId,
    setOutputPath,
    setStep,
    isLoading,
    setLoading,
  } = useSorterStore()

  const { organizeFiles } = useFileSystem()
  const [error, setError] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)

  // 生成安全的文件夹名（[编号] 短标题_素材包）
  const folderBaseName = shortTitle?.trim() || productInfo.title.replace(/\s/g, '').substring(0, 10)
  const safeName = folderBaseName.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 30)
  const codePrefix = productInfo.productNo ? `[${productInfo.productNo}] ` : ''
  const packageName = `${codePrefix}${safeName}_素材包` || '未命名_素材包'

  // 按标签分组并模拟重命名（支持多标签）
  const renamedImages: Record<string, string[]> = {}
  const groupedByLabel: Record<string, ImageFile[]> = {}

  for (const img of images) {
    for (const label of img.labels) {
      if (label === '未分类') continue
      if (!groupedByLabel[label]) groupedByLabel[label] = []
      groupedByLabel[label].push(img)
    }
  }

  for (const [label, labelImages] of Object.entries(groupedByLabel)) {
    renamedImages[label] = labelImages.map((img, index) => {
      const count = index + 1
      if (label === 'SKU图' && img.skuSpec) {
        return `${img.skuSpec}_${count}${img.fileExt}`
      }
      const labelName = label.replace('图', '')
      return `${labelName}_${count}${img.fileExt}`
    })
  }

  // 构建 JSON 预览（新版格式）
  const previewJson: ProductOutput = {
    title: productInfo.title,
    productNo: productInfo.productNo,
    category: productInfo.category,
    description: productInfo.description,
    outerPackaging: {
      length: currentSpu?.outerPackLength ?? null,
      width: currentSpu?.outerPackWidth ?? null,
      height: currentSpu?.outerPackHeight ?? null,
      weight: currentSpu?.outerPackWeight ?? null,
      presetName:
        packagingPresets.find((p) => p.id === selectedPresetId)?.name || '',
    },
    skus: (skuList || []).map((sku) => ({
      skuCode: sku.skuCode,
      skuName: sku.colorName,
      size: sku.dimensions || '',
      weight: sku.weight ?? 0,
      costPrice: sku.costPrice ?? 0,
      sellingPrice: sku.sellingPrice ?? 0,
      image: sku.imagePath ? sku.imagePath.replace(/^.*[\\/]/, '') : '',
    })),
    createdAt: new Date().toISOString(),
    toolVersion: '1.2.0',
  }

  // 统计信息
  const totalImages = images.filter((i) => i.labels.some((l) => l !== '未分类')).length
  const labelStats: Record<string, number> = {}
  for (const [label] of Object.entries(renamedImages)) {
    labelStats[label] = renamedImages[label]?.length || 0
  }

  // 开始整理并导出
  const handleOrganize = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await organizeFiles({
        sourceFolderPath,
        outputFolderPath,
        images,
        productInfo,
        shortTitle,
        skuList: skuList || [],
        outerPackaging: {
          length: currentSpu?.outerPackLength ?? 0,
          width: currentSpu?.outerPackWidth ?? 0,
          height: currentSpu?.outerPackHeight ?? 0,
          weight: currentSpu?.outerPackWeight ?? 0,
          presetName:
            packagingPresets.find((p) => p.id === selectedPresetId)?.name || '',
        },
      })
      if (!result.success) {
        setError(result.error || '导出失败')
        return
      }
      setOutputPath(result.outputPath || '')
      setStep('done')
    } catch (e) {
      setError(`导出过程发生错误：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* 加载遮罩 */}
        {isLoading && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg px-8 py-6 shadow-lg text-center">
              <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[var(--color-text-primary)] font-medium">
                正在复制、重命名并写入数据，请勿关闭窗口...
              </p>
            </div>
          </div>
        )}

        {/* 错误弹窗 */}
        {error && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setError(null)}>
            <div className="bg-white rounded-lg px-6 py-5 shadow-lg max-w-md" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-md font-medium text-[var(--color-danger)] mb-2">导出失败</h4>
              <p className="text-sm text-[var(--color-text-secondary)] mb-4">{error}</p>
              <button
                onClick={() => setError(null)}
                className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md text-sm
                           hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* 左侧：目录树预览 */}
          <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
            <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-4">
              即将生成的目录结构
            </h3>
            <div className="font-mono text-sm space-y-1">
              {/* 根目录 */}
              <div className="flex items-center gap-1.5 text-[var(--color-text-primary)] font-medium">
                <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
                {packageName}/
              </div>

              {/* product.json */}
              <div className="ml-5 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/>
                </svg>
                <button
                  onClick={() => setShowJson(!showJson)}
                  className="text-blue-600 hover:underline text-sm"
                >
                  product.json {showJson ? '▲' : '▼'}
                </button>
              </div>

              {/* JSON 展开内容 */}
              {showJson && (
                <div className="ml-10 mb-2 p-3 bg-gray-50 rounded border border-[var(--color-border)] text-xs overflow-x-auto">
                  <pre className="text-[var(--color-text-secondary)] whitespace-pre">
                    {JSON.stringify(previewJson, null, 2)}
                  </pre>
                </div>
              )}

              {/* 子文件夹 */}
              {(['产品主图', 'SKU图', '详情图', '尺寸图表', '产品证书'] as const).map((folder) => {
                const labelKey = Object.entries(LABEL_TO_FOLDER).find(([, v]) => v === folder)?.[0] || ''
                const files = renamedImages[labelKey] || []
                return (
                  <div key={folder}>
                    <div className="ml-5 flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                      </svg>
                      {folder}/
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        ({files.length} 个文件)
                      </span>
                    </div>
                    {files.map((f) => (
                      <div key={f} className="ml-10 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                        <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/>
                        </svg>
                        {f}
                      </div>
                    ))}
                  </div>
                )
              })}

              {/* 产品视频（空文件夹） */}
              <div className="ml-5 flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
                <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
                产品视频/ <span className="text-xs">(空)</span>
              </div>
            </div>
          </div>

          {/* 右侧：数据摘要 */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
              <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-4">
                产品数据摘要
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">导出目标路径</span>
                  <span className="text-[var(--color-text-primary)] font-mono text-xs truncate max-w-[220px]" title={outputFolderPath}>
                    {outputFolderPath || '未设置'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">产品标题</span>
                  <span className="text-[var(--color-text-primary)] truncate max-w-[220px]" title={productInfo.title}>
                    {productInfo.title || '未填写'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">规格总数</span>
                  <span className="text-[var(--color-text-primary)]">
                    {productInfo.skuSpecs.length} 组合
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">图片总数</span>
                  <span className="text-[var(--color-text-primary)]">{totalImages} 张</span>
                </div>
                <div className="border-t border-[var(--color-border)] pt-3 space-y-1.5">
                  {Object.entries(labelStats).map(([label, count]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-[var(--color-text-tertiary)]">{label}</span>
                      <span className="text-[var(--color-text-secondary)]">{count} 张</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* JSON 预览卡片 */}
            <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
              <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
                product.json 预览
              </h4>
              <div className="bg-gray-50 rounded border border-[var(--color-border)] p-3 text-xs overflow-auto max-h-48">
                <pre className="text-[var(--color-text-secondary)] whitespace-pre">
                  {JSON.stringify(previewJson, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* 底部导航 */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <button
            onClick={() => setStep('info')}
            className="px-5 py-2.5 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                       rounded-md text-sm font-medium hover:bg-gray-50
                       transition-colors duration-150"
          >
            ← 上一步：填写信息
          </button>
          <button
            onClick={handleOrganize}
            disabled={isLoading}
            className="px-6 py-2.5 bg-[var(--color-success)] text-white rounded-md text-sm font-medium
                       hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-150"
          >
            {isLoading ? '正在导出...' : '开始整理并导出素材包 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
