# 素材分拣系统数据库结构文档（PostgreSQL）v2.0

> 数据来源：PostgreSQL 实际数据库结构
> 查询时间：2026-05-29
> 数据库：`sorter`
> Schema：`public`
> 版本：v2.0（含 PIM 中台同步表）

---

# 一、数据库概览

| 项目 | 值 |
|---|---|
| 数据库名称 | `sorter` |
| Schema | `public` |
| 当前数据库用户 | `pim_user` |
| init.sql 定义用户 | `sorter_user` |
| 表数量 | 6 |
| 序列数量 | 3 |
| 枚举类型数量 | 2 |
| 索引数量 | 18 |
| 外键数量 | 5 |

---

# 二、数据库整体设计说明

本数据库用于：

- 商品 SPU/SKU 管理
- 素材文件管理
- 素材发布状态管理
- 发布日志记录
- 多机器素材同步识别
- **PIM 中台数据同步**（v2.0 新增）

系统采用：

- PostgreSQL 16+
- 文本业务主键（spus/skus）+ UUID 主键（PIM 表）
- 外键级联
- 素材状态枚举
- 多机协同识别
- **JSONB 半结构化数据**（v2.0 新增）
- **COALESCE 字段保护策略**（v2.0 新增）

数据库整体关系：

```text
v1.0 分拣层:
  SPU
   ├── SKU
   │     └── Assets
   │             └── Publish Logs
   └── Assets

v2.0 PIM 层:
  Products
   └── Product SKUs
```

---

# 三、表结构总览

| 表名 | 用途 | 版本 |
|---|---|---|
| `spus` | 产品主款表（SPU）| v1.0 |
| `skus` | 产品变体表（SKU）| v1.0 |
| `assets` | 素材文件记录表 | v1.0 |
| `publish_logs` | 发布日志表 | v1.0 |
| `products` | PIM 中台产品主表 | v2.0 |
| `product_skus` | PIM 中台 SKU 表 | v2.0 |

---

# 四、枚举类型（ENUM）

---

## 4.1 `asset_type_enum`

素材类型枚举。

| 枚举值 | 说明 |
|---|---|
| `main_image` | 主图 |
| `sku_image` | SKU 图 |
| `detail_image` | 详情图 |
| `video` | 视频 |

---

## 4.2 `asset_status_enum`

素材状态枚举。

| 枚举值 | 说明 |
|---|---|
| `pending` | 待发布 |
| `published` | 已发布 |
| `failed` | 发布失败 |
| `skipped` | 已跳过 |

---

# 五、序列（Sequences）

| 序列名 | 用途 |
|---|---|
| `spu_seq` | SPU 编码自增序列 |
| `assets_id_seq` | assets 表 BIGSERIAL 主键自增 |
| `publish_logs_id_seq` | publish_logs 表 BIGSERIAL 主键自增 |

---

# 六、数据表详细结构

---

# 6.1 `spus` — 产品主款表

用于保存商品主款信息。

## 表说明

- 一个 SPU 可对应多个 SKU
- 一个 SPU 可对应多个素材
- 使用业务主键 `spu_code`
- SPU 编码由拼音首字母 + 日期 + 序列号组成

---

## 字段结构

| 字段名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `spu_code` | TEXT | NO | — | SPU 主键编码（如 `KAXG260529-0001`）|
| `spu_name` | TEXT | NO | — | 产品名称 |
| `short_title` | TEXT | YES | — | 短标题（用于编码拼音前缀提取）|
| `category_code` | TEXT | NO | — | 类目编码（BG/PH/CR/TO/XX）|
| `style_code` | TEXT | YES | — | 风格编码 |
| `outer_pack_length` | NUMERIC(10,2) | YES | — | 外箱长度（cm）|
| `outer_pack_width` | NUMERIC(10,2) | YES | — | 外箱宽度（cm）|
| `outer_pack_height` | NUMERIC(10,2) | YES | — | 外箱高度（cm）|
| `outer_pack_weight` | NUMERIC(10,2) | YES | — | 外箱重量（kg）|
| `machine_name` | TEXT | NO | — | 创建机器名称 |
| `created_at` | TIMESTAMPTZ | NO | NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | 更新时间 |

---

## 主键

