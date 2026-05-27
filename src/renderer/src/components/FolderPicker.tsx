import { useState } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import { useFileSystem } from '../hooks/useFileSystem'

export function FolderPicker(): JSX.Element {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    sourceFolderPath,
    outputFolderPath,
    setSourceFolderPath,
    setOutputFolderPath,
    setImages,
    setStep,
  } = useSorterStore()

  const { selectDirectory, scanFolder } = useFileSystem()

  const handleSelectSource = async (): Promise<void> => {
    const directoryPath = await selectDirectory()
    if (directoryPath) setSourceFolderPath(directoryPath)
  }

  const handleSelectOutput = async (): Promise<void> => {
    const directoryPath = await selectDirectory()
    if (directoryPath) setOutputFolderPath(directoryPath)
  }

  // 下一步：扫描图片并进入标注
  const handleNext = async (): Promise<void> => {
    if (!sourceFolderPath || !outputFolderPath) return

    setIsLoading(true)
    setError(null)
    try {
      console.log('[排查] 开始扫描文件夹:', sourceFolderPath)
      const result = await scanFolder(sourceFolderPath)
      if (!result.success) {
        setError(result.error || '扫描失败')
        return
      }
      if (!result.images?.length) {
        setError('该文件夹中没有找到图片文件（支持 jpg/png/webp/gif/bmp/tiff）')
        return
      }
      console.log('[排查] 扫描完成，图片数量:', result.images.length)
      setImages(result.images)
      console.log('[排查] setImages 后，当前 store images 数量:',
        useSorterStore.getState().images.length)
      setStep('labeling')
    } catch (e) {
      setError(`发生错误：${(e as Error).message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const canProceed = !!sourceFolderPath && !!outputFolderPath

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-1">
            选择文件夹
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            选择包含产品图片的源文件夹，以及素材包的输出位置
          </p>
        </div>

        {/* 源文件夹 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            产品图片文件夹
            <span className="text-[var(--color-danger)] ml-1">*</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-white border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-secondary)] truncate">
              {sourceFolderPath || '未选择'}
            </div>
            <button
              onClick={handleSelectSource}
              className="px-4 py-2 bg-white border border-[var(--color-border)] rounded-md text-sm
                         text-[var(--color-text-primary)] hover:bg-gray-50 active:bg-gray-100
                         transition-colors duration-150 whitespace-nowrap"
            >
              浏览
            </button>
          </div>
        </div>

        {/* 输出文件夹 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            素材包输出位置
            <span className="text-[var(--color-danger)] ml-1">*</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-white border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-secondary)] truncate">
              {outputFolderPath || '未选择'}
            </div>
            <button
              onClick={handleSelectOutput}
              className="px-4 py-2 bg-white border border-[var(--color-border)] rounded-md text-sm
                         text-[var(--color-text-primary)] hover:bg-gray-50 active:bg-gray-100
                         transition-colors duration-150 whitespace-nowrap"
            >
              浏览
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 下一步按钮 */}
        <button
          onClick={handleNext}
          disabled={!canProceed || isLoading}
          className="w-full py-2.5 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                     hover:bg-[var(--color-primary-hover)] active:scale-[0.99]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-150"
        >
          {isLoading ? '正在读取并生成缩略图...' : '下一步：图片标注'}
        </button>
      </div>
    </div>
  )
}
