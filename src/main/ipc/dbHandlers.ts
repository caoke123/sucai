import { ipcMain } from 'electron'
import { pool, MACHINE_NAME, createPool, testConnection, getPool, getClient } from '../db'
import type { DbConfig, PackagingPreset, SpuData, SkuItem } from '@shared/types'

// ==================== SPU 编码生成工具 ====================

const PINYIN_INITIALS: Record<string, string> = {
  '衣': 'Y', '裤': 'K', '鞋': 'X', '袜': 'W', '帽': 'M', '包': 'B',
  '饰': 'S', '配': 'P', '针': 'Z', '织': 'Z', '纺': 'F',
  '玻': 'B', '璃': 'L', '纸': 'Z', '石': 'S', '钻': 'Z', '珠': 'Z', '玉': 'Y',
  '编': 'B', '绣': 'X', '蕾': 'L', '丝': 'S',
  '手': 'S', '机': 'J', '电': 'D', '车': 'C', '安': 'A', '汽': 'Q',
  '美': 'M', '妆': 'Z', '化': 'H', '护': 'H', '香': 'X', '洗': 'X',
  '家': 'J', '居': 'J', '厨': 'C', '卫': 'W', '办': 'B', '公': 'G',
  '运': 'Y', '动': 'D', '户': 'H', '外': 'W', '旅': 'L', '行': 'X',
  '宠': 'C', '物': 'W', '食': 'S', '饮': 'Y', '园': 'Y', '艺': 'Y',
  '礼': 'L', '品': 'P', '卡': 'K', '贴': 'T', '牌': 'P', '扣': 'K', '钩': 'G', '链': 'L'
}