```sql
PRIMARY KEY (spu_code)
```

---

## 被引用关系

```text
skus.spu_code
assets.spu_code
```

---

# 6.2 `skus` — 产品变体表

用于保存商品 SKU 信息。

---

## 字段结构

| 字段名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `sku_code` | TEXT | NO | — | SKU 主键编码（如 `KAXG260529-0001-BG-RD-0001`）|
| `spu_code` | TEXT | NO | — | 关联 SPU |
| `color_name` | TEXT | YES | — | 颜色/规格名 |
| `dimensions` | TEXT | YES | — | 尺寸（如 `8x8x12`）|
| `weight` | NUMERIC(10,3) | YES | — | 重量（kg）|
| `cost_price` | NUMERIC(10,2) | YES | — | 成本价（元）|
| `selling_price` | NUMERIC(10,2) | YES | — | 售价（元）|
| `machine_name` | TEXT | NO | — | 创建机器名 |
| `created_at` | TIMESTAMPTZ | NO | NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | 更新时间 |

---

## 主键

```sql
PRIMARY KEY (sku_code)
```

---

## 外键

```sql
FOREIGN KEY (spu_code)
REFERENCES spus(spu_code)
ON DELETE CASCADE
```

---

## 索引

| 索引名 | 字段 |
|---|---|
| `idx_skus_spu_code` | `spu_code` |

---

# 6.3 `assets` — 素材记录表

用于管理商品素材文件。

支持：

- 主图
- SKU 图
- 详情图
- 视频

---

## 字段结构

| 字段名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | BIGINT | NO | BIGSERIAL | 主键 ID |
| `spu_code` | TEXT | NO | — | 关联 SPU |
| `sku_code` | TEXT | YES | — | 关联 SKU |
| `asset_type` | asset_type_enum | NO | — | 素材类型 |
| `file_path` | TEXT | NO | — | 文件绝对路径 |
| `machine_name` | TEXT | NO | — | 文件所属机器 |
| `status` | asset_status_enum | NO | 'pending' | 发布状态 |
| `sort_order` | SMALLINT | NO | 0 | 排序值 |
| `created_at` | TIMESTAMPTZ | NO | NOW() | 创建时间 |
| `published_at` | TIMESTAMPTZ | YES | — | 发布时间 |

---

## 主键

```sql
PRIMARY KEY (id)
```

---

## 外键

### SPU 外键

```sql
FOREIGN KEY (spu_code)
REFERENCES spus(spu_code)
ON DELETE CASCADE
```

### SKU 外键

```sql
FOREIGN KEY (sku_code)
REFERENCES skus(sku_code)
ON DELETE SET NULL
```

---

## 索引

| 索引名 | 字段 |
|---|---|
| `idx_assets_spu_code` | `spu_code` |
| `idx_assets_sku_code` | `sku_code` |
| `idx_assets_status` | `status` |
| `idx_assets_machine` | `machine_name` |

---

# 6.4 `publish_logs` — 发布日志表

用于记录素材发布结果。

---

## 字段结构

| 字段名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | BIGINT | NO | BIGSERIAL | 主键 ID |
| `spu_code` | TEXT | NO | — | 关联 SPU |
| `asset_id` | BIGINT | YES | — | 关联素材 |
| `machine_name` | TEXT | NO | — | 执行机器 |
| `shopee_item_id` | TEXT | YES | — | Shopee 商品 ID |
| `result` | TEXT | NO | — | 发布结果（CHECK: 'success'/'failed'）|
| `error_message` | TEXT | YES | — | 错误信息 |
| `executed_at` | TIMESTAMPTZ | NO | NOW() | 执行时间 |

---

## 主键

```sql
PRIMARY KEY (id)
```

---

## 外键

```sql
FOREIGN KEY (asset_id)
REFERENCES assets(id)
ON DELETE SET NULL
```

---

## 索引

| 索引名 | 字段 |
|---|---|
| `idx_publish_logs_spu_code` | `spu_code` |
| `idx_publish_logs_result` | `result` |

---

# 6.5 `products` — PIM 中台产品主表（v2.0 新增）

PIM 中台产品主表，由分拣系统写入初始数据，后续由运营在 PIM 界面修改维护。

## 表说明

