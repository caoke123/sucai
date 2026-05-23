import { useState, useEffect } from 'react'
import type { UploadTask, UploadQueueState } from '../../shared/types'

interface UploadQueueStats {
  pending: number
  uploading: UploadTask | null
  done: number
  failed: number
}

export function useUploadQueue() {
  const [queueState, setQueueState] = useState<UploadQueueState>({
    tasks: [],
    isProcessing: false,
  })

  useEffect(() => {
    if (!window.electronAPI) return

    // 初始化拉取一次当前状态
    window.electronAPI.uploadQueueGet().then(setQueueState)

    // 监听主进程推送
    const handler = (state: UploadQueueState): void => setQueueState(state)
    window.electronAPI.onUploadQueueUpdate(handler)

    return () => {
      if (window.electronAPI) window.electronAPI.offUploadQueueUpdate(handler)
    }
  }, [])

  const stats: UploadQueueStats = {
    pending: queueState.tasks.filter((t) => t.status === 'pending').length,
    uploading: queueState.tasks.find((t) => t.status === 'uploading') ?? null,
    done: queueState.tasks.filter((t) => t.status === 'done').length,
    failed: queueState.tasks.filter((t) => t.status === 'failed').length,
  }

  return {
    tasks: queueState.tasks,
    stats,
    addTask: (task: Parameters<typeof window.electronAPI.uploadQueueAdd>[0]) =>
      window.electronAPI.uploadQueueAdd(task),
    retryTask: (taskId: string) => window.electronAPI.uploadQueueRetry(taskId),
    removeTask: (taskId: string) => window.electronAPI.uploadQueueRemove(taskId),
    clearCompleted: () => window.electronAPI.uploadQueueClearCompleted(),
  }
}
