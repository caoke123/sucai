import { useState, useRef, useEffect } from 'react'
import { useUploadQueue } from '../hooks/useUploadQueue'

export function UploadQueueBar(): JSX.Element {
  const { tasks, stats, retryTask, removeTask, clearCompleted } = useUploadQueue()
  const [expanded, setExpanded] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  // 点击浮层外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    if (expanded) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expanded])

  const totalTasks = tasks.length
  if (totalTasks === 0) return <div />

  const hasActive = stats.uploading || stats.pending > 0

  // 摘要文本
  let summary: string
  if (stats.uploading) {
    const p = stats.uploading.progress
    let phaseText: string
    if (p <= 5) phaseText = '扫描文件中...'
    else if (p <= 85) phaseText = `上传图片 ${stats.uploading.uploadedFiles}/${stats.uploading.totalFiles} 个`
    else if (p <= 95) phaseText = '生成图片地址...'
    else if (p <= 99) phaseText = '更新产品信息...'
    else phaseText = '即将完成...'
    summary = `☁️ ${stats.uploading.productName}（${p}%）· ${phaseText}· 等待${stats.pending}个`
  } else if (stats.pending > 0) {
    summary = `☁️ 等待上传 · ${stats.pending}个任务`
  } else if (stats.failed > 0) {
    summary = `☁️ ${stats.done}个完成 · ${stats.failed}个失败`
  } else {
    summary = `☁️ 全部上传完成 · ${stats.done}个成功`
  }

  return (
    <div className="relative shrink-0">
      {/* 摘要行 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`text-xs transition-colors cursor-pointer hover:text-gray-800 ${
          hasActive ? 'text-gray-600 font-medium' : 'text-gray-500'
        }`}
      >
        {summary}
      </button>

      {/* 弹出浮层 */}
      {expanded && (
        <div
          ref={popupRef}
          className="absolute bottom-full left-0 mb-2 w-96 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50"
        >
          <div className="p-3 space-y-2">
            {tasks.map((task) => (
              <div
                key={task.taskId}
                className="p-2 rounded border border-gray-100 bg-gray-50/50 text-xs"
              >
                {/* 产品名 */}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-700 truncate max-w-[200px]">
                    {task.productName}
                  </span>
                  <span className="text-gray-400 shrink-0 ml-2">{task.productNo}</span>
                </div>

                {/* 状态标签 */}
                <div className="flex items-center gap-2">
                  {task.status === 'pending' && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px]">
                      等待中
                    </span>
                  )}
                  {task.status === 'uploading' && (
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[11px]">
                          上传中 {task.progress}%
                        </span>
                        <span className="text-gray-400 text-[11px]">
                          {task.uploadedFiles}/{task.totalFiles}个文件
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {task.status === 'done' && (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-600 rounded text-[11px]">
                        ✓ 完成
                      </span>
                      <span className="text-gray-400 text-[11px]">
                        {task.completedAt ? new Date(task.completedAt).toLocaleTimeString() : ''}
                      </span>
                      <button
                        onClick={() => removeTask(task.taskId)}
                        className="text-gray-400 hover:text-red-500 text-[11px] ml-2"
                      >
                        删除
                      </button>
                    </div>
                  )}
                  {task.status === 'failed' && (
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-500 rounded text-[11px]">
                          ✗ 失败
                        </span>
                        <button
                          onClick={() => retryTask(task.taskId)}
                          className="text-blue-500 hover:text-blue-600 text-[11px]"
                        >
                          重试
                        </button>
                      </div>
                      {task.errorMessage && (
                        <div className="text-red-400 text-[11px] mt-0.5 truncate">
                          {task.errorMessage.substring(0, 80)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 底部清除按钮 */}
            {stats.done > 0 && (
              <button
                onClick={clearCompleted}
                className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded border border-gray-200 transition-colors"
              >
                清除已完成 ({stats.done})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
