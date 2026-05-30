# 素材分拣系统数据库结构文档（PostgreSQL）

> 数据来源：PostgreSQL 实际数据库结构
> 查询时间：2026-05-29
> 数据库：`sorter`
> Schema：`public`

---

# 一、数据库概览

| 项目            | 值             |
| ------------- | ------------- |
| 数据库名称         | `sorter`      |
| Schema        | `public`      |
| 当前数据库用户       | `pim_user`    |
| init.sql 定义用户 | `sorter_user` |
| 表数量           | 4             |
| 序列数量          | 3             |
| 枚举类型数量        | 2             |
| 索引数量          | 11            |
| 外键数量          | 4             |

---

# 二、数据库整体设计说明

本数据库用于：

* 商品 SPU/SKU 管理
* 素材文件管理
* 素材发布状态管理
* 发布日志记录
* 多机器素材同步识别

系统采用：

* PostgreSQL
* UUID/文本业务主键
* 外键级联
* 素材状态枚举
* 多机协同识别

数据库整体关系：

```text
SPU
 ├── SKU
 │     └── Assets
 │             └── Publish Logs
 └── Assets
```

---

# 三、表结构总览

| 表名             | 用途         |
| -------------- | ---------- |
| `spus`         | 产品主款表（SPU） |
| `skus`         | 产品变体表（SKU） |
| `assets`       | 素材文件记录表    |
| `publish_logs` | 发布日志表      |

---

# 四、枚举类型（ENUM）

---

## 4.1 `asset_type_enum`

素材类型枚举。

| 枚举值            | 说明    |
| -------------- | ----- |
| `main_image`   | 主图    |
| `sku_image`    | SKU 图 |
| `detail_image` | 详情图   |
| `video`        | 视频    |

---

## 4.2 `asset_status_enum`

素材状态枚举。

| 枚举值         | 说明   |
| ----------- | ---- |
| `pending`   | 待发布  |
| `published` | 已发布  |
| `failed`    | 发布失败 |
| `skipped`   | 已跳过  |

---

# 五、序列（Sequences）

| 序列名                   | 用途                 |
| --------------------- | ------------------ |
| `spu_seq`             | SPU 编码自增序列         |
| `assets_id_seq`       | assets 表主键自增       |
| `publish_logs_id_seq` | publish_logs 表主键自增 |

---

# 六、数据表详细结构

---

# 6.1 `spus` — 产品主款表

用于保存商品主款信息。

## 表说明

* 一个 SPU 可对应多个 SKU
* 一个 SPU 可对应多个素材
* 使用业务主键 `spu_code`

---

## 字段结构

| 字段名                 | 类型          | 可空  | 说明       |
| ------------------- | ----------- | --- | -------- |
| `spu_code`          | TEXT        | NO  | SPU 主键编码 |
| `spu_name`          | TEXT        | NO  | 产品名称     |
| `short_title`       | TEXT        | YES | 短标题      |
| `category_code`     | TEXT        | NO  | 类目编码     |
| `style_code`        | TEXT        | YES | 风格编码     |
| `outer_pack_length` | NUMERIC     | YES | 外箱长度（cm） |
| `outer_pack_width`  | NUMERIC     | YES | 外箱宽度（cm） |
| `outer_pack_height` | NUMERIC     | YES | 外箱高度（cm） |
| `outer_pack_weight` | NUMERIC     | YES | 外箱重量（kg） |
| `machine_name`      | TEXT        | NO  | 创建机器名称   |
| `created_at`        | TIMESTAMPTZ | NO  | 创建时间     |
| `updated_at`        | TIMESTAMPTZ | NO  | 更新时间     |

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

| 字段名             | 类型          | 可空  | 说明       |
| --------------- | ----------- | --- | -------- |
| `sku_code`      | TEXT        | NO  | SKU 主键编码 |
| `spu_code`      | TEXT        | NO  | 关联 SPU   |
| `color_name`    | TEXT        | YES | 颜色/规格名   |
| `dimensions`    | TEXT        | YES | 尺寸       |
| `weight`        | NUMERIC     | YES | 重量（kg）   |
| `cost_price`    | NUMERIC     | YES | 成本价      |
| `selling_price` | NUMERIC     | YES | 售价       |
| `machine_name`  | TEXT        | NO  | 创建机器名    |
| `created_at`    | TIMESTAMPTZ | NO  | 创建时间     |
| `updated_at`    | TIMESTAMPTZ | NO  | 更新时间     |

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

| 索引名                 | 字段         |
| ------------------- | ---------- |
| `idx_skus_spu_code` | `spu_code` |

---

# 6.3 `assets` — 素材记录表

用于管理商品素材文件。

支持：

* 主图
* SKU 图
* 详情图
* 视频

---

## 字段结构

| 字段名            | 类型                | 可空  | 说明     |
| -------------- | ----------------- | --- | ------ |
| `id`           | BIGINT            | NO  | 主键 ID  |
| `spu_code`     | TEXT              | NO  | 关联 SPU |
| `sku_code`     | TEXT              | YES | 关联 SKU |
| `asset_type`   | asset_type_enum   | NO  | 素材类型   |
| `file_path`    | TEXT              | NO  | 文件绝对路径 |
| `machine_name` | TEXT              | NO  | 文件所属机器 |
| `status`       | asset_status_enum | NO  | 发布状态   |
| `sort_order`   | SMALLINT          | NO  | 排序值    |
| `created_at`   | TIMESTAMPTZ       | NO  | 创建时间   |
| `published_at` | TIMESTAMPTZ       | YES | 发布时间   |

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

