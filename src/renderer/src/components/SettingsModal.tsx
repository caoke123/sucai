import { useSorterStore } from '../store/useSorterStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props): JSX.Element | null {
  const { aiConfig, setAiConfig, resetAiConfig } = useSorterStore()

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-md font-medium text-[var(--color-text-primary)]">
            AI 配置设置
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单 */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              API Key
            </label>
            <input
              type="password"
              value={aiConfig.apiKey}
              onChange={(e) => setAiConfig({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                         focus:outline-none focus:border-[var(--color-primary)]
                         text-[var(--color-text-primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={aiConfig.baseUrl}
              onChange={(e) => setAiConfig({ baseUrl: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                         focus:outline-none focus:border-[var(--color-primary)]
                         text-[var(--color-text-primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              Model ID
            </label>
            <input
              type="text"
              value={aiConfig.model}
              onChange={(e) => setAiConfig({ model: e.target.value })}
              placeholder="doubao-seed-1-6-flash-250828"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                         focus:outline-none focus:border-[var(--color-primary)]
                         text-[var(--color-text-primary)]"
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={resetAiConfig}
            className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                       rounded-md text-sm hover:bg-gray-50 transition-colors duration-150"
          >
            恢复默认配置
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                       hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
