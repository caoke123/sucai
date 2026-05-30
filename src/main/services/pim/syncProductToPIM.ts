// ==================== PIM 中台数据同步模块 ====================
// 分拣完成后将产品数据写入 PIM 专用表 (products / product_skus)
// 字段保护策略：分拣系统字段每次覆盖，运营字段 COALESCE 保护

import type { Pool, PoolClient } from 'pg'
import type { ProductOutput } from '@shared/types'

function nullIfEmpty(v: string | null | undefined): string | null {
  if (v === '' || v === undefined || v === null) return null
  return v
}

export async function syncProductToPIM(product: ProductOutput, db: Pool | PoolClient): Promise<void> {
  const mainImageUrl = product.images?.main?.[0]?.r2Url ?? null

  // 1. 写入 products 表
  // ON CONFLICT 策略：
  //   分拣系统负责的字段 → 每次都覆盖
  //   运营负责的字段 → COALESCE 保护，原值不为 NULL 则不覆盖
  await db.query(
    `INSERT INTO products (
      spu_code, title, description, category, local_path,
      shopee_title_en, shopee_desc_en, platforms_json, images_json,
      main_image_url, r2_base_path, r2_synced_at, tool_version,
      status, pim_notes, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, now()
    )
    ON CONFLICT (spu_code) DO UPDATE SET
      -- 分拣系统字段，每次覆盖
      title             = EXCLUDED.title,
      local_path        = EXCLUDED.local_path,
      shopee_title_en   = EXCLUDED.shopee_title_en,
      shopee_desc_en    = EXCLUDED.shopee_desc_en,
      platforms_json    = EXCLUDED.platforms_json,
      images_json       = EXCLUDED.images_json,
      main_image_url    = EXCLUDED.main_image_url,
      r2_base_path      = EXCLUDED.r2_base_path,
      r2_synced_at      = EXCLUDED.r2_synced_at,
      tool_version      = EXCLUDED.tool_version,
      updated_at        = now(),
      -- 运营字段，COALESCE 保护：原值不为 NULL 则保留原值
      description       = COALESCE(products.description, EXCLUDED.description),
      category          = COALESCE(products.category, EXCLUDED.category),
      shopee_title_zh   = COALESCE(products.shopee_title_zh, NULL),
      shopee_desc_zh    = COALESCE(products.shopee_desc_zh, NULL),
      pim_notes         = COALESCE(products.pim_notes, EXCLUDED.pim_notes),
      status            = COALESCE(products.status, EXCLUDED.status)`,
    [
      product.productNo,                            // $1  spu_code
      product.internal.title,                       // $2  title
      product.internal.description,                 // $3  description
      product.internal.category,                    // $4  category
      product.internal.localPath,                   // $5  local_path
      product.platforms?.shopee?.title ?? null,     // $6  shopee_title_en
      product.platforms?.shopee?.description ?? null, // $7 shopee_desc_en
      product.platforms ?? null,                       // $8  platforms_json (pg 自动序列化为 jsonb)
      product.images ?? null,                          // $9  images_json (pg 自动序列化为 jsonb)
      mainImageUrl,                                 // $10 main_image_url
      product.r2?.basePath ?? null,                 // $11 r2_base_path
      nullIfEmpty(product.r2?.syncedAt),            // $12 r2_synced_at（空字符串 → null）
      product.toolVersion,                          // $13 tool_version
      product.pim?.status ?? 'pending',             // $14 status
      product.pim?.notes ?? null,                   // $15 pim_notes
      nullIfEmpty(product.createdAt),               // $16 created_at（空字符串 → null）
    ]
  )

  // 2. 写入 product_skus 表
  // 每个 SKU 单独 upsert
  for (const sku of product.skus) {
    await db.query(
      `INSERT INTO product_skus (
        spu_code, sku_code, name_zh, name_en,
        weight_g, size_json, cost_price, selling_price,
        stock, image_url, sort_order, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now()
      )
      ON CONFLICT (sku_code) DO UPDATE SET
        -- 分拣系统字段，每次覆盖
        spu_code      = EXCLUDED.spu_code,
        name_zh       = EXCLUDED.name_zh,
        name_en       = EXCLUDED.name_en,
        image_url     = EXCLUDED.image_url,
        sort_order    = EXCLUDED.sort_order,
        updated_at    = now(),
        -- 运营字段，COALESCE 保护
        weight_g      = COALESCE(product_skus.weight_g, EXCLUDED.weight_g),
        size_json     = COALESCE(product_skus.size_json, EXCLUDED.size_json),
        cost_price    = COALESCE(product_skus.cost_price, EXCLUDED.cost_price),
        selling_price = COALESCE(product_skus.selling_price, EXCLUDED.selling_price),
        stock         = COALESCE(product_skus.stock, EXCLUDED.stock),
        -- 运营自定义字段，永不覆盖
        name_zh_custom = COALESCE(product_skus.name_zh_custom, NULL),
        name_en_custom = COALESCE(product_skus.name_en_custom, NULL)`,
      [
        product.productNo,                          // $1  spu_code
        sku.skuCode,                                // $2  sku_code
        sku.nameZh,                                 // $3  name_zh
        sku.nameEn,                                 // $4  name_en
        sku.weight,                                 // $5  weight_g (JSON单位为g)
        sku.size ?? null,                             // $6  size_json (pg 自动序列化为 jsonb)
        sku.pricing?.cost ?? null,                  // $7  cost_price
        sku.pricing?.selling ?? null,               // $8  selling_price
        sku.stock ?? 0,                             // $9  stock
        sku.images?.primary?.r2Url ?? null,         // $10 image_url
        sku.index ?? 0,                             // $11 sort_order
      ]
    )
  }
}
