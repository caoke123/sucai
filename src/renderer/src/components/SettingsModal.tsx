import { useState, useEffect } from 'react'
import { useSorterStore } from '../store/useSorterStore'
import type { R2Config } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props): JSX.Element | null {
  const { aiConfig, setAiConfig, resetAiConfig } = useSorterStore()
  const [activeTab, setActiveTab] = useState<'ai' | 'r2'>('ai')

  // R2 配置本地状态
  const [r2Config, setR2Config] = useState<R2Config>({
    endpoint: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucket: '',
    customDomain: '',
  })
  const [showSecret, setShowSecret] = useState(false)
  const [r2Testing, setR2Testing] = useState(false)
  const [r2TestResult, setR2TestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // 初始化加载 R2 配置
  useEffect(() => {
    if (open && window.electronAPI) {
      window.electronAPI.r2ConfigGet().then(setR2Config)
    }
  }, [open])

  // 保存 R2 配置
  const saveR2Config = async (): Promise<void> => {
    if (!window.electronAPI) return
    await window.electronAPI.r2ConfigSet(r2Config)
  }

  // 测试 R2 连接
  const testR2Connection = async (): Promise<void> => {
    if (!window.electronAPI) return
    setR2Testing(true)
    setR2TestResult(null)
    // 先保存当前配置
    await window.electronAPI.r2ConfigSet(r2Config)
    const result = await window.electronAPI.r2ConfigTest()
    setR2TestResult({
      ok: result.success,
      msg: result.success ? '连接成功' : `失败：${result.error}`,
    })
    setR2Testing(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-md font-medium text-[var(--color-text-primary)]">
            系统设置
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

        {/* 标签页 */}
        <div className="flex border-b border-[var(--color-border)]">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'ai'
                ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🤖 AI 大模型
          </button>
          <button
            onClick={() => setActiveTab('r2')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'r2'
                ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ☁️ R2 云存储
          </button>
        </div>

        {/* AI 配置表单 */}
        {activeTab === 'ai' && (
          <>
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
          </>
        )}

        {/* R2 配置表单 */}
        {activeTab === 'r2' && (
          <>
            <div className="px-6 py-5 space-y-4 max-h-[50vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={r2Config.endpoint}
                  onChange={(e) => setR2Config((p) => ({ ...p, endpoint: e.target.value }))}
                  placeholder="https://<id>.r2.cloudflarestorage.com"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Access Key ID
                </label>
                <input
                  type="text"
                  value={r2Config.accessKeyId}
                  onChange={(e) => setR2Config((p) => ({ ...p, accessKeyId: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Secret Access Key
                </label>
                <div className="flex gap-2">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={r2Config.secretAccessKey}
                    onChange={(e) => setR2Config((p) => ({ ...p, secretAccessKey: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                               focus:outline-none focus:border-[var(--color-primary)]
                               text-[var(--color-text-primary)]"
                  />
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="px-3 py-2 border border-[var(--color-border)] rounded-md text-xs
                               text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    {showSecret ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Bucket 名称
                </label>
                <input
                  type="text"
                  value={r2Config.bucket}
                  onChange={(e) => setR2Config((p) => ({ ...p, bucket: e.target.value }))}
                  placeholder="yuntu-products"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  自定义域名（选填）
                </label>
                <input
                  type="text"
                  value={r2Config.customDomain}
                  onChange={(e) => setR2Config((p) => ({ ...p, customDomain: e.target.value }))}
                  placeholder="https://yutu.nv315.top"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)]"
                />
              </div>

              {/* 连接测试结果 */}
              {r2TestResult && (
                <div
                  className={`px-3 py-2 rounded-md text-sm ${
                    r2TestResult.ok
                      ? 'bg-green-50 text-green-600 border border-green-200'
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}
                >
                  {r2TestResult.ok ? '✓ ' : '✗ '}
                  {r2TestResult.msg}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
              <button
                onClick={testR2Connection}
                disabled={r2Testing}
                className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)]
                           rounded-md text-sm hover:bg-gray-50 disabled:opacity-50
                           transition-colors duration-150"
              >
                {r2Testing ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={async () => {
                  await saveR2Config()
                  onClose()
                }}
                className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                           hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
              >
                保存配置
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
