import { useSorterStore } from '../store/useSorterStore'
import { FolderPicker } from './FolderPicker'
import { ImageGrid } from './ImageGrid'
import { ProductForm } from './ProductForm'
import { CompressStep } from './CompressStep'
import { PreviewPanel } from './PreviewPanel'
import { OutputResult } from './OutputResult'

const STEPS = [
  { key: 'folder',   label: '选择文件夹' },
  { key: 'labeling', label: '图片标注' },
  { key: 'compress', label: '图片压缩' },
  { key: 'info',     label: '产品信息' },
  { key: 'preview',  label: '确认输出' },
  { key: 'done',     label: '完成' },
] as const

export function ProductSorter(): JSX.Element {
  const currentStep = useSorterStore((s) => s.currentStep)
  const stepIndex = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-page)]">
      {/* 顶部步骤条 */}
      <div className="bg-white border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center gap-0 max-w-3xl mx-auto">
          {STEPS.map((step, index) => {
            const isCompleted = index < stepIndex
            const isActive = index === stepIndex

            return (
              <div key={step.key} className="flex items-center gap-0 flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  {/* 步骤圆圈 */}
                  <div
                    className={`
                      w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                      transition-colors duration-200 shrink-0
                      ${isCompleted
                        ? 'bg-[var(--color-primary)] text-white'
                        : isActive
                        ? 'bg-[var(--color-primary)] text-white ring-4 ring-blue-100'
                        : 'bg-[var(--color-bg-page)] text-[var(--color-text-tertiary)] border border-[var(--color-border)]'
                      }
                    `}
                  >
                    {isCompleted ? '✓' : index + 1}
                  </div>
                  {/* 步骤标签 */}
                  <span
                    className={`text-sm whitespace-nowrap ${
                      isActive
                        ? 'text-[var(--color-text-primary)] font-medium'
                        : isCompleted
                        ? 'text-[var(--color-text-secondary)]'
                        : 'text-[var(--color-text-tertiary)]'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {/* 连接线 */}
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-3 min-w-[24px] ${
                      isCompleted ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 步骤内容区域 */}
      <div className="flex-1 overflow-hidden">
        {currentStep === 'folder'   && <FolderPicker />}
        {currentStep === 'labeling' && <ImageGrid />}
        {currentStep === 'compress' && <CompressStep />}
        {currentStep === 'info'     && <ProductForm />}
        {currentStep === 'preview'  && <PreviewPanel />}
        {currentStep === 'done'     && <OutputResult />}
      </div>
    </div>
  )
}
