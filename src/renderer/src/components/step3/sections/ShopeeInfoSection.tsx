import type { ShopeeInfo } from '@shared/types'

const JIT_OPTIONS = [
  { label: '女包JIT邀请码：IVCN202507240989', value: 'IVCN202507240989' },
  { label: '男包JIT邀请码：IVCN202507240990', value: 'IVCN202507240990' },
  { label: '旅行JIT邀请码：IVCN202507240991', value: 'IVCN202507240991' },
]

interface ShopeeInfoSectionProps {
  shopeeInfo: ShopeeInfo
  onSetShopeeInfo: (info: Partial<ShopeeInfo>) => void
  onSetAttributes: (attrs: Partial<ShopeeInfo['attributes']>) => void
}

function safeNum(value: number, fallback: number): number {
  if (typeof value === 'number' && !isNaN(value)) return value
  return fallback
}

export function ShopeeInfoSection({
  shopeeInfo,
  onSetShopeeInfo,
  onSetAttributes,
}: ShopeeInfoSectionProps): JSX.Element {
  const titleLen = shopeeInfo.title.length
  const titleOverLimit = titleLen > 160
  const orderQty = safeNum(shopeeInfo.minimumOrderQty, 5)

  return (
    <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-medium text-[var(--color-text-primary)]">
          Shopee 发布信息
        </h3>
        <span className="text-xs text-[var(--color-text-tertiary)] italic">
          ✨ 英文信息将随顶部「AI 智能填表」一并自动生成
        </span>
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
            {titleLen} / 160{titleOverLimit ? ' (超限!)' : ''}
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
            placeholder="NoBrand"
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
            placeholder="中国大陆"
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

        {/* 备货时间 + 起订量 */}
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
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            起订量 (件)
          </label>
          <input
            type="number"
            value={orderQty}
            onChange={(e) => onSetShopeeInfo({ minimumOrderQty: Number(e.target.value) || 5 })}
            placeholder="5"
            min={1}
            max={9999}
            className="w-24 px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)]"
          />
        </div>

        {/* JIT 邀请码 */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            JIT邀请码
            <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">(可选)</span>
          </label>
          <select
            value={shopeeInfo.jitInvitationCode || ''}
            onChange={(e) => onSetShopeeInfo({ jitInvitationCode: e.target.value })}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          >
            <option value="">-- 请选择 --</option>
            {JIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
