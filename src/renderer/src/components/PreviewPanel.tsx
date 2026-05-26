import { useState, useMemo } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import { useFileSystem } from '../hooks/useFileSystem'
import { validateProduct } from '@shared/validation'
import type { ValidationContext } from '@shared/validation'
import type { ImageFile, ProductOutput } from '@shared/types'

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
    shopeeInfo,
    setOutputPath,
    setStep,
    isLoading,
    setLoading,
  } = useSorterStore()

  const { organizeFiles } = useFileSystem()
  const [error, setError] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)

  // 构建校验上下文
  const validationCtx: ValidationContext = useMemo(() => {
    const mainCount = images.filter((img) => img.labels.includes('主图')).length
    const skuImages = images.filter((img) => img.labels.includes('SKU图'))
    const skuCount = skuImages.length

    return {
      shopeeInfo: {
        title: shopeeInfo?.title || '',
        descriptionText: shopeeInfo?.descriptionText || '',
        attributes: { material: shopeeInfo?.attributes?.material || '' },
        minimumOrderQty: shopeeInfo?.minimumOrderQty ?? 5,
        jitInvitationCode: shopeeInfo?.jitInvitationCode || '',
      },
      skus: (skuList || []).map((sku) => ({
        skuName: sku.colorName || '',
        sellingPrice: sku.sellingPrice ?? 0,
        stock: sku.stock ?? 0,
      })),
      images: { mainCount, skuCount },
    }
  }, [images, skuList, shopeeInfo])

  // 执行校验 (memo)
  const validation = useMemo(() => validateProduct(validationCtx), [validationCtx])

  const hasErrors = useMemo(
    () => validation.issues.some((i) => i.level === 'error'),
    [validation.issues]
  )
  const hasWarnings = useMemo(
    () => validation.issues.some((i) => i.level === 'warning'),
    [validation.issues]
  )

  // 文件夹命名预览
  const folderBaseName = shortTitle?.trim() || productInfo.title.replace(/\s/g, '').substring(0, 10)
  const safeName = folderBaseName.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 30)
  const codePrefix = productInfo.productNo ? `[${productInfo.productNo}] ` : ''
  const packageName = `${codePrefix}${safeName}_素材包` || '未命名_素材包'

  // 按标签分组模拟重命名
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

  // product.json 预览 (v4.5 structure)
  const previewJson = useMemo(() => {
    const pkgName = packageName
    const pkgPath = outputFolderPath
      ? `${outputFolderPath.replace(/\\/g, '/')}/${pkgName}`
      : ''
    const now = new Date().toISOString()

    const skuOutput = (skuList || []).map((sku, i) => ({
      index: i,
      skuCode: sku.skuCode,
      nameZh: sku.colorName,
      nameEn: sku.skuNameEn || '',
      weight: sku.weight ?? 0,
      size: {
        length: 0, width: 0, height: 0,
        unit: 'cm' as const,
      },
      pricing: {
        cost: sku.costPrice ?? 0,
        selling: sku.sellingPrice ?? 0,
        currency: 'CNY' as const,
      },
      stock: sku.stock ?? 0,
      images: {
        primary: sku.imagePath
          ? {
              index: 0,
              fileName: sku.imagePath.replace(/^.*[\\/]/, ''),
              localPath: sku.imagePath,
              r2Url: '',
            }
          : null,
      },
    }))

    return {
      productNo: productInfo.productNo,
      toolVersion: '4.5.0',
      createdAt: now,
      updatedAt: now,
      internal: {
        title: productInfo.title,
        description: productInfo.description || '',
        category: productInfo.category || '',
        localPath: pkgPath,
      },
      platforms: {
        shopee: {
          title: shopeeInfo?.title || '',
          description: shopeeInfo?.descriptionText || '',
          category: [] as string[],
          attributes: {
            brand: shopeeInfo?.attributes?.brand || 'NoBrand',
            origin: shopeeInfo?.attributes?.origin || '中国大陆',
            material: shopeeInfo?.attributes?.material || '',
          },
          logistics: {
            leadTime: shopeeInfo?.leadTime ?? 5,
            minimumOrderQty: shopeeInfo?.minimumOrderQty ?? 5,
            jit: !!shopeeInfo?.jitInvitationCode,
          },
          invitation: { code: shopeeInfo?.jitInvitationCode || '' },
          status: 'draft' as const,
          publishedAt: null,
          shopeeItemId: null,
        },
      },
      skus: skuOutput,
      images: { main: [], detail: [] },
      pim: { syncedAt: null, status: 'ready' as const, notes: '' },
      r2: { basePath: '', syncedAt: '' },
    }
  }, [productInfo, skuList, shopeeInfo, packageName, outputFolderPath])

  const totalImages = images.filter((i) => i.labels.some((l) => l !== '未分类')).length

  // SKU 汇总
  const skuTotalStock = (skuList || []).reduce((sum, s) => sum + (s.stock || 0), 0)
  const skuMinPrice = skuList.length > 0 ? Math.min(...skuList.map((s) => s.sellingPrice || 0)) : 0
  const skuMaxPrice = skuList.length > 0 ? Math.max(...skuList.map((s) => s.sellingPrice || 0)) : 0

  // 导出操作
  const handleOrganize = async (): Promise<void> => {
    if (hasErrors) return
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
        shopeeInfo,
        outerPackaging: {
          length: currentSpu?.outerPackLength ?? 0,
          width: currentSpu?.outerPackWidth ?? 0,
          height: currentSpu?.outerPackHeight ?? 0,
          weight: currentSpu?.outerPackWeight ?? 0,
          presetName: packagingPresets.find((p) => p.id === selectedPresetId)?.name || '',
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

  // 点击校验项 → 返回 Step3 并定位
  const handleFixError = (): void => {
    setStep('info')
    setTimeout(() => {
      const el = document.querySelector('[data-field="shopee.title"]')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
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

        {/* ===== 校验面板 ===== */}
        {!validation.valid && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-medium text-red-700 flex items-center gap-2">
                <span className="text-lg">⚠</span>
                存在错误项，请修复后再导出
              </h3>
              <button
                onClick={handleFixError}
                className="px-4 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium
                           hover:bg-red-700 transition-colors duration-150"
              >
                返回上一步修复
              </button>
            </div>
            <div className="space-y-1.5">
              {validation.issues
                .filter((i) => i.level === 'error')
                .map((issue, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-red-600">
                    <span className="mt-0.5 shrink-0">✗</span>
                    <span>{issue.message}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {validation.valid && hasWarnings && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-md font-medium text-yellow-700 flex items-center gap-2 mb-2">
              <span className="text-lg">⚡</span>
              建议优化项
            </h3>
            <div className="space-y-1">
              {validation.issues
                .filter((i) => i.level === 'warning')
                .map((issue, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-yellow-600">
                    <span className="mt-0.5 shrink-0">!</span>
                    <span>{issue.message}</span>
                  </div>
                ))}
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
              <div className="flex items-center gap-1.5 text-[var(--color-text-primary)] font-medium">
                <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
                {packageName}/
              </div>
              <div className="ml-5 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/>
                </svg>
                <button onClick={() => setShowJson(!showJson)} className="text-blue-600 hover:underline text-sm">
                  product.json {showJson ? '▲' : '▼'}
                </button>
              </div>
              {showJson && (
                <div className="ml-10 mb-2 p-3 bg-gray-50 rounded border border-[var(--color-border)] text-xs overflow-x-auto">
                  <pre className="text-[var(--color-text-secondary)] whitespace-pre">
                    {JSON.stringify(previewJson, null, 2)}
                  </pre>
                </div>
              )}
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
                      <span className="text-xs text-[var(--color-text-tertiary)]">({files.length} 个文件)</span>
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
              <div className="ml-5 flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
                <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
                产品视频/ <span className="text-xs">(空)</span>
              </div>
            </div>
          </div>

          {/* 右侧：数据摘要 + Shopee + SKU 汇总 */}
          <div className="space-y-4">
            {/* 产品数据摘要 */}
            <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
              <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-4">产品数据摘要</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">目标路径</span>
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
                  <span className="text-[var(--color-text-secondary)]">图片总数</span>
                  <span className="text-[var(--color-text-primary)]">{totalImages} 张</span>
                </div>
              </div>
            </div>

            {/* Shopee 信息预览 */}
            <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
              <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-3">Shopee 发布信息</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs text-[var(--color-text-tertiary)]">英文标题</span>
                  <p className="text-[var(--color-text-primary)] break-words">
                    {shopeeInfo?.title || <span className="text-[var(--color-text-tertiary)] italic">未填写</span>}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-[var(--color-text-tertiary)]">英文描述</span>
                  <p className="text-[var(--color-text-secondary)] break-words line-clamp-2">
                    {shopeeInfo?.descriptionText || <span className="text-[var(--color-text-tertiary)] italic">未填写</span>}
                  </p>
                </div>
                <div className="flex gap-4 text-xs text-[var(--color-text-tertiary)]">
                  <span>品牌: {shopeeInfo?.attributes?.brand || '-'}</span>
                  <span>产地: {shopeeInfo?.attributes?.origin || '-'}</span>
                  <span>材质: {shopeeInfo?.attributes?.material || '-'}</span>
                </div>
                <div className="flex gap-4 text-xs text-[var(--color-text-tertiary)]">
                  <span>备货: {shopeeInfo?.leadTime ?? '-'}天</span>
                  <span>起订量: {shopeeInfo?.minimumOrderQty ?? '-'}件</span>
                  <span>JIT: {shopeeInfo?.jitInvitationCode || '-'}</span>
                </div>
              </div>
            </div>

            {/* Asset Manifest 预览 */}
            <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
              <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-3">
                素材资源清单 (Asset Manifest)
              </h3>
              <div className="space-y-2 text-sm">
                {Object.entries(renamedImages).length === 0 ? (
                  <p className="text-xs text-[var(--color-text-tertiary)] italic">暂无素材</p>
                ) : (
                  Object.entries(renamedImages).map(([label, files]) => {
                    const folderName = LABEL_TO_FOLDER[label] || label
                    return (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-[var(--color-text-secondary)]">{folderName}</span>
                        <span className="text-[var(--color-text-primary)] text-xs">
                          {files.length} 个文件
                          <span className="text-[var(--color-text-tertiary)] ml-1">(本地)</span>
                        </span>
                      </div>
                    )
                  })
                )}
                <div className="border-t border-[var(--color-border)] pt-2 mt-2">
                  <div className="text-xs text-[var(--color-text-tertiary)]">
                    上传 R2 后将自动填充 CDN URL
                  </div>
                </div>
              </div>
            </div>
            {skuList.length > 0 && (
              <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
                <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-3">SKU 汇总</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-secondary)]">SKU 数量</span>
                    <span className="text-[var(--color-text-primary)]">{skuList.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-secondary)]">库存总数</span>
                    <span className="text-[var(--color-text-primary)]">{skuTotalStock}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-secondary)]">售价范围</span>
                    <span className="text-[var(--color-text-primary)]">
                      ¥{skuMinPrice} ~ ¥{skuMaxPrice}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Cloud (R2) Preview */}
            <div className="bg-white rounded-lg border border-[var(--color-border)] p-5">
              <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-3">
                R2 云端同步预览
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">Metadata 版本</span>
                  <span className="text-[var(--color-primary)] font-mono text-xs">v4</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">CDN 目录</span>
                  <span className="text-[var(--color-text-primary)] font-mono text-xs truncate max-w-[180px]">
                    products/{packageName}/
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">图片分类数</span>
                  <span className="text-[var(--color-text-primary)]">
                    {Object.keys(LABEL_TO_FOLDER).length} 类
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">库存总计</span>
                  <span className="text-[var(--color-text-primary)]">{skuTotalStock}</span>
                </div>
                <div className="border-t border-[var(--color-border)] pt-2 mt-2">
                  <div className="text-xs text-[var(--color-text-tertiary)]">
                    上传后 product.json 将自动写入 r2 metadata
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部导航 */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <button
            onClick={() => setStep('info')}
            className="px-5 py-2.5 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                       rounded-md text-sm font-medium hover:bg-gray-50 transition-colors duration-150"
          >
            ← 上一步：填写信息
          </button>
          <button
            onClick={handleOrganize}
            disabled={isLoading || hasErrors}
            className="px-6 py-2.5 bg-[var(--color-success)] text-white rounded-md text-sm font-medium
                       hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-150"
            title={hasErrors ? '请先修复错误项' : '开始导出'}
          >
            {hasErrors ? '请先修复错误项' : isLoading ? '正在导出...' : '开始整理并导出素材包 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
