import { useState } from 'react'
import { ProductSorter } from './components/ProductSorter'
import { SettingsModal } from './components/SettingsModal'
import { UploadQueueBar } from './components/UploadQueueBar'

function App(): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-page)]">
      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden">
        <ProductSorter />
      </div>

      {/* 底部页脚 */}
      <footer className="w-full py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-600 font-medium select-none flex items-center gap-4 shrink-0 px-4">
        {/* 左侧：上传队列 */}
        <div className="flex-1">
          <UploadQueueBar />
        </div>
        {/* 中间 */}
        <span>雨图饰品素材分拣系统</span>
        <span className="w-px h-3 bg-gray-200" />
        <span>版本号：v4.8</span>
        <span className="w-px h-3 bg-gray-200" />
        <span>作者：xp</span>
        <span className="w-px h-3 bg-gray-200" />
        {/* 右侧：设置按钮 */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="设置"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </footer>

      {/* 设置弹窗 */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default App
