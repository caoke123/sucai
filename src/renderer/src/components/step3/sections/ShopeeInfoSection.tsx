import type { ShopeeInfo } from '@shared/types'

interface ShopeeInfoSectionProps {
  shopeeInfo: ShopeeInfo
  aiLoading: boolean
  onSetShopeeInfo: (info: Partial<ShopeeInfo>) => void
  onSetAttributes: (attrs: Partial<ShopeeInfo['attributes']>) => void
  onAiGenerate: () => void
}

export function ShopeeInfoSection({
  shopeeInfo,
  aiLoading,
  onSetShopeeInfo,
  onSetAttributes,
  onAiGenerate,
}: ShopeeInfoSectionProps): JSX.Element {
  const titleLen = shopeeInfo.title.length
  const titleOverLimit = titleLen > 120

  return (
    <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-medium text-[var(--color-text-primary)]">
          Shopee 发布信息
        </h3>
        <button
          onClick={onAiGenerate}
          disabled={aiLoading}
          className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium
                     hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 active:scale-[0.98] flex items-center gap-2"
        >
          {aiLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              正在生成...
            </>
          ) : (
            'AI 一键生成'
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 英文标题 */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            英文标题
            <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">(Shopee Title)</span>
          </label>
          <input
            type="text"
            value={shopeeInfo.title}
            onChange={(e) => onSetShopeeInfo({ title: e.target.value })}
            placeholder="Baseball Bag Charm Keychain 3pcs Set..."
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
          <div className={`text-xs mt-1 ${titleOverLimit ? 'text-[var(--color-danger)] font-medium' : 'text-[var(--color-text-tertiary)]'}`}>
            {titleLen} / 120{titleOverLimit ? ' (超限!)' : ''}
          </div>
        </div>

        {/* 英文描述 */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            英文描述
            <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">(Shopee Description)</span>
          </label>
          <textarea
            rows={5}
            value={shopeeInfo.descriptionText}
            onChange={(e) => onSetShopeeInfo({ descriptionText: e.target.value })}
            placeholder="This adorable 3-piece keychain set includes..."
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] resize-none"
          />
        </div>

        {/* 品牌 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            品牌
          </label>
          <input
            type="text"
            value={shopeeInfo.attributes.brand}
            onChange={(e) => onSetAttributes({ brand: e.target.value })}
            placeholder="No Brand"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* 原产地 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            原产地
          </label>
          <input
            type="text"
            value={shopeeInfo.attributes.origin}
            onChange={(e) => onSetAttributes({ origin: e.target.value })}
            placeholder="China"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* 材质 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            材质
          </label>
          <input
            type="text"
            value={shopeeInfo.attributes.material}
            onChange={(e) => onSetAttributes({ material: e.target.value })}
            placeholder="Resin, Rope, Metal Clip"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* 尺寸 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            尺寸
            <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">(可选)</span>
          </label>
          <input
            type="text"
            value={shopeeInfo.attributes.size}
            onChange={(e) => onSetAttributes({ size: e.target.value })}
            placeholder="如: 12x8x3 cm"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* 备货时间 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            备货时间 (天)
          </label>
          <input
            type="number"
            value={shopeeInfo.leadTime || ''}
            onChange={(e) => onSetShopeeInfo({ leadTime: Number(e.target.value) || 0 })}
            placeholder="5"
            className="w-24 px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>
      </div>
    </div>
  )
}
