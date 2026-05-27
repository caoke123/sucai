import { useState, useEffect, useCallback } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import type { CompressResult } from '@shared/types'

interface AnalyzeItem {
  id: string
  srcPath: string
  originalSize: number
  width: number
  height: number
  needCompress: boolean
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/* 呼吸灯微动效 */
const pulseKeyframes = `
@keyframes pulse-subtle {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { transform: scale(1.03); box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
}
`

export function CompressStep(): JSX.Element {
  const images = useSorterStore((s) => s.images)
  const setStep = useSorterStore((s) => s.setStep)
  const setCompressResults = useSorterStore((s) => s.setCompressResults)
  const compress = useSorterStore((s) => s.compress)

  const [analyzing, setAnalyzing] = useState(true)
  const [analysis, setAnalysis] = useState<AnalyzeItem[]>([])
  const [needCount, setNeedCount] = useState(0)
  const [compressing, setCompressing] = useState(false)
  const [progressItems, setProgressItems] = useState<Map<string, CompressResult>>(new Map())
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // 进入时分析
  useEffect(() => {
    if (compress.status === 'done' && compress.results && Object.keys(compress.results).length > 0) {
      setAnalyzing(false)
      return
    }

    if (!window.electronAPI) {
      setAnalyzeError('非 Electron 环境，压缩功能不可用')
      setAnalyzing(false)
      setNeedCount(0)
      return
    }

    const doAnalyze = async (): Promise<void> => {
      try {
        const items = images.map((img) => ({ id: img.id, srcPath: img.originalPath }))
        const results = await window.electronAPI.compressImagesAnalyze(items)
        setAnalysis(results)
        setNeedCount(results.filter((r) => r.needCompress).length)
      } catch (err) {
        console.error('[CompressStep] Analyze failed:', err)
        setAnalyzeError('图片分析失败，可跳过压缩直接进入下一步')
        setNeedCount(0)
      } finally {
        setAnalyzing(false)
      }
    }
    doAnalyze()
  }, [images, compress.status, compress.results])

  // 开始压缩
  const handleCompress = useCallback(async () => {
    setCompressing(true)
    const items = analysis
      .filter((a) => a.needCompress)
      .map((a) => ({ id: a.id, srcPath: a.srcPath }))

    if (items.length === 0) {
      const skipped: CompressResult[] = analysis.map((a) => ({
        id: a.id,
        srcPath: a.srcPath,
        destPath: a.srcPath,
        originalSize: a.originalSize,
        compressedSize: a.originalSize,
        width: a.width,
        height: a.height,
        skipped: true,
      }))
      setCompressResults(skipped)
      setCompressing(false)
      return
    }

    const callback = (data: { id: string; result: CompressResult }): void => {
      setProgressItems((prev) => {
        const next = new Map(prev)
        next.set(data.id, data.result)
        return next
      })
    }

    window.electronAPI.onCompressProgress(callback)

    try {
      const results = await window.electronAPI.compressImages(items)
      const fullResults: CompressResult[] = [
        ...results,
        ...analysis
          .filter((a) => !a.needCompress)
          .map((a) => ({
            id: a.id,
            srcPath: a.srcPath,
            destPath: a.srcPath,
            originalSize: a.originalSize,
            compressedSize: a.originalSize,
            width: a.width,
            height: a.height,
            skipped: true,
          })),
      ]
      setCompressResults(fullResults)
    } catch (err) {
      console.error('[CompressStep] Compression failed:', err)
    } finally {
      window.electronAPI.offCompressProgress(callback)
      setCompressing(false)
    }
  }, [analysis, setCompressResults])

  const handleNext = useCallback((): void => {
    setStep('info')
  }, [setStep])

  // 状态判定
  const done = compress.status === 'done' && Object.keys(compress.results).length > 0
  const isProcessing = analyzing || compressing
  const progressPercent = done ? 100 : Math.round(compress.progress * 100)

  if (analyzing) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-secondary)]">正在分析图片...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* ===== 注入呼吸灯动画 ===== */}
      <style>{pulseKeyframes}</style>

      {/* ===== 头部：标题 + 右上角导航按钮 ===== */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--color-border)]">
        <div>
          <h2 className="text-md font-medium text-[var(--color-text-primary)]">图片压缩</h2>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            优化图片尺寸与体积，确保符合平台规格
          </p>
        </div>

        {/* 右上角下一步按钮 */}
        <div>
          {done ? (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] text-white
                         text-sm font-medium rounded-md transition-all duration-200
                         hover:bg-blue-600 active:scale-95"
              style={{ animation: 'pulse-subtle 2s infinite ease-in-out' }}
            >
              <span>下一步</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          ) : (
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-gray-100 text-gray-400
                         text-sm font-medium rounded-md cursor-not-allowed border border-gray-200"
            >
              {isProcessing ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                  </svg>
                  <span>正在压缩 {Math.max(progressPercent, needCount > 0 ? 0 : 100)}%</span>
                </>
              ) : (
                <>
                  <span>准备压缩...</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 分析错误提示 */}
      {analyzeError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4 text-sm text-yellow-800">
          {analyzeError}
        </div>
      )}

      {/* 摘要 */}
      {analysis.length > 0 && (
        <div className="bg-white rounded-lg border border-[var(--color-border)] p-4 mb-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              共 <strong className="text-[var(--color-text-primary)]">{analysis.length}</strong> 张图片
            </span>
            <span className="text-[var(--color-text-secondary)]">
              需压缩 <strong className={needCount > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}>{needCount}</strong> 张
            </span>
            {needCount === 0 && !done && (
              <span className="text-[var(--color-success)] text-sm ml-auto">✓ 所有图片已符合规格</span>
            )}
          </div>
        </div>
      )}

      {/* 压缩按钮 */}
      {needCount > 0 && !done && (
        <button
          onClick={handleCompress}
          disabled={compressing}
          className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm rounded-md
                     hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors mb-4"
        >
          {compressing ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              压缩中...
            </span>
          ) : (
            '开始压缩'
          )}
        </button>
      )}

      {/* 进度列表 */}
      {analysis.length > 0 && (
        <div className="space-y-2">
          {analysis.map((item) => {
            const result = progressItems.get(item.id) || (compress.status === 'done' ? compress.results[item.id] : null)
            const compressed = !item.needCompress || result?.skipped ? null : result
            const saving = result && !result.skipped
              ? `${((1 - result.compressedSize / result.originalSize) * 100).toFixed(0)}%`
              : null

            return (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-[var(--color-border)] p-3 flex items-center gap-3"
              >
                <img
                  src={images.find((img) => img.id === item.id)?.thumbnailDataUrl ?? ''}
                  alt=""
                  className="w-10 h-10 rounded object-cover shrink-0 bg-[var(--color-bg-page)]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-text-primary)] truncate">
                    {images.find((img) => img.id === item.id)?.fileName ?? item.id}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {item.width}×{item.height} · {formatSize(item.originalSize)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {!compressing && !done && !item.needCompress && (
                    <span className="text-xs text-[var(--color-success)]">跳过</span>
                  )}
                  {!compressing && !done && item.needCompress && (
                    <span className="text-xs text-[var(--color-text-tertiary)]">待压缩</span>
                  )}
                  {result && result.skipped && (
                    <span className="text-xs text-[var(--color-success)]">无需压缩</span>
                  )}
                  {compressed && !compressed.skipped && (
                    <div>
                      <span className="text-xs text-[var(--color-success)] block">
                        {formatSize(compressed.compressedSize)}
                      </span>
                      {saving && (
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          -{saving}
                        </span>
                      )}
                    </div>
                  )}
                  {compressing && !result && item.needCompress && (
                    <span className="text-xs text-[var(--color-text-tertiary)]">等待中...</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 底部跳过按钮 */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleNext}
          className="flex-1 py-2.5 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                     text-sm rounded-md hover:bg-gray-50 transition-colors"
        >
          跳过压缩，直接进入下一步
        </button>
      </div>
    </div>
  )
}
