-- ============================================================
-- 素材分拣系统 — 数据库初始化脚本
-- 执行方式: psql -U postgres -f db/init.sql
-- ============================================================

-- 1. 创建数据库（如已存在请跳过）
-- CREATE DATABASE sorter WITH ENCODING='UTF8' TEMPLATE=template0;
-- \c sorter

-- 2. 创建应用用户
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sorter_user') THEN
    CREATE USER sorter_user WITH PASSWORD '请替换为强密码';
  END IF;
END$$;

GRANT CONNECT ON DATABASE sorter TO sorter_user;
GRANT USAGE ON SCHEMA public TO sorter_user;

-- 3. 序列
CREATE SEQUENCE IF NOT EXISTS spu_seq START 1 INCREMENT 1 NO CYCLE;

-- 4. 枚举类型
DO $$ BEGIN
  CREATE TYPE asset_type_enum AS ENUM ('main_image', 'sku_image', 'detail_image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_status_enum AS ENUM ('pending', 'published', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. SPU 表
CREATE TABLE IF NOT EXISTS public.spus (
  spu_code          TEXT        PRIMARY KEY,
  spu_name          TEXT        NOT NULL,
  short_title       TEXT,
  category_code     TEXT        NOT NULL,
  style_code        TEXT,
  outer_pack_length NUMERIC(10,2),
  outer_pack_width  NUMERIC(10,2),
  outer_pack_height NUMERIC(10,2),
  outer_pack_weight NUMERIC(10,2),
  machine_name      TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SKU 表
CREATE TABLE IF NOT EXISTS public.skus (
  sku_code      TEXT        PRIMARY KEY,
  spu_code      TEXT        NOT NULL REFERENCES public.spus(spu_code) ON DELETE CASCADE,
  color_name    TEXT,
  dimensions    TEXT,
  weight        NUMERIC(10,3),
  cost_price    NUMERIC(10,2),
  selling_price NUMERIC(10,2),
  machine_name  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_skus_spu_code ON public.skus(spu_code);

-- 7. 素材记录表
CREATE TABLE IF NOT EXISTS public.assets (
  id            BIGSERIAL           PRIMARY KEY,
  spu_code      TEXT                NOT NULL REFERENCES public.spus(spu_code) ON DELETE CASCADE,
  sku_code      TEXT                REFERENCES public.skus(sku_code) ON DELETE SET NULL,
  asset_type    asset_type_enum     NOT NULL,
  file_path     TEXT                NOT NULL,
  machine_name  TEXT                NOT NULL,
  status        asset_status_enum   NOT NULL DEFAULT 'pending',
  sort_order    SMALLINT            NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_assets_spu_code ON public.assets(spu_code);
CREATE INDEX IF NOT EXISTS idx_assets_sku_code ON public.assets(sku_code);
CREATE INDEX IF NOT EXISTS idx_assets_status   ON public.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_machine  ON public.assets(machine_name);

-- 8. 发布日志表
CREATE TABLE IF NOT EXISTS public.publish_logs (
  id             BIGSERIAL   PRIMARY KEY,
  spu_code       TEXT        NOT NULL,
  asset_id       BIGINT      REFERENCES public.assets(id) ON DELETE SET NULL,
  machine_name   TEXT        NOT NULL,
  shopee_item_id TEXT,
  result         TEXT        NOT NULL CHECK (result IN ('success', 'failed')),
  error_message  TEXT,
  executed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_publish_logs_spu_code ON public.publish_logs(spu_code);
CREATE INDEX IF NOT EXISTS idx_publish_logs_result   ON public.publish_logs(result);

-- 9. 授权（原始表）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO sorter_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO sorter_user;

-- ============================================================
-- 10. PIM 中台同步表（分拣系统写入，运营后续维护）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spu_code            VARCHAR(100) NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  description         TEXT,
  category            VARCHAR(100),
  local_path          TEXT,
  shopee_title_en     TEXT,
  shopee_title_zh     TEXT,
  shopee_desc_en      TEXT,
  shopee_desc_zh      TEXT,
  platforms_json      JSONB,
  images_json         JSONB,
  main_image_url      TEXT,
  r2_base_path        TEXT,
  r2_synced_at        TIMESTAMPTZ,
  tool_version        VARCHAR(20),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  pim_notes           TEXT,
  is_deleted          BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_spu_code ON public.products(spu_code);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

CREATE TABLE IF NOT EXISTS public.product_skus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spu_code        VARCHAR(100) NOT NULL REFERENCES public.products(spu_code) ON DELETE CASCADE,
  sku_code        VARCHAR(100) NOT NULL UNIQUE,
  name_zh         VARCHAR(200),
  name_en         VARCHAR(200),
  name_zh_custom  VARCHAR(200),
  name_en_custom  VARCHAR(200),
  weight_g        NUMERIC(10,2),
  size_json       JSONB,
  cost_price      NUMERIC(10,2),
  selling_price   NUMERIC(10,2),
  stock           INTEGER DEFAULT 0,
  image_url       TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_skus_spu_code ON public.product_skus(spu_code);

-- PIM 表授权
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products      TO sorter_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_skus  TO sorter_user;
GRANT SELECT, INSERT, UPDATE         ON public.products      TO pim_user;
GRANT SELECT, INSERT, UPDATE         ON public.product_skus  TO pim_user;

-- ============================================================
-- 初始化完成
-- ============================================================
