# 素材分拣系统 — 数据库开发规格文档

> 本文档供开发者阅读，描述数据库的完整结构、设计决策、以及与上层应用（分拣系统 + Shopee 自动化发布程序）的交互方式。请严格按照此规格进行实现。

---

## 1. 技术选型

| 项目 | 选择 |
|------|------|
| 数据库引擎 | PostgreSQL 15+ |
| 部署方式 | 公司内网某台常开电脑（Windows / Linux 均可） |
| 连接方式 | 局域网直连，固定内网 IP |
| 客户端驱动 | Node.js: `pg`（node-postgres） |

---

## 2. 整体架构说明

系统由两个独立程序共享同一个 PostgreSQL 数据库：

```
[员工电脑 A] ──写入──┐
[员工电脑 B] ──写入──┤──► [PostgreSQL 服务器（内网）] ◄──读取── [Shopee 自动化发布程序]
[员工电脑 C] ──写入──┘
```

- **分拣系统**（Electron 桌面应用）：负责生成产品信息与素材，写入数据库。
- **Shopee 自动化发布程序**：读取数据库中的产品信息与素材路径，自动填写并发布到 Shopee。
- 素材文件（图片）**保存在员工本机磁盘**，不上传至数据库。数据库只记录文件路径和来源机器名，由 Shopee 程序在对应电脑上直接读取本地文件。

---

## 3. 数据库初始化

### 3.1 创建数据库

```sql
CREATE DATABASE sorter
  WITH ENCODING = 'UTF8'
       LC_COLLATE = 'zh_CN.UTF-8'
       LC_CTYPE   = 'zh_CN.UTF-8'
       TEMPLATE   = template0;
```

> 如服务器系统 locale 不支持 `zh_CN.UTF-8`，改用 `en_US.UTF-8`，中文内容仍可正常存储。

### 3.2 允许局域网连接

编辑 PostgreSQL 配置文件：

**`postgresql.conf`**
```
listen_addresses = '*'
```

**`pg_hba.conf`**（追加一行，按实际内网网段修改）
```
host    sorter    sorter_user    192.168.1.0/24    md5
```

创建应用专用用户：
```sql
CREATE USER sorter_user WITH PASSWORD '请替换为强密码';
GRANT CONNECT ON DATABASE sorter TO sorter_user;
GRANT USAGE ON SCHEMA public TO sorter_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sorter_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sorter_user;
```

---

## 4. 表结构

共 4 张表，按依赖顺序建立：`spus` → `skus` → `assets` → `publish_logs`。

### 4.1 SPU 表（`public.spus`）

存储产品主款信息（Standard Product Unit，一个款式对应一条记录）。

```sql
CREATE TABLE public.spus (
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

COMMENT ON TABLE  public.spus IS '产品主款表，一款产品对应一条记录';
COMMENT ON COLUMN public.spus.spu_code IS '产品主编号，格式: {拼音首字母}{年月日}{4位序列号}，如 YXGW2406-0001';
COMMENT ON COLUMN public.spus.machine_name IS '生成该记录的电脑名，由 os.hostname() 自动获取';
```

### 4.2 SKU 表（`public.skus`）

存储产品变体信息（颜色、尺寸等维度，一个 SPU 对应多个 SKU）。

```sql
CREATE TABLE public.skus (
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

CREATE INDEX idx_skus_spu_code ON public.skus(spu_code);

COMMENT ON TABLE  public.skus IS '产品变体表，一个 SPU 对应多个 SKU';
COMMENT ON COLUMN public.skus.sku_code IS 'SKU编号，格式: {spu_code}-{类目码}-{风格码}-{4位序号}，如 YXGW2406-0001-BG-WT-0001，全局唯一';
COMMENT ON COLUMN public.skus.machine_name IS '生成该记录的电脑名，由 os.hostname() 自动获取';
```

### 4.3 素材记录表（`public.assets`）

记录每一份素材文件的元信息，是分拣系统与 Shopee 发布程序的数据桥梁。

