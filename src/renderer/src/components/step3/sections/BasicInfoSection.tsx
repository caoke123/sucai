import type { ProductInfo, SpuData } from '@shared/types'

interface BasicInfoSectionProps {
  productInfo: ProductInfo
  shortTitle: string
  productCode: string
  currentSpu: SpuData | null
  aiLoading: boolean
  aiError: string | null
  categoryOptions: Array<{ code: string; name: string }>
  onSetProductInfo: (partial: Partial<ProductInfo>) => void
  onSetShortTitle: (title: string) => void
  onSetProductCode: (code: string) => void
  onUpdateSpu: (partial: Partial<SpuData>) => void
  onAiFill: () => void
}

export function BasicInfoSection({
  productInfo,
  shortTitle,
  productCode,
  currentSpu,
  aiLoading,
  aiError,
  categoryOptions,
  onSetProductInfo,
  onSetShortTitle,
  onSetProductCode,
  onUpdateSpu,
  onAiFill,
}: BasicInfoSectionProps): JSX.Element {
  return (
    <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-medium text-[var(--color-text-primary)]">
          产品基础信息
        </h3>
        <button
          onClick={onAiFill}
          disabled={aiLoading}
          className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium
                     hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 active:scale-[0.98] flex items-center gap-2"
        >
          {aiLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              正在阅读并推理中...
            </>
          ) : (
            ' AI 智能填表'
          )}
        </button>
      </div>

      {/* AI 结果摘要 */}
      {shortTitle && (
        <div className="flex items-center gap-4 bg-purple-50 border border-purple-100 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-purple-700 font-medium shrink-0">短标题:</span>
            <input
              type="text"
              className="bg-transparent border-b border-purple-200 hover:border-purple-400 focus:border-purple-600 focus:outline-none px-1 py-0.5 text-purple-900 font-semibold w-full max-w-md transition-colors"
              value={shortTitle}
              onChange={(e) => onSetShortTitle(e.target.value)}
              placeholder="请输入短标题（用于文件夹命名）"
            />
          </div>
          <div className="text-purple-700 shrink-0">
            <span className="font-medium">编号: </span>
            <span className="font-mono font-bold bg-purple-100/50 px-2 py-0.5 rounded">{productCode}</span>
          </div>
        </div>
      )}

      {aiError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          {aiError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* 产品标题 */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            产品标题 <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            type="text"
            value={productInfo.title}
            onChange={(e) => onSetProductInfo({ title: e.target.value })}
            placeholder="请输入完整的产品标题"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* 产品主编号 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            产品主编号
          </label>
          <input
            type="text"
            value={productInfo.productNo}
            onChange={(e) => onSetProductInfo({ productNo: e.target.value })}
            placeholder="自动生成或手动输入"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] font-mono"
          />
        </div>

        {/* 货源平台 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            货源平台
          </label>
          <select
            value={productInfo.sourcePlatform}
            onChange={(e) => onSetProductInfo({ sourcePlatform: e.target.value })}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          >
            <option value="1688">1688</option>
            <option value="淘宝">淘宝</option>
            <option value="其他">其他</option>
          </select>
        </div>

        {/* 货源链接 */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            货源链接
          </label>
          <input
            type="text"
            value={productInfo.sourceUrl}
            onChange={(e) => onSetProductInfo({ sourceUrl: e.target.value })}
            placeholder="https://detail.1688.com/offer/xxx.html"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* 货币类型 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            货币类型
          </label>
          <select
            value={productInfo.currency}
            onChange={(e) => onSetProductInfo({ currency: e.target.value })}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          >
            <option value="CNY">CNY</option>
            <option value="USD">USD</option>
          </select>
        </div>

        {/* 货源类目 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            货源类目
          </label>
          <select
            value={currentSpu?.categoryCode || ''}
            onChange={(e) => onUpdateSpu({ categoryCode: e.target.value })}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          >
            <option value="">请选择类目</option>
            {categoryOptions.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* 风格提示 */}
        <div className="flex items-center">
          <span className="text-xs text-[var(--color-text-tertiary)]">
            风格编码由 SKU 名称自动匹配（白/棕/红/彩/奶/黑/灰/混色）
          </span>
        </div>

        {/* 属性 */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            属性
          </label>
          <input
            type="text"
            value={productInfo.attributes}
            onChange={(e) => onSetProductInfo({ attributes: e.target.value })}
            placeholder="品牌:VOC；货号:D001（用中文分号分隔）"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* 产品描述 */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            产品描述
          </label>
          <textarea
            rows={3}
            value={productInfo.description}
            onChange={(e) => onSetProductInfo({ description: e.target.value })}
            placeholder="产品的详细描述文本"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] resize-none"
          />
        </div>
      </div>
    </div>
  )
}
