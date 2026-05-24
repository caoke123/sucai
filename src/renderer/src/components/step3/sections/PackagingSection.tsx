import type { SpuData, PackagingPreset } from '@shared/types'

interface PackagingSectionProps {
  packagingPresets: PackagingPreset[]
  currentSpu: SpuData | null
  onPresetSelect: (presetId: string) => void
  onSavePreset: () => void
  onUpdateSpu: (partial: Partial<SpuData>) => void
}

export function PackagingSection({
  packagingPresets,
  currentSpu,
  onPresetSelect,
  onSavePreset,
  onUpdateSpu,
}: PackagingSectionProps): JSX.Element {
  return (
    <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
      <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-4">
        📦 外包装规格管理
      </h3>

      {/* 选择箱型预设 */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1 max-w-md">
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">选择箱型预设</label>
          <select
            value=""
            onChange={(e) => onPresetSelect(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          >
            <option value="">-- 选择预设自动填写 --</option>
            {packagingPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.length}×{p.width}×{p.height}cm, {p.weight}g)
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onSavePreset}
          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-md text-sm
                     hover:bg-gray-50 transition-colors duration-150 whitespace-nowrap
                     flex items-center gap-1.5 self-end"
        >
          💾 保存为新纸箱预设
        </button>
      </div>

      {/* 自定义尺寸编辑 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装长 (cm)</label>
          <input
            type="number"
            value={currentSpu?.outerPackLength || ''}
            onChange={(e) => onUpdateSpu({ outerPackLength: Number(e.target.value) || 0 })}
            placeholder="长"
            className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装宽 (cm)</label>
          <input
            type="number"
            value={currentSpu?.outerPackWidth || ''}
            onChange={(e) => onUpdateSpu({ outerPackWidth: Number(e.target.value) || 0 })}
            placeholder="宽"
            className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装高 (cm)</label>
          <input
            type="number"
            value={currentSpu?.outerPackHeight || ''}
            onChange={(e) => onUpdateSpu({ outerPackHeight: Number(e.target.value) || 0 })}
            placeholder="高"
            className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-0.5">外包装重量 (g)</label>
          <input
            type="number"
            value={currentSpu?.outerPackWeight || ''}
            onChange={(e) => onUpdateSpu({ outerPackWeight: Number(e.target.value) || 0 })}
            placeholder="重量"
            className="w-24 px-2 py-1.5 border border-[var(--color-border)] rounded text-sm
                       focus:outline-none focus:border-[var(--color-primary)]
                       text-[var(--color-text-primary)] bg-white"
          />
        </div>
      </div>
    </div>
  )
}