- `spu_code` 为 UNIQUE 业务键，与分拣系统 `spus` 表一一对应
- 分拣字段与运营字段分离，重分拣时仅覆盖分拣字段
- 使用 UUID 主键（`gen_random_uuid()`）
- 支持软删除（`is_deleted`）

---

## 字段结构

| # | 字段名 | 类型 | 可空 | 默认值 | 负责方 | 说明 |
|---|---|---|---|---|---|---|
| 1 | `id` | UUID | NO | gen_random_uuid() | 系统 | 主键 |
| 2 | `spu_code` | VARCHAR(100) | NO | — | 分拣 | SPU 编码，UNIQUE |
| 3 | `title` | TEXT | NO | — | 分拣 | 产品中文标题 |
| 4 | `description` | TEXT | YES | — | 运营 | 产品描述 |
| 5 | `category` | VARCHAR(100) | YES | — | 运营 | 类目名称 |
| 6 | `local_path` | TEXT | YES | — | 分拣 | 本地素材包路径 |
| 7 | `shopee_title_en` | TEXT | YES | — | 分拣 | Shopee 英文标题 |
| 8 | `shopee_title_zh` | TEXT | YES | — | 运营 | Shopee 中文标题 |
| 9 | `shopee_desc_en` | TEXT | YES | — | 分拣 | Shopee 英文描述 |
| 10 | `shopee_desc_zh` | TEXT | YES | — | 运营 | Shopee 中文描述 |
| 11 | `platforms_json` | JSONB | YES | — | 分拣 | 平台信息（Shopee 等）|
| 12 | `images_json` | JSONB | YES | — | 分拣 | 图片清单（main/detail）|
| 13 | `main_image_url` | TEXT | YES | — | 分拣 | 首张主图 R2 URL |
| 14 | `r2_base_path` | TEXT | YES | — | 分拣 | R2 存储基础路径 |
| 15 | `r2_synced_at` | TIMESTAMPTZ | YES | — | 分拣 | R2 同步时间 |
| 16 | `tool_version` | VARCHAR(20) | YES | — | 分拣 | 分拣工具版本号 |
| 17 | `status` | VARCHAR(20) | NO | 'pending' | 运营 | 产品状态 |
| 18 | `pim_notes` | TEXT | YES | — | 运营 | PIM 运营备注 |
| 19 | `is_deleted` | BOOLEAN | YES | FALSE | 运营 | 软删除标记 |
| 20 | `created_at` | TIMESTAMPTZ | NO | NOW() | 系统 | 创建时间 |
| 21 | `updated_at` | TIMESTAMPTZ | NO | NOW() | 系统 | 更新时间 |

---

## 主键

```sql
PRIMARY KEY (id)
```

---

## 唯一约束

```sql
UNIQUE (spu_code)
```

---

## 索引

| 索引名 | 字段 |
|---|---|
| `idx_products_spu_code` | `spu_code` |
| `idx_products_status` | `status` |

---

## JSONB 字段结构

### `platforms_json`

```json
{
  "shopee": {
    "title": "英文标题",
    "description": "英文描述",
    "category": ["类目路径"],
    "attributes": { "brand": "...", "origin": "...", "材质": "...", "图案": "...", "商品类型": "...", "Custom Product": "..." },
    "logistics": { "leadTime": 7, "minimumOrderQty": 1, "jit": false },
    "invitation": { "code": "..." },
    "status": "draft",
    "publishedAt": null,
    "shopeeItemId": null
  }
}
```

### `images_json`

```json
{
  "main": [
    { "index": 0, "fileName": "主图_1.jpg", "localPath": "D:/...", "r2Url": "https://..." }
  ],
  "detail": [
    { "index": 0, "fileName": "详情图_1.jpg", "localPath": "D:/...", "r2Url": "https://..." }
  ]
}
```

---

## 字段保护策略（ON CONFLICT DO UPDATE）

分拣系统使用 `ON CONFLICT (spu_code) DO UPDATE` 写入，字段分三类处理：

### 分拣字段（每次覆盖）

`title`, `local_path`, `shopee_title_en`, `shopee_desc_en`, `platforms_json`, `images_json`, `main_image_url`, `r2_base_path`, `r2_synced_at`, `tool_version`

