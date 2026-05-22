import { useSorterStore } from '../store/useSorterStore'
import type { ImageLabel } from '../../shared/types'

// 标签配置：值 → 颜色、背景、描述
const LABELS: Array<{ value: ImageLabel; color: string; bg: string; desc: string }> = [
  { value: '主图',   color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200',   desc: '产品展示主图' },
  { value: 'SKU图',  color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', desc: '规格区分图' },
  { value: '详情图', color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  desc: '详情描述图' },
  { value: '尺寸图', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', desc: '尺寸数据图' },
  { value: '证书',   color: 'text-red-700',    bg: 'bg-red-50 border-red-200',    desc: '产品资质证书' },
  { value: '未分类', color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',  desc: '跳过不处理' },
]

export function LabelToolbar(): JSX.Element {
  const {
    activeLabel,
    setActiveLabel,
    selectedImageIds,
    setMultipleLabels,
    clearSelection,
  } = useSorterStore()

  // 应用标注
  const handleApply = (): void => {
    if (selectedImageIds.length === 0) return
    setMultipleLabels(selectedImageIds, activeLabel)
    clearSelection()
  }

  return (
    <div className="bg-white border-b border-[var(--color-border)] px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-[var(--color-text-secondary)] shrink-0">标注类型：</span>
        {/* 标签胶囊按钮 */}
        <div className="flex gap-1.5 flex-wrap">
          {LABELS.map((label) => (
            <button
              key={label.value}
              onClick={() => setActiveLabel(label.value)}
              className={`
                px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150
                ${activeLabel === label.value
                  ? `${label.bg} ${label.color} ring-2 ring-offset-1 ring-current`
                  : 'bg-white border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-gray-50'
                }
              `}
              title={label.desc}
            >
              {label.value}
            </button>
          ))}
        </div>

        {/* 选中数量 + 操作按钮 */}
        {selectedImageIds.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-[var(--color-text-secondary)]">
              已选 <b className="text-[var(--color-text-primary)]">{selectedImageIds.length}</b> 张
            </span>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 bg-[var(--color-primary)] text-white rounded-md text-xs font-medium
                         hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
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
          </div>
        )}
      </div>
    </div>
  )
}