| 索引名                   | 字段             |
| --------------------- | -------------- |
| `idx_assets_spu_code` | `spu_code`     |
| `idx_assets_sku_code` | `sku_code`     |
| `idx_assets_status`   | `status`       |
| `idx_assets_machine`  | `machine_name` |

---

# 6.4 `publish_logs` — 发布日志表

用于记录素材发布结果。

---

## 字段结构

| 字段名              | 类型          | 可空  | 说明           |
| ---------------- | ----------- | --- | ------------ |
| `id`             | BIGINT      | NO  | 主键 ID        |
| `spu_code`       | TEXT        | NO  | 关联 SPU       |
| `asset_id`       | BIGINT      | YES | 关联素材         |
| `machine_name`   | TEXT        | NO  | 执行机器         |
| `shopee_item_id` | TEXT        | YES | Shopee 商品 ID |
| `result`         | TEXT        | NO  | 发布结果         |
| `error_message`  | TEXT        | YES | 错误信息         |
| `executed_at`    | TIMESTAMPTZ | NO  | 执行时间         |

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

| 索引名                         | 字段         |
| --------------------------- | ---------- |
| `idx_publish_logs_spu_code` | `spu_code` |
| `idx_publish_logs_result`   | `result`   |

---

# 七、索引汇总

| 索引名                         | 表            | 字段           | 类型           |
| --------------------------- | ------------ | ------------ | ------------ |
| `spus_pkey`                 | spus         | spu_code     | UNIQUE BTREE |
| `skus_pkey`                 | skus         | sku_code     | UNIQUE BTREE |
| `idx_skus_spu_code`         | skus         | spu_code     | BTREE        |
| `assets_pkey`               | assets       | id           | UNIQUE BTREE |
| `idx_assets_spu_code`       | assets       | spu_code     | BTREE        |
| `idx_assets_sku_code`       | assets       | sku_code     | BTREE        |
| `idx_assets_status`         | assets       | status       | BTREE        |
| `idx_assets_machine`        | assets       | machine_name | BTREE        |
| `publish_logs_pkey`         | publish_logs | id           | UNIQUE BTREE |
| `idx_publish_logs_spu_code` | publish_logs | spu_code     | BTREE        |
| `idx_publish_logs_result`   | publish_logs | result       | BTREE        |

---

# 八、外键关系汇总

| 子表             | 子字段        | 父表       | 父字段        | 删除策略     |
| -------------- | ---------- | -------- | ---------- | -------- |
| `skus`         | `spu_code` | `spus`   | `spu_code` | CASCADE  |
| `assets`       | `spu_code` | `spus`   | `spu_code` | CASCADE  |
| `assets`       | `sku_code` | `skus`   | `sku_code` | SET NULL |
| `publish_logs` | `asset_id` | `assets` | `id`       | SET NULL |

---

# 九、ER 关系图

```text
spus (1)
 ├── (N) skus
 │         └── (N) assets
 │                     └── (N) publish_logs
 │
 └── (N) assets
```

---

# 十、当前已知问题

---

## 10.1 `packaging_presets` 表缺失

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

* `db/init.sql` 未创建此表
* PostgreSQL 实际数据库也不存在该表

因此：

```text
调用相关 IPC 时会直接触发 SQL ERROR
```

---

## 10.2 数据库用户不一致

当前存在：

| 来源            | 用户名           |
| ------------- | ------------- |
| `db/init.sql` | `sorter_user` |
| `.env` 实际运行   | `pim_user`    |

可能导致：

* 权限问题
* 初始化失败
* Docker 环境不一致
* CI/CD 部署问题

建议统一数据库用户配置。

---

# 十一、当前数据库设计特点

## 优点

* 结构简单
* 适合 Electron 本地化部署
* 外键设计合理
* 已支持多机协同
* 已支持素材状态流转
* 已支持日志追踪
* 扩展性较好

---

## 当前缺少能力

### 1. 用户系统

目前无：

* 用户表
* 权限系统
* 登录体系

---

### 2. 仓储能力

缺少：

* 库存表
* 箱规表
* 包材管理

---

### 3. 素材高级能力

缺少：

* HASH 去重
* 文件大小
* MIME 类型
* OSS 地址
* 缩略图
* AI 标签

---

### 4. 发布能力

缺少：

* 平台维度
* 多店铺
* 发布任务队列
* 重试机制
* 发布模板

---

### 5. 审计能力

缺少：

* 操作日志
* 数据版本
* 删除回收站
* 变更记录

---

# 十二、建议后续扩展方向

建议未来新增：

| 模块                | 建议         |
| ----------------- | ---------- |
| packaging_presets | 包装规格预设     |
| stores            | 店铺管理       |
| publish_tasks     | 发布任务队列     |
| asset_hashes      | 素材 HASH 去重 |
| ai_tags           | AI 标签      |
| folders           | 文件夹体系      |
| operators         | 操作人员       |
| audit_logs        | 审计日志       |
| recycle_bin       | 回收站        |
| asset_versions    | 素材版本管理     |

---

# 十三、总结

当前数据库属于：

```text
轻量级素材分拣 + 电商发布基础架构
```

特点：

* 适合 Electron + Docker 本地化部署
* 适合中小团队素材管理
* 已具备基础发布系统能力
* 后续可逐步演进为：

  * PIM（商品信息管理）
  * DAM（数字资产管理）
  * 电商发布中台
  * AI 素材管理系统

```
```