### 运营字段（COALESCE 保护，原值不为 NULL 则保留）

`description`, `category`, `pim_notes`, `status`

```sql
description = COALESCE(products.description, EXCLUDED.description)
```

### 运营默认空字段（永不覆盖）

`shopee_title_zh`, `shopee_desc_zh`

```sql
shopee_title_zh = COALESCE(products.shopee_title_zh, NULL)
```

---

# 6.6 `product_skus` — PIM 中台 SKU 表（v2.0 新增）

PIM 中台 SKU 表，由分拣系统写入初始数据，后续由运营在 PIM 界面修改维护。

## 表说明

- `sku_code` 为 UNIQUE 业务键
- 分拣字段与运营字段分离
- 运营可自定义中英文名（`name_zh_custom` / `name_en_custom`）
- 使用 UUID 主键

---

## 字段结构

| # | 字段名 | 类型 | 可空 | 默认值 | 负责方 | 说明 |
|---|---|---|---|---|---|---|
| 1 | `id` | UUID | NO | gen_random_uuid() | 系统 | 主键 |
| 2 | `spu_code` | VARCHAR(100) | NO | — | 分拣 | 外键 → products.spu_code（CASCADE）|
| 3 | `sku_code` | VARCHAR(100) | NO | — | 分拣 | SKU 编码，UNIQUE |
| 4 | `name_zh` | VARCHAR(200) | YES | — | 分拣 | SKU 中文名 |
| 5 | `name_en` | VARCHAR(200) | YES | — | 分拣 | SKU 英文名 |
| 6 | `name_zh_custom` | VARCHAR(200) | YES | — | 运营 | 运营自定义中文名 |
| 7 | `name_en_custom` | VARCHAR(200) | YES | — | 运营 | 运营自定义英文名 |
| 8 | `weight_g` | NUMERIC(10,2) | YES | — | 运营 | 重量（g）|
| 9 | `size_json` | JSONB | YES | — | 运营 | 尺寸对象 |
| 10 | `cost_price` | NUMERIC(10,2) | YES | — | 运营 | 成本价（元）|
| 11 | `selling_price` | NUMERIC(10,2) | YES | — | 运营 | 售价（元）|
| 12 | `stock` | INTEGER | YES | 0 | 运营 | 库存 |
| 13 | `image_url` | TEXT | YES | — | 分拣 | SKU 主图 R2 URL |
| 14 | `sort_order` | INTEGER | YES | 0 | 分拣 | 排序号 |
| 15 | `created_at` | TIMESTAMPTZ | NO | NOW() | 系统 | 创建时间 |
| 16 | `updated_at` | TIMESTAMPTZ | NO | NOW() | 系统 | 更新时间 |

---

## 主键

```sql
PRIMARY KEY (id)
```

---

## 唯一约束

```sql
UNIQUE (sku_code)
```

---

## 外键

```sql
FOREIGN KEY (spu_code)
REFERENCES products(spu_code)
ON DELETE CASCADE
```

---

## 索引

| 索引名 | 字段 |
|---|---|
| `idx_product_skus_spu_code` | `spu_code` |

---

## JSONB 字段结构

### `size_json`

```json
{
  "length": 8,
  "width": 8,
  "height": 12,
  "unit": "cm"
}
```

---

## 字段保护策略（ON CONFLICT DO UPDATE）

### 分拣字段（每次覆盖）

`spu_code`, `name_zh`, `name_en`, `image_url`, `sort_order`

### 运营字段（COALESCE 保护）

`weight_g`, `size_json`, `cost_price`, `selling_price`, `stock`

```sql
weight_g = COALESCE(product_skus.weight_g, EXCLUDED.weight_g)
```

### 运营自定义字段（永不覆盖）

`name_zh_custom`, `name_en_custom`

```sql
name_zh_custom = COALESCE(product_skus.name_zh_custom, NULL)
```

---

# 七、索引汇总

