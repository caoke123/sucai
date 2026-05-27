import { useState, useEffect } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import { LabelToolbar } from './LabelToolbar'
import { ImageCard } from './ImageCard'

export function ImageGrid(): JSX.Element {
  const {
    images,
    setStep,
    selectAll,
    clearSelection,
    selectedImageIds,
    sourceFolderPath,
    resetCurrentProduct,
  } = useSorterStore()

  const [showConfirm, setShowConfirm] = useState(false)

  // 缓存预热：进入图片标注页时在后台静默预压缩所有图片
  useEffect(() => {
    if (!window.electronAPI?.preheatImageCache) return
    const allPaths = images.map((img) => img.originalPath).filter(Boolean)
    if (allPaths.length === 0) return
    window.electronAPI.preheatImageCache(allPaths).catch(() => {})
  }, [images])

  const labeledCount = images.filter((i) => i.labels.some((l) => l !== '未分类')).length
  const totalCount = images.length
  const isAllSelected = selectedImageIds.length === totalCount

  // 确认返回第一步
  const handleConfirmBack = (): void => {
    resetCurrentProduct()
    setShowConfirm(false)
    // resetCurrentProduct 已将 currentStep 设为 'folder'
  }

  return (
    <div className="h-full flex flex-col">
      {/* ===== 确认弹窗 ===== */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-lg px-6 py-5 shadow-lg max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-md font-medium text-[var(--color-text-primary)] mb-2">
              确认返回？
            </h4>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5 leading-relaxed">
              返回第一步将清空当前未导出的标注数据和表单内容，确定要返回重新选择吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                           rounded-md text-sm hover:bg-gray-50 transition-colors duration-150"
              >
                取消
              </button>
              <button
                onClick={handleConfirmBack}
                className="px-4 py-2 bg-[var(--color-danger)] text-white rounded-md text-sm font-medium
                           hover:bg-red-600 transition-colors duration-150"
              >
                确定返回
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 标注工具栏 */}
      <LabelToolbar />

      {/* 顶部导航栏：文件夹路径 + 返回按钮 */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-[var(--color-border)]">
        <button
          onClick={() => setShowConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--color-border)]
                     text-[var(--color-text-secondary)] rounded-md text-xs font-medium
                     hover:bg-gray-50 hover:text-[var(--color-text-primary)]
                     transition-colors duration-150 shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回第一步（重新选择文件夹）
        </button>
        <span className="text-xs text-[var(--color-text-tertiary)] truncate flex-1 min-w-0" title={sourceFolderPath}>
          当前文件夹：{sourceFolderPath || '—'}
        </span>
      </div>

      {/* 统计栏 + 操作按钮 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--color-text-secondary)]">
            共 <b className="text-[var(--color-text-primary)]">{totalCount}</b> 张图片，
            已标注 <b className="text-[var(--color-text-primary)]">{labeledCount}</b> 张
          </span>
          <button
            onClick={isAllSelected ? clearSelection : selectAll}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            {isAllSelected ? '取消全选' : '全选'}
          </button>
        </div>
        <button
          onClick={() => setStep('info')}
          disabled={labeledCount === 0}
          className="px-4 py-1.5 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                     hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors duration-150"
        >
          下一步：填写产品信息
        </button>
      </div>

      {/* 操作提示 */}
      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
        <p className="text-xs text-blue-600">
          使用方法：先在上方选择标注类型，然后点击图片将其选中，选好后点击「应用标注」完成标记
        </p>
      </div>

      {/* 图片网格 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {images.map((image) => (
            <ImageCard key={image.id} image={image} />
          ))}
        </div>
      </div>
    </div>
  )
}
