import { useSorterStore } from '../store/useSorterStore'
import type { ImageFile } from '../../shared/types'

// 标签 → 角标背景色映射
const LABEL_COLORS: Record<string, string> = {
  '主图':   'bg-blue-500',
  'SKU图':  'bg-purple-500',
  '详情图': 'bg-green-500',
  '尺寸图': 'bg-orange-500',
  '证书':   'bg-red-500',
  '未分类': 'bg-gray-400',
}

interface Props {
  image: ImageFile
}

export function ImageCard({ image }: Props): JSX.Element {
  const { selectedImageIds, toggleImageSelected, setImageLabel, removeImageLabel } = useSorterStore()
  const isSelected = selectedImageIds.includes(image.id)

  // 过滤出有效标签（排除未分类）
  const activeLabels = image.labels.filter((l) => l !== '未分类')
  const isLabeled = activeLabels.length > 0
  const isSkuImage = image.labels.includes('SKU图')

  // 处理 SKU 规格输入失焦或回车
  const handleSkuSpecConfirm = (value: string): void => {
    setImageLabel(image.id, 'SKU图', value.trim() || undefined)
  }

  return (
    <div
      onClick={() => toggleImageSelected(image.id)}
      className={`
        relative rounded-lg overflow-hidden cursor-pointer
        border-2 transition-all duration-150 select-none
        ${isSelected
          ? 'border-[var(--color-primary)] ring-2 ring-blue-200 scale-[0.97]'
          : 'border-transparent hover:border-gray-300'
        }
      `}
    >
      {/* 缩略图 */}
      <div className="aspect-square bg-gray-100">
        <img
          src={image.thumbnailDataUrl}
          alt={image.fileName}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* 左上角多标签角标 */}
      {isLabeled && (
        <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
          {activeLabels.map((label) => (
            <div
              key={label}
              className={`
                px-1.5 py-0.5 rounded text-white text-xs font-medium
                flex items-center gap-0.5
                ${LABEL_COLORS[label] || 'bg-gray-400'}
              `}
            >
              {label}
              {image.skuSpec && label === 'SKU图' && ` · ${image.skuSpec}`}
              {/* 点击叉号移除标签 */}
              <span
                className="ml-0.5 cursor-pointer opacity-70 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  removeImageLabel(image.id, label)
                }}
              >
                ×
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 右上角选中勾选框 */}
      <div
        className={`
          absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center
          transition-all duration-150
          ${isSelected
            ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
            : 'bg-white/80 border-white'
          }
        `}
      >
        {isSelected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* 底部信息区 */}
      <div className="p-1.5 bg-white">
        {/* 文件名 */}
        <p className="text-xs text-[var(--color-text-secondary)] truncate" title={image.fileName}>
          {image.fileName}
        </p>
        {/* SKU 图规格值输入框 */}
        {isSkuImage && (
          <input
            type="text"
            defaultValue={image.skuSpec || ''}
            placeholder="规格值，如 白色"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => handleSkuSpecConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSkuSpecConfirm((e.target as HTMLInputElement).value)
              }
            }}
            className="mt-1 w-full px-1.5 py-0.5 text-xs border border-[var(--color-border)] rounded
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-gray-50"
          />
        )}
      </div>
    </div>
  )
}