```sql
CREATE TYPE asset_type_enum AS ENUM ('main_image', 'sku_image', 'detail_image', 'video');
CREATE TYPE asset_status_enum AS ENUM ('pending', 'published', 'failed', 'skipped');

CREATE TABLE public.assets (
  id            BIGSERIAL   PRIMARY KEY,
  spu_code      TEXT        NOT NULL REFERENCES public.spus(spu_code) ON DELETE CASCADE,
  sku_code      TEXT        REFERENCES public.skus(sku_code) ON DELETE SET NULL,
  asset_type    asset_type_enum NOT NULL,
  file_path     TEXT        NOT NULL,
  machine_name  TEXT        NOT NULL,
  status        asset_status_enum NOT NULL DEFAULT 'pending',
  sort_order    SMALLINT    NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX idx_assets_spu_code    ON public.assets(spu_code);
CREATE INDEX idx_assets_sku_code    ON public.assets(sku_code);
CREATE INDEX idx_assets_status      ON public.assets(status);
CREATE INDEX idx_assets_machine     ON public.assets(machine_name);

COMMENT ON TABLE  public.assets IS '素材文件记录表，素材实体存在员工本机，此处只记录路径和来源机器';
COMMENT ON COLUMN public.assets.file_path IS '素材在来源电脑上的完整绝对路径，如 C:\\sorter\\output\\YXGW2406-0001\\main.jpg';
COMMENT ON COLUMN public.assets.machine_name IS '素材所在电脑的机器名，Shopee程序据此定位文件';
COMMENT ON COLUMN public.assets.sku_code IS '主图（main_image）此字段为 NULL；SKU图关联具体变体';
COMMENT ON COLUMN public.assets.sort_order IS '同一产品同类素材的排列顺序，从 0 开始';
COMMENT ON COLUMN public.assets.status IS 'pending=待发布, published=已发布, failed=发布失败, skipped=已跳过';
```

### 4.4 发布日志表（`public.publish_logs`）

记录每次 Shopee 发布的执行结果，便于排查问题和重试。

```sql
CREATE TABLE public.publish_logs (
  id            BIGSERIAL   PRIMARY KEY,
  spu_code      TEXT        NOT NULL,
  asset_id      BIGINT      REFERENCES public.assets(id) ON DELETE SET NULL,
  machine_name  TEXT        NOT NULL,
  shopee_item_id TEXT,
  result        TEXT        NOT NULL CHECK (result IN ('success', 'failed')),
  error_message TEXT,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_publish_logs_spu_code ON public.publish_logs(spu_code);
CREATE INDEX idx_publish_logs_result   ON public.publish_logs(result);

COMMENT ON TABLE  public.publish_logs IS 'Shopee 自动化发布的执行日志';
COMMENT ON COLUMN public.publish_logs.shopee_item_id IS '发布成功后 Shopee 返回的商品 ID';
```

---

## 5. 编码规则（重要）

### 5.1 SPU 编码

**格式：** `{拼音首字母(最多4位)}{年月日6位}{4位序列号}`

示例：`YXGW240601-0001`

**生成方式：** 序列号由数据库序列自动分配，不依赖前端 localStorage，彻底避免重复。

```sql
-- 创建全局序列
CREATE SEQUENCE spu_seq START 1 INCREMENT 1 NO CYCLE;
```

应用层拼接编码（在 `dbHandlers.ts` 中实现）：
```typescript
// 从数据库取下一个序列值
const { rows } = await db.query("SELECT NEXTVAL('spu_seq') AS seq");
const seq = String(rows[0].seq).padStart(4, '0');
const dateStr = new Date().toISOString().slice(2, 8).replace(/-/g, ''); // 如 240601
const initials = toPinyinInitials(shortTitle).slice(0, 4).toUpperCase();
const spuCode = `${initials}${dateStr}-${seq}`;  // 如 YXGW240601-0001
```