function toPinyinInitials(text: string): string {
  let result = ''
  for (const char of text) {
    if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toUpperCase()
    } else if (PINYIN_INITIALS[char]) {
      result += PINYIN_INITIALS[char]
    }
  }
  return result
}

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
        const pg = getPool()
        const result = await pg.query<PackagingPreset>(
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
        const pg = getPool()
        let result
        if (preset.id) {
          result = await pg.query<PackagingPreset>(
            `UPDATE public.packaging_presets SET name = $1, length = $2, width = $3, height = $4, weight = $5
             WHERE id = $6 RETURNING *`,
            [preset.name, preset.length, preset.width, preset.height, preset.weight, preset.id]
          )
        } else {
          result = await pg.query<PackagingPreset>(
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
        const pg = getPool()
        const result = await pg.query<{ spu_code: string }>(
          'SELECT public.get_next_sku_seq($1) as spu_code',
          [prefix]
        )
        return { success: true, data: result.rows[0].spu_code }
      } catch (error) {
        return { success: false, error: `获取序列号失败: ${(error as Error).message}` }
      }
    }
  )

  // 只读预览：根据短标题+类目查询预估主编码，不消耗序列号
  ipcMain.handle(
    'db:getSpuCodePreview',
    async (
      _event,
      params: { categoryCode: string; shortTitle: string }
    ): Promise<{ success: boolean; data?: { spuCode: string }; error?: string }> => {
      try {
        const dateStr = new Date().toISOString().slice(2, 8).replace(/-/g, '')
        const initials = toPinyinInitials(params.shortTitle).slice(0, 4).toUpperCase()
        const prefix = `${initials}${dateStr}-`

        // 只读查询：找当前前缀下最大的编号
        const { rows } = await pool.query(
          `SELECT spu_code FROM public.spus
           WHERE spu_code LIKE $1
           ORDER BY spu_code DESC LIMIT 1`,
          [`${prefix}%`]
        )

        let nextSeq = 1
        if (rows.length > 0) {
          const lastCode = rows[0].spu_code as string
          const match = lastCode.match(/-(\d+)$/)
          if (match) {
            nextSeq = parseInt(match[1], 10) + 1
          }
        }

        const previewCode = `${prefix}${String(nextSeq).padStart(4, '0')}`
        return { success: true, data: { spuCode: previewCode } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 生成 SPU 编码并写入数据库（支持手动指定编码，否则使用序列号）
  ipcMain.handle(
    'db:createSpu',
    async (
      _event,
      params: {
        shortTitle: string
        spuName: string
        categoryCode: string
        styleCode?: string
        spuCode?: string
        outerPackLength?: number
        outerPackWidth?: number
        outerPackHeight?: number
        outerPackWeight?: number
      }
    ): Promise<{ success: boolean; data?: { spuCode: string }; error?: string }> => {
      let client
      try {
        client = await getClient()
        await client.query('BEGIN')

        // 生成 SPU 编码：手动指定则直接用，否则从序列号生成
        const spuCode = params.spuCode || (() => {
          const seqRes = (async () => {
            const r = await client!.query("SELECT NEXTVAL('spu_seq') AS seq")
            return String(r.rows[0].seq).padStart(4, '0')
          })()
          // 因为这里需要等待 seqRes，改为顺序执行
          return ''
        })()

        let finalCode: string
        if (params.spuCode) {
          finalCode = params.spuCode
        } else {
          const seqRes = await client.query("SELECT NEXTVAL('spu_seq') AS seq")
          const seq = String(seqRes.rows[0].seq).padStart(4, '0')
          const dateStr = new Date().toISOString().slice(2, 8).replace(/-/g, '')
          const initials = toPinyinInitials(params.shortTitle).slice(0, 4).toUpperCase()
          finalCode = `${initials}${dateStr}-${seq}`
        }

        // 写入数据库（冲突时报错，不静默覆盖）
        const insertRes = await client.query(
          `INSERT INTO public.spus
             (spu_code, spu_name, short_title, category_code, style_code,
              outer_pack_length, outer_pack_width, outer_pack_height, outer_pack_weight,
              machine_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (spu_code) DO NOTHING
           RETURNING spu_code`,
          [
            finalCode, params.spuName, params.shortTitle, params.categoryCode, params.styleCode ?? null,
            params.outerPackLength ?? null, params.outerPackWidth ?? null,
            params.outerPackHeight ?? null, params.outerPackWeight ?? null,
            MACHINE_NAME,
          ]
        )

        if (insertRes.rowCount === 0) {
          throw new Error(`SPU 编码 ${finalCode} 已存在，请重试`)
        }

        await client.query('COMMIT')
        return { success: true, data: { spuCode: finalCode } }
      } catch (err) {
        await client?.query('ROLLBACK').catch(() => {})
        return { success: false, error: (err as Error).message }
      } finally {
        client?.release()
      }
    }
  )

  // 事务性保存 SPU 和 SKU 数据（按 database_spec.md §6 使用 DO NOTHING）
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

        // 写入 SPU（冲突时 DO NOTHING，检查返回值）
        const spuRes = await client.query(
          `INSERT INTO public.spus
             (spu_code, spu_name, category_code, style_code,
              outer_pack_length, outer_pack_width, outer_pack_height, outer_pack_weight,
              machine_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (spu_code) DO NOTHING
           RETURNING spu_code`,
          [
            spu.spuCode,
            spu.spuName,
            spu.categoryCode || null,
            spu.styleCode || null,
            spu.outerPackLength || null,
            spu.outerPackWidth || null,
            spu.outerPackHeight || null,
            spu.outerPackWeight || null,
            MACHINE_NAME,
          ]
        )

        if (spuRes.rowCount === 0) {
          throw new Error(`SPU 编码 ${spu.spuCode} 已存在，请更换产品名称后重试`)
        }

        // 批量写入 SKU（冲突时 DO NOTHING）
        for (const sku of skus) {
          const skuRes = await client.query(
            `INSERT INTO public.skus
               (sku_code, spu_code, color_name, dimensions,
                weight, cost_price, selling_price, machine_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (sku_code) DO NOTHING
             RETURNING sku_code`,
            [
              sku.skuCode,
              spu.spuCode,
              sku.colorName,
              sku.dimensions || null,
              sku.weight || null,
              sku.costPrice || null,
              sku.sellingPrice || null,
              MACHINE_NAME,
            ]
          )

          if (skuRes.rowCount === 0) {
            throw new Error(`SKU 编码 ${sku.skuCode} 已存在`)
          }
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

  // 写入单个 SKU（按 database_spec.md §7.3）
  ipcMain.handle(
    'db:createSku',
    async (
      _event,
      params: {
        spuCode: string
        categoryCode: string
        colorName: string
        styleCode: string
        indexInProduct: number
        dimensions?: string
        weight?: number
        costPrice?: number
        sellingPrice?: number
      }
    ): Promise<{ success: boolean; data?: { skuCode: string }; error?: string }> => {
      try {
        // SKU 编码 = {spuCode}-{类目码}-{风格码}-{4位序号}
        const skuCode = [
          params.spuCode,
          params.categoryCode,
          params.styleCode,
          String(params.indexInProduct).padStart(4, '0'),
        ].join('-')

        const res = await pool.query(
          `INSERT INTO public.skus
             (sku_code, spu_code, color_name, dimensions, weight,
              cost_price, selling_price, machine_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (sku_code) DO NOTHING
           RETURNING sku_code`,
          [
            skuCode, params.spuCode, params.colorName, params.dimensions ?? null,
            params.weight ?? null, params.costPrice ?? null, params.sellingPrice ?? null,
            MACHINE_NAME,
          ]
        )

        if (res.rowCount === 0) {
          throw new Error(`SKU 编码 ${skuCode} 已存在`)
        }

        return { success: true, data: { skuCode } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 写入素材记录（按 database_spec.md §7.4）
  ipcMain.handle(
    'db:recordAsset',
    async (
      _event,
      params: {
        spuCode: string
        skuCode?: string
        assetType: 'main_image' | 'sku_image' | 'detail_image' | 'video'
        filePath: string
        sortOrder?: number
      }
    ): Promise<{ success: boolean; data?: { id: number }; error?: string }> => {
      try {
        const res = await pool.query(
          `INSERT INTO public.assets
             (spu_code, sku_code, asset_type, file_path, machine_name, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id`,
          [
            params.spuCode,
            params.skuCode ?? null,
            params.assetType,
            params.filePath,
            MACHINE_NAME,
            params.sortOrder ?? 0,
          ]
        )

        return { success: true, data: { id: res.rows[0].id } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // ==================== Shopee 发布交互 API ====================

  // 查询当前机器待发布的产品素材（database_spec.md §8.1）
  ipcMain.handle(
    'db:fetchPendingProducts',
    async (): Promise<{
      success: boolean
      data?: Array<Record<string, unknown>>
      error?: string
    }> => {
      try {
        const { rows } = await pool.query(
          `SELECT
             s.spu_code, s.spu_name, s.category_code, s.style_code,
             s.outer_pack_length, s.outer_pack_width,
             s.outer_pack_height, s.outer_pack_weight,
             k.sku_code, k.color_name, k.dimensions,
             k.cost_price, k.selling_price,
             a.id AS asset_id, a.asset_type,
             a.file_path, a.sort_order
           FROM public.assets a
           JOIN public.spus  s ON a.spu_code = s.spu_code
           LEFT JOIN public.skus  k ON a.sku_code = k.sku_code
           WHERE a.status = 'pending'
             AND a.machine_name = $1
           ORDER BY s.spu_code, a.asset_type, a.sort_order`,
          [MACHINE_NAME]
        )
        return { success: true, data: rows }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 发布成功：更新素材状态 + 写发布日志（database_spec.md §8.2）
  ipcMain.handle(
    'db:markAssetPublished',
    async (
      _event,
      params: { assetId: number; shopeeItemId: string }
    ): Promise<{ success: boolean; error?: string }> => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // 更新素材状态
        await client.query(
          `UPDATE public.assets
           SET status = 'published', published_at = NOW()
           WHERE id = $1`,
          [params.assetId]
        )

        // 写入发布日志
        await client.query(
          `INSERT INTO public.publish_logs
             (spu_code, asset_id, machine_name, shopee_item_id, result)
           SELECT spu_code, id, machine_name, $2, 'success'
           FROM public.assets WHERE id = $1`,
          [params.assetId, params.shopeeItemId]
        )

        await client.query('COMMIT')
        return { success: true }
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        return { success: false, error: (err as Error).message }
      } finally {
        client.release()
      }
    }
  )

  // 发布失败：更新素材状态 + 记录错误日志（database_spec.md §8.3）
  ipcMain.handle(
    'db:markAssetFailed',
    async (
      _event,
      params: { assetId: number; errorMessage: string }
    ): Promise<{ success: boolean; error?: string }> => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // 更新素材状态
        await client.query(
          `UPDATE public.assets SET status = 'failed' WHERE id = $1`,
          [params.assetId]
        )

        // 写入失败日志
        await client.query(
          `INSERT INTO public.publish_logs
             (spu_code, asset_id, machine_name, result, error_message)
           SELECT spu_code, id, machine_name, 'failed', $2
           FROM public.assets WHERE id = $1`,
          [params.assetId, params.errorMessage]
        )

        await client.query('COMMIT')
        return { success: true }
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        return { success: false, error: (err as Error).message }
      } finally {
        client.release()
      }
    }
  )
}
