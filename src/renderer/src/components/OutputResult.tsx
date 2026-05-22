import { useSorterStore } from '../store/useSorterStore'
import { useFileSystem } from '../hooks/useFileSystem'

export function OutputResult(): JSX.Element {
  const { outputPath, reset } = useSorterStore()
  const { openPath } = useFileSystem()

  // 打开输出文件夹（Electron 用原生 shell.openPath，Web 通过 Agent API）
  const handleOpenFolder = async (): Promise<void> => {
    if (outputPath) {
      await openPath(outputPath)
    }
  }

  // 整理下一个产品
  const handleNextProduct = (): void => {
    reset()
  }

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* 成功图标 */}
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50">
          <svg
            className="w-10 h-10 text-[var(--color-success)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        {/* 标题 */}
        <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
          恭喜！产品素材包整理成功！
        </h2>

        {/* 路径信息 */}
        <div className="bg-gray-50 border border-[var(--color-border)] rounded-md p-4 mb-6 text-left">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">素材包路径</p>
          <p className="text-sm text-[var(--color-text-primary)] font-mono break-all leading-relaxed">
            {outputPath || '未知路径'}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="space-y-3">
          <button
            onClick={handleOpenFolder}
            className="w-full py-2.5 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                       hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          >
            打开输出文件夹
          </button>
          <button
            onClick={handleNextProduct}
            className="w-full py-2.5 border border-[var(--color-border)] text-[var(--color-text-primary)]
                       rounded-md text-sm font-medium hover:bg-gray-50
                       transition-colors duration-150"
          >
            整理下一个产品
          </button>
        </div>
      </div>
    </div>
  )
}