> `NEXTVAL` 是数据库原子操作，多台电脑并发调用也不会产生重复值。

### 5.2 SKU 编码

**格式：** `{spu_code}-{类目码}-{风格码}-{4位组内序号}`

示例：`YXGW240601-0001-BG-WT-0001`

SKU 编码以 SPU 编码为前缀，保证**跨所有产品的全局唯一性**。

---

## 6. 冲突处理策略

所有写入操作使用 `ON CONFLICT DO NOTHING` + 检测返回行数，**不使用静默覆盖**：

```sql
-- SPU 写入
INSERT INTO public.spus (spu_code, spu_name, ...)
VALUES ($1, $2, ...)
ON CONFLICT (spu_code) DO NOTHING
RETURNING spu_code;
-- 若 rowCount === 0，说明该编码已存在，应用层抛出错误提示用户
```

```sql
-- SKU 写入
INSERT INTO public.skus (sku_code, spu_code, ...)
VALUES ($1, $2, ...)
ON CONFLICT (sku_code) DO NOTHING
RETURNING sku_code;
```

> **不使用 `DO UPDATE`** 的原因：静默覆盖会在机器名或计数器异常时将旧数据无声替换，难以排查。改为报错，让用户感知并处理。

---

## 7. 分拣系统写入示例（Node.js）

以下为 `src/main/ipc/dbHandlers.ts` 中的参考实现。

### 7.1 数据库连接配置

```typescript
// src/main/db.ts
import { Pool } from 'pg';
import os from 'os';

export const pool = new Pool({
  host:     process.env.DB_HOST     || '192.168.1.100',  // 服务器内网 IP
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'sorter',
  user:     process.env.DB_USER     || 'sorter_user',
  password: process.env.DB_PASSWORD || '',
  max: 5,           // 小团队，最多5个连接
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 导出当前机器名，供各处调用
export const MACHINE_NAME = os.hostname();
```

### 7.2 生成 SPU 编码并写入

```typescript
// src/main/ipc/dbHandlers.ts
import { pool, MACHINE_NAME } from '../db';

export async function createSpu(params: {
  shortTitle: string;
  spuName: string;
  categoryCode: string;
  styleCode?: string;
  outerPackLength?: number;
  outerPackWidth?: number;
  outerPackHeight?: number;
  outerPackWeight?: number;
}): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 从数据库取全局唯一序列号
    const seqRes = await client.query("SELECT NEXTVAL('spu_seq') AS seq");
    const seq = String(seqRes.rows[0].seq).padStart(4, '0');

    // 2. 拼接 SPU 编码
    const dateStr = new Date().toISOString().slice(2, 8).replace(/-/g, '');
    const initials = toPinyinInitials(params.shortTitle).slice(0, 4).toUpperCase();
    const spuCode = `${initials}${dateStr}-${seq}`;

    // 3. 写入数据库
    const insertRes = await client.query(
      `INSERT INTO public.spus
         (spu_code, spu_name, short_title, category_code, style_code,
          outer_pack_length, outer_pack_width, outer_pack_height, outer_pack_weight,
          machine_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (spu_code) DO NOTHING
       RETURNING spu_code`,
      [
        spuCode, params.spuName, params.shortTitle, params.categoryCode, params.styleCode ?? null,
        params.outerPackLength ?? null, params.outerPackWidth ?? null,
        params.outerPackHeight ?? null, params.outerPackWeight ?? null,
        MACHINE_NAME,
      ]
    );

    if (insertRes.rowCount === 0) {
      throw new Error(`SPU 编码 ${spuCode} 已存在，请重试`);
    }

    await client.query('COMMIT');
    return spuCode;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### 7.3 写入 SKU

```typescript
export async function createSku(params: {
  spuCode: string;
  categoryCode: string;
  colorName: string;
  styleCode: string;
  indexInProduct: number;   // 该 SKU 在本产品中的序号，从 1 开始
  dimensions?: string;
  weight?: number;
  costPrice?: number;
  sellingPrice?: number;
}): Promise<string> {
  // SKU 编码 = {spuCode}-{类目码}-{风格码}-{4位序号}
  const skuCode = [
    params.spuCode,
    params.categoryCode,
    params.styleCode,
    String(params.indexInProduct).padStart(4, '0'),
  ].join('-');

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
  );

  if (res.rowCount === 0) {
    throw new Error(`SKU 编码 ${skuCode} 已存在`);
  }
  return skuCode;
}
```

### 7.4 写入素材记录

```typescript
export async function recordAsset(params: {
  spuCode: string;
  skuCode?: string;            // 主图传 undefined
  assetType: 'main_image' | 'sku_image' | 'detail_image' | 'video';
  filePath: string;            // 本机绝对路径
  sortOrder?: number;
}): Promise<number> {
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
  );
  return res.rows[0].id;
}
```

---

## 8. Shopee 自动化程序读取示例（Node.js）

### 8.1 查询待发布产品（当前机器）

```typescript
import { pool, MACHINE_NAME } from '../db';