| 索引名 | 表 | 字段 | 类型 |
|---|---|---|---|
| `spus_pkey` | spus | spu_code | UNIQUE BTREE |
| `skus_pkey` | skus | sku_code | UNIQUE BTREE |
| `idx_skus_spu_code` | skus | spu_code | BTREE |
| `assets_pkey` | assets | id | UNIQUE BTREE |
| `idx_assets_spu_code` | assets | spu_code | BTREE |
| `idx_assets_sku_code` | assets | sku_code | BTREE |
| `idx_assets_status` | assets | status | BTREE |
| `idx_assets_machine` | assets | machine_name | BTREE |
| `publish_logs_pkey` | publish_logs | id | UNIQUE BTREE |
| `idx_publish_logs_spu_code` | publish_logs | spu_code | BTREE |
| `idx_publish_logs_result` | publish_logs | result | BTREE |
| `products_pkey` | products | id | UNIQUE BTREE |
| `products_spu_code_key` | products | spu_code | UNIQUE BTREE |
| `idx_products_spu_code` | products | spu_code | BTREE |
| `idx_products_status` | products | status | BTREE |
| `product_skus_pkey` | product_skus | id | UNIQUE BTREE |
| `product_skus_sku_code_key` | product_skus | sku_code | UNIQUE BTREE |
| `idx_product_skus_spu_code` | product_skus | spu_code | BTREE |

---

# 八、外键关系汇总

| 子表 | 子字段 | 父表 | 父字段 | 删除策略 |
|---|---|---|---|---|
| `skus` | `spu_code` | `spus` | `spu_code` | CASCADE |
| `assets` | `spu_code` | `spus` | `spu_code` | CASCADE |
| `assets` | `sku_code` | `skus` | `sku_code` | SET NULL |
| `publish_logs` | `asset_id` | `assets` | `id` | SET NULL |
| `product_skus` | `spu_code` | `products` | `spu_code` | CASCADE |

---

# 九、ER 关系图

```text
v1.0 分拣层:
spus (1)
 ├── (N) skus
 │         └── (N) assets
 │                     └── (N) publish_logs
 │
 └── (N) assets

v2.0 PIM 中台层:
products (1)
 └── (N) product_skus
```

---

# 十、编码规则

## 10.1 SPU 编码

```
{拼音首字母4位}{YYMMDD}-{4位序列号}
```

- 拼音首字母从 `shortTitle` 提取（中文 → 拼音首字母，英文/数字 → 直接取用）
- `shortTitle` 为空时回退到 `spuName`（v2.0 修复）
- 序列号从 PostgreSQL `spu_seq` 序列获取（全局自增，不重复）
- 示例：`KAXG260529-0001`（可爱小熊 → KAXG, 2026-05-29, 0001）

## 10.2 SKU 编码

```
{spuCode}-{类目码}-{风格码}-{4位组内序号}
```

- 类目码：BG（包包挂件）/ PH（手机挂件）/ CR（车内配饰）/ TO（毛绒玩具）/ XX（未知）
- 风格码：由颜色名通过 STYLE_CODE_MAP 映射（如 红色→RD, 白色→WT, 其他→MX）
- 示例：`KAXG260529-0001-BG-RD-0001`

---

# 十一、JSONB 操作参考

## 11.1 常用操作符

| 操作符 | 说明 | 示例 |
|---|---|---|
| `->` | 取 JSONB 对象字段，返回 JSONB | `images_json -> 'main'` |
| `->>` | 取 JSONB 对象字段，返回 TEXT | `images_json -> 'main' -> 0 ->> 'r2Url'` |
| `@>` | 包含判断 | `platforms_json @> '{"shopee":{"status":"draft"}}'` |
| `#>` | 路径取值 | `images_json #> '{main,0,r2Url}'` |

## 11.2 常用查询

```sql
-- 取第一张主图 URL
SELECT spu_code, images_json -> 'main' -> 0 ->> 'r2Url' AS cover_url
FROM products;

-- 查询 Shopee 状态为 draft 的产品
SELECT * FROM products
WHERE platforms_json -> 'shopee' ->> 'status' = 'draft';

-- 查询有主图的产品
SELECT * FROM products
WHERE images_json -> 'main' IS NOT NULL
  AND jsonb_array_length(images_json -> 'main') > 0;

-- 查询未删除的某类目产品
SELECT * FROM products
WHERE category = '包包挂件'
  AND is_deleted = FALSE;
```

---

# 十二、当前已知问题

---

## 12.1 `packaging_presets` 表缺失

代码文件：

