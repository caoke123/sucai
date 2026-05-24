import { useState } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import type { ImageLabel } from '@shared/types'

// 标签配置：值 → 颜色、背景、描述
const LABELS: Array<{ value: ImageLabel; color: string; bg: string; activeBg: string; desc: string }> = [
  { value: '主图',   color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200',   activeBg: 'bg-blue-500 text-white', desc: '产品展示主图' },
  { value: 'SKU图',  color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', activeBg: 'bg-purple-500 text-white', desc: '规格区分图' },
  { value: '详情图', color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  activeBg: 'bg-green-500 text-white', desc: '详情描述图' },
  { value: '尺寸图', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', activeBg: 'bg-orange-500 text-white', desc: '尺寸数据图' },
  { value: '证书',   color: 'text-red-700',    bg: 'bg-red-50 border-red-200',    activeBg: 'bg-red-500 text-white', desc: '产品资质证书' },
  { value: '未分类', color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',  activeBg: 'bg-gray-500 text-white', desc: '跳过不处理' },
]

export function LabelToolbar(): JSX.Element {
  const {
    selectedImageIds,
    setMultipleLabels,
    clearSelection,
  } = useSorterStore()

  // 多标签激活列表
  const [activeLabels, setActiveLabels] = useState<ImageLabel[]>([])

  // 切换标签选中状态
  const toggleLabel = (label: ImageLabel): void => {
    setActiveLabels((prev) =>
      prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label]
    )
  }

  // 清除已选标签
  const clearActiveLabels = (): void => {
    setActiveLabels([])
  }

  // 应用多标签标注到选中的图片
  const handleApply = (): void => {
    if (selectedImageIds.length === 0 || activeLabels.length === 0) return
    setMultipleLabels(selectedImageIds, activeLabels)
    clearSelection()
    clearActiveLabels()
  }

  return (
    <div className="bg-white border-b border-[var(--color-border)] px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-[var(--color-text-secondary)] shrink-0">标注类型：</span>

        {/* 标签胶囊按钮 — 多选 toggle */}
        <div className="flex gap-1.5 flex-wrap">
          {LABELS.map((label) => {
            const isActive = activeLabels.includes(label.value)
            return (
              <button
                key={label.value}
                onClick={() => toggleLabel(label.value)}
                className={`
                  px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150
                  ${isActive
                    ? `${label.activeBg} border-transparent ring-1 ring-offset-1 ring-current`
                    : `bg-white border-[var(--color-border)] ${label.color} hover:bg-gray-50`
                  }
                `}
                title={label.desc}
              >
                {label.value}
              </button>
            )
          })}
        </div>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-2 ml-auto">
          {/* 已选标签数量提示 */}
          {activeLabels.length === 0 ? (
            <span className="text-sm text-gray-400">请选择标注类型</span>
          ) : (
            <span className="text-sm text-blue-600">
              已选 <b>{activeLabels.length}</b> 个类型
            </span>
          )}

          {/* 清除标签选择 */}
          {activeLabels.length > 0 && (
            <button
              onClick={clearActiveLabels}
              className="px-3 py-1.5 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                         rounded-md text-xs hover:bg-gray-50 transition-colors duration-150"
            >
              清除选择
            </button>
          )}

          {/* 选中图片数量 + 应用标注按钮 */}
          {selectedImageIds.length > 0 && (
            <>
              <span className="w-px h-5 bg-gray-200" />
              <span className="text-sm text-[var(--color-text-secondary)]">
                已选图片 <b className="text-[var(--color-text-primary)]">{selectedImageIds.length}</b> 张
              </span>
              <button
                onClick={handleApply}
                disabled={activeLabels.length === 0}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors duration-150
                  ${activeLabels.length > 0
                    ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
              >
                应用标注 →
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                           rounded-md text-xs hover:bg-gray-50 transition-colors duration-150"
              >
                取消选择
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