export async function fetchPendingProducts() {
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
  );
  return rows;
}
```

> **关键点**：Shopee 自动化程序只处理 `machine_name = os.hostname()` 的素材。
> 素材文件在本机，直接用 `file_path` 读取，无需网络传输。

### 8.2 发布成功后更新状态

```typescript
export async function markAssetPublished(assetId: number, shopeeItemId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 更新素材状态
    await client.query(
      `UPDATE public.assets
       SET status = 'published', published_at = NOW()
       WHERE id = $1`,
      [assetId]
    );

    // 写入发布日志
    await client.query(
      `INSERT INTO public.publish_logs
         (spu_code, asset_id, machine_name, shopee_item_id, result)
       SELECT spu_code, id, machine_name, $2, 'success'
       FROM public.assets WHERE id = $1`,
      [assetId, shopeeItemId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### 8.3 发布失败后记录错误

```typescript
export async function markAssetFailed(assetId: number, errorMessage: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE public.assets SET status = 'failed' WHERE id = $1`,
      [assetId]
    );

    await client.query(
      `INSERT INTO public.publish_logs
         (spu_code, asset_id, machine_name, result, error_message)
       SELECT spu_code, id, machine_name, 'failed', $2
       FROM public.assets WHERE id = $1`,
      [assetId, errorMessage]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

---

## 9. 完整建库脚本（一键执行）

将以下内容保存为 `db/init.sql`，在服务器上以 postgres 超级用户执行一次即可完成所有初始化：

```sql
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

-- 9. 授权
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO sorter_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO sorter_user;

-- ============================================================
-- 初始化完成
-- ============================================================
```

---

## 10. 环境变量配置

在分拣系统和 Shopee 程序的根目录各创建一个 `.env` 文件（不要提交到 git）：

```env
DB_HOST=192.168.1.100
DB_PORT=5432
DB_NAME=sorter
DB_USER=sorter_user
DB_PASSWORD=请替换为强密码
```

在程序入口处加载：
```typescript
import 'dotenv/config';  // npm install dotenv
```

---

## 11. 注意事项

1. **`file_path` 的路径分隔符**：Windows 路径含反斜杠 `\`，存入数据库时原样保存即可。Shopee 程序读取后直接用 `fs.readFileSync(file_path)` 在本机打开。

2. **Shopee 程序只能运行在素材所在的电脑上**：程序启动时通过 `WHERE machine_name = os.hostname()` 过滤，确保只处理本机的素材。若需要在另一台机器发布，该机器需要运行自己的 Shopee 程序实例。

3. **`updated_at` 自动更新**：可选择添加触发器自动维护，或在应用层手动传入 `NOW()`。

4. **数据库备份**：建议在服务器上配置每日 `pg_dump` 定时任务，备份文件保存到另一台机器或移动硬盘。

5. **`spu_seq` 序列只增不减**：即使某条 SPU 被删除，序列号不会回收，这是正确行为，确保编码不重复。