```text
src/main/ipc/dbHandlers.ts
```

存在如下 IPC 调用：

```text
db:get-packaging-presets
db:save-packaging-preset
```

但当前数据库：

- `db/init.sql` 未创建此表
- PostgreSQL 实际数据库也不存在该表

因此：

```text
调用相关 IPC 时会直接触发 SQL ERROR
```

---

## 12.2 数据库用户不一致

当前存在：

| 来源 | 用户名 |
|---|---|
| `db/init.sql` | `sorter_user` |
| `.env` 实际运行 | `pim_user` |

可能导致：

- 权限问题
- 初始化失败
- Docker 环境不一致
- CI/CD 部署问题

建议统一数据库用户配置。

---

# 十三、v2.0 变更记录

| 变更项 | 说明 |
|---|---|
| 新增 `products` 表 | PIM 中台产品主表，UUID 主键，`spu_code` UNIQUE |
| 新增 `product_skus` 表 | PIM 中台 SKU 表，FK → products CASCADE |
| 新增 JSONB 列 | `platforms_json`, `images_json`, `size_json` |
| 字段保护策略 | COALESCE 机制：分拣字段覆盖，运营字段保护，自定义字段永不覆盖 |
| 新增索引 7 个 | products: spu_code(×2) + status; product_skus: pkey + sku_code UNIQUE + spu_code |
| 新增外键 1 条 | product_skus.spu_code → products.spu_code CASCADE |
| 表数量 | 4 → 6 |
| 索引数量 | 11 → 18 |
| 外键数量 | 4 → 5 |
| SPU 编码修复 | `shortTitle` 为空时回退到 `spuName` 提取拼音首字母 |
| 包装字段修复 | `db:createSpu` 中 `outer_pack_*` 字段使用 `|| null` 替代 `?? null`，空值写入 NULL |
| SKU 校验放宽 | 移除售价/库存强制校验，改为可选 |
| PIM 授权 | 对 `pim_user` 添加 SELECT/INSERT/UPDATE 权限 |

---

# 十四、当前数据库设计特点

## 优点

- 结构清晰，分拣层与 PIM 层职责分离
- 外键设计合理，级联删除策略明确
- 已支持多机协同（machine_name）
- 已支持素材状态流转（pending → published/failed/skipped）
- 已支持日志追踪（publish_logs）
- JSONB 列提供灵活的半结构化数据存储
- COALESCE 策略保护运营数据不被分拣覆盖
- 适合 Electron + Docker 本地化部署
- 扩展性较好

---

## 当前缺少能力

### 1. 用户系统

目前无：

- 用户表
- 权限系统
- 登录体系

### 2. 仓储能力

缺少：

- 库存表
- 箱规表（packaging_presets 缺失）
- 包材管理

### 3. 素材高级能力

缺少：

- HASH 去重
- 文件大小
- MIME 类型
- OSS 地址
- 缩略图
- AI 标签

### 4. 发布能力

缺少：

- 平台维度
- 多店铺
- 发布任务队列
- 重试机制
- 发布模板

### 5. 审计能力

缺少：

- 操作日志
- 数据版本
- 删除回收站
- 变更记录

---

# 十五、建议后续扩展方向

建议未来新增：

| 模块 | 建议 |
|---|---|
| packaging_presets | 包装规格预设 |
| stores | 店铺管理 |
| publish_tasks | 发布任务队列 |
| asset_hashes | 素材 HASH 去重 |
| ai_tags | AI 标签 |
| folders | 文件夹体系 |
| operators | 操作人员 |
| audit_logs | 审计日志 |
| recycle_bin | 回收站 |
| asset_versions | 素材版本管理 |

---

# 十六、总结

当前数据库属于：

```text
轻量级素材分拣 + 电商发布基础架构 + PIM 中台数据同步
```

v2.0 在 v1.0 基础上新增 PIM 中台同步层（products / product_skus），实现了：

- 分拣系统 → PIM 中台的数据自动同步
- 分拣字段与运营字段的职责分离
- COALESCE 保护策略确保运营数据安全
- JSONB 半结构化数据支持

后续可逐步演进为：

- PIM（商品信息管理）
- DAM（数字资产管理）
- 电商发布中台
- AI 素材管理系统
