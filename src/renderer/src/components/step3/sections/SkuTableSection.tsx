import type { SkuItem } from '@shared/types'

interface SkuTableSectionProps {
  skuList: SkuItem[]
  translatingSkuCode: string | null
  batchLength: string
  batchWidth: string
  batchHeight: string
  batchWeight: string
  batchCost: string
  batchSelling: string
  batchStock: string
  onBatchLengthChange: (v: string) => void
  onBatchWidthChange: (v: string) => void
  onBatchHeightChange: (v: string) => void
  onBatchWeightChange: (v: string) => void
  onBatchCostChange: (v: string) => void
  onBatchSellingChange: (v: string) => void
  onBatchStockChange: (v: string) => void
  onBatchFill: () => void
  onUpdateSkuItem: (index: number, partial: Partial<SkuItem>) => void
  onCopyPreviousSku: (index: number) => void
  onAiTranslateSku: (index: number) => void
  getSkuImageSrc: (sku: { imagePath: string; previewUrl?: string }) => string
}

function safeNumber(value: string): number {
  const n = Number(value)
  return isNaN(n) ? 0 : n
}

export function SkuTableSection({
  skuList,
  batchLength,
  batchWidth,
  batchHeight,
  batchWeight,
  batchCost,
  batchSelling,
  batchStock,
  onBatchLengthChange,
  onBatchWidthChange,
  onBatchHeightChange,
  onBatchWeightChange,
  onBatchCostChange,
  onBatchSellingChange,
  onBatchStockChange,
  onBatchFill,
  onUpdateSkuItem,
  onCopyPreviousSku,
  onAiTranslateSku,
  translatingSkuCode,
  getSkuImageSrc,
}: SkuTableSectionProps): JSX.Element {
  return (
    <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
      <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-4">
        SKU 规格管理
      </h3>

      {/* 批量填充栏 */}
      <div className="mb-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">长 (cm)</label>
          <input
            type="text"
            value={batchLength}
            onChange={(e) => onBatchLengthChange(e.target.value)}
            placeholder="长"
            className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">宽 (cm)</label>
          <input
            type="text"
            value={batchWidth}
            onChange={(e) => onBatchWidthChange(e.target.value)}
            placeholder="宽"
            className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">高 (cm)</label>
          <input
            type="text"
            value={batchHeight}
            onChange={(e) => onBatchHeightChange(e.target.value)}
            placeholder="高"
            className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">重量 (g)</label>
          <input
            type="text"
            value={batchWeight}
            onChange={(e) => onBatchWeightChange(e.target.value)}
            placeholder="重量"
            className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">成本价 (元)</label>
          <input
            type="text"
            value={batchCost}
            onChange={(e) => onBatchCostChange(e.target.value)}
            placeholder="成本价"
            className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">售价 (元)</label>
          <input
            type="text"
            value={batchSelling}
            onChange={(e) => onBatchSellingChange(e.target.value)}
            placeholder="售价"
            className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">库存</label>
          <input
            type="text"
            value={batchStock}
            onChange={(e) => onBatchStockChange(e.target.value)}
            placeholder="库存"
            className="w-20 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <button
          onClick={onBatchFill}
          className="px-5 py-1.5 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium
                     hover:bg-[var(--color-primary-hover)] transition-colors duration-150 whitespace-nowrap"
        >
          应用到全部
        </button>
      </div>

      {/* SKU 逐行编辑 */}
      <div className="space-y-2">
        {skuList.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--color-text-tertiary)]">
            暂无 SKU 数据，请先在「图片标注」步骤中标记 SKU 图并生成 SKU 列表
          </div>
        ) : (
          skuList.map((sku, idx) => (
            <div
              key={sku.skuCode || sku.colorName || `sku-${idx}`}
              className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 bg-white border border-gray-200 rounded-md
                         hover:border-[var(--color-primary)] transition-all duration-150"
            >
              {/* 图片预览 */}
              <div className="col-span-1 flex justify-center">
                <div
                  className="w-14 h-14 rounded-md overflow-hidden bg-gray-100 border border-gray-200 shrink-0 cursor-pointer
                             hover:scale-110 transition-transform duration-200"
                  onClick={() => sku.imagePath && window.electronAPI?.openPath(sku.imagePath)}
                  title={sku.imagePath || '暂无图片'}
                >
                  {sku.imagePath || sku.previewUrl ? (
                    <img
                      src={getSkuImageSrc(sku)}
                      alt={sku.colorName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl">
                      🖼
                    </div>
                  )}
                </div>
              </div>

              {/* SKU 编码（只读） */}
              <div className="col-span-1">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">SKU编码</label>
                <input
                  type="text"
                  value={sku.skuCode}
                  readOnly
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm
                             bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>

              {/* SKU名称 */}
              <div className="col-span-2">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">名称</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={sku.colorName}
                    onChange={(e) => onUpdateSkuItem(idx, { colorName: e.target.value })}
                    placeholder="如 珍珠白"
                    className="flex-1 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                               focus:outline-none focus:border-[var(--color-primary)]
                               text-[var(--color-text-primary)] bg-white"
                  />
                  <button
                    onClick={() => onAiTranslateSku(idx)}
                    disabled={translatingSkuCode === (sku.skuCode || sku.colorName)}
                    className="px-2 py-1.5 text-xs border border-purple-200 text-purple-600 bg-purple-50
                               hover:bg-purple-100 rounded disabled:opacity-50 disabled:cursor-not-allowed
                               transition-colors duration-150 whitespace-nowrap shrink-0"
                    title="AI翻译为英文"
                  >
                    {translatingSkuCode === (sku.skuCode || sku.colorName) ? '···' : '✨'}
                  </button>
                </div>
              </div>

              {/* 英文名称 (v4) */}
              <div className="col-span-2">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">英文名称</label>
                <input
                  type="text"
                  value={sku.skuNameEn || ''}
                  onChange={(e) => onUpdateSkuItem(idx, { skuNameEn: e.target.value })}
                  placeholder="Pearl White"
                  className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)] bg-white"
                />
              </div>

              {/* 尺寸 */}
              <div className="col-span-1">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">尺寸</label>
                <input
                  type="text"
                  value={sku.dimensions}
                  onChange={(e) => onUpdateSkuItem(idx, { dimensions: e.target.value })}
                  placeholder="10x5x5"
                  className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)] bg-white"
                />
              </div>

              {/* 重量(g) */}
              <div className="col-span-1">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">重量</label>
                <input
                  type="number"
                  value={sku.weight || ''}
                  onChange={(e) => onUpdateSkuItem(idx, { weight: safeNumber(e.target.value) })}
                  placeholder="g"
                  className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)] bg-white"
                />
              </div>

              {/* 成本价(元) */}
              <div className="col-span-1">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">成本价</label>
                <input
                  type="number"
                  value={sku.costPrice || ''}
                  onChange={(e) => onUpdateSkuItem(idx, { costPrice: safeNumber(e.target.value) })}
                  placeholder="¥"
                  className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)] bg-white"
                />
              </div>

              {/* 售价(元) */}
              <div className="col-span-1">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">售价</label>
                <input
                  type="number"
                  value={sku.sellingPrice || ''}
                  onChange={(e) => onUpdateSkuItem(idx, { sellingPrice: safeNumber(e.target.value) })}
                  placeholder="¥"
                  className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)] bg-white"
                />
              </div>

              {/* 库存 (v4) */}
              <div className="col-span-1">
                <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">库存</label>
                <input
                  type="number"
                  value={sku.stock || ''}
                  onChange={(e) => onUpdateSkuItem(idx, { stock: safeNumber(e.target.value) })}
                  placeholder="库存"
                  className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                             focus:outline-none focus:border-[var(--color-primary)]
                             text-[var(--color-text-primary)] bg-white"
                />
              </div>

              {/* 操作 */}
              <div className="col-span-1 flex justify-center">
                {idx > 0 && (
                  <button
                    onClick={() => onCopyPreviousSku(idx)}
                    className="px-2.5 py-1.5 text-xs text-[var(--color-primary)] bg-blue-50
                               hover:bg-blue-100 rounded border border-blue-200
                               transition-colors duration-150 whitespace-nowrap flex items-center gap-1"
                  >
                    <span className="text-sm">🗐</span> 复用
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
