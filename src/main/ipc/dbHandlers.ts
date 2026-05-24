import { ipcMain } from 'electron'
import { createPool, testConnection, getPool, getClient } from '../db'
import type { DbConfig, PackagingPreset, SpuData, SkuItem } from '@shared/types'

export function registerDbHandlers(): void {
  // 测试数据库连接
  ipcMain.handle(
    'db:test-connection',
    async (_event, config: DbConfig): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await testConnection(config)
        if (result.success) {
          createPool(config)
        }
        return result
      } catch (error) {
        return { success: false, error: `数据库连接失败: ${(error as Error).message}` }
      }
    }
  )

  // 获取纸箱包装预设列表
  ipcMain.handle(
    'db:get-packaging-presets',
    async (): Promise<{ success: boolean; data?: PackagingPreset[]; error?: string }> => {
      try {
        const pool = getPool()
        const result = await pool.query<PackagingPreset>(
          'SELECT id, name, length, width, height, weight FROM public.packaging_presets ORDER BY id ASC'
        )
        return { success: true, data: result.rows }
      } catch (error) {
        return { success: false, error: `查询预设失败: ${(error as Error).message}` }
      }
    }
  )

  // 保存纸箱包装预设（插入或更新）
  ipcMain.handle(
    'db:save-packaging-preset',
    async (
      _event,
      preset: { id?: number; name: string; length: number; width: number; height: number; weight: number }
    ): Promise<{ success: boolean; data?: PackagingPreset; error?: string }> => {
      try {
        const pool = getPool()
        let result
        if (preset.id) {
          result = await pool.query<PackagingPreset>(
            `UPDATE public.packaging_presets SET name = $1, length = $2, width = $3, height = $4, weight = $5
             WHERE id = $6 RETURNING *`,
            [preset.name, preset.length, preset.width, preset.height, preset.weight, preset.id]
          )
        } else {
          result = await pool.query<PackagingPreset>(
            `INSERT INTO public.packaging_presets (name, length, width, height, weight)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO UPDATE
             SET length = $2, width = $3, height = $4, weight = $5 RETURNING *`,
            [preset.name, preset.length, preset.width, preset.height, preset.weight]
          )
        }
        return { success: true, data: result.rows[0] }
      } catch (error) {
        return { success: false, error: `保存预设失败: ${(error as Error).message}` }
      }
    }
  )

  // 获取下一个唯一序列号
  ipcMain.handle(
    'db:get-next-sku-seq',
    async (
      _event,
      prefix: string
    ): Promise<{ success: boolean; data?: string; error?: string }> => {
      try {
        const pool = getPool()
        const result = await pool.query<{ spu_code: string }>(
          'SELECT public.get_next_sku_seq($1) as spu_code',
          [prefix]
        )
        return { success: true, data: result.rows[0].spu_code }
      } catch (error) {
        return { success: false, error: `获取序列号失败: ${(error as Error).message}` }
      }
    }
  )

  // 事务性保存 SPU 和 SKU 数据
  ipcMain.handle(
    'db:save-spu-and-skus',
    async (
      _event,
      spu: SpuData,
      skus: SkuItem[]
    ): Promise<{ success: boolean; error?: string }> => {
      let client
      try {
        client = await getClient()
        await client.query('BEGIN')

        // 写入/更新 SPU
        await client.query(
          `INSERT INTO public.spus (spu_code, spu_name, category_code, style_code,
           outer_pack_length, outer_pack_width, outer_pack_height, outer_pack_weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (spu_code) DO UPDATE SET
             spu_name = $2, category_code = $3, style_code = $4,
             outer_pack_length = $5, outer_pack_width = $6,
             outer_pack_height = $7, outer_pack_weight = $8,
             updated_at = now()`,
          [
            spu.spuCode,
            spu.spuName,
            spu.categoryCode || null,
            spu.styleCode || null,
            spu.outerPackLength || null,
            spu.outerPackWidth || null,
            spu.outerPackHeight || null,
            spu.outerPackWeight || null,
          ]
        )

        // 批量写入/更新 SKU
        for (const sku of skus) {
          await client.query(
            `INSERT INTO public.skus (sku_code, spu_code, color_name, dimensions,
             weight, cost_price, selling_price, image_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (sku_code) DO UPDATE SET
               spu_code = $2, color_name = $3, dimensions = $4,
               weight = $5, cost_price = $6, selling_price = $7,
               image_path = $8`,
            [
              sku.skuCode,
              spu.spuCode,
              sku.colorName,
              sku.dimensions || null,
              sku.weight || null,
              sku.costPrice || null,
              sku.sellingPrice || null,
              sku.imagePath || null,
            ]
          )
        }

        await client.query('COMMIT')
        return { success: true }
      } catch (error) {
        await client?.query('ROLLBACK').catch(() => {})
        return { success: false, error: `保存数据失败: ${(error as Error).message}` }
      } finally {
        client?.release()
      }
    }
  )
}
