# v4.9 阶段开发文档

> 日期：2026-05-29 ~ 2026-05-30

---

## 一、核心改动概览

| 模块 | 改动 | 说明 |
|---|---|---|
| PIM 数据同步 | 新增 products / product_skus 表 | 分拣完成后自动同步到 PIM 中台 |
| SPU 编码 | 新规则 `SP{日期}{3位序号}` | 去除拼音依赖，零 AI 依赖 |
| AI SKU 识别 | Prompt 重构 + 容错解析 | 修复多 SKU 遗漏和 skuId 路径匹配 |
| 图片压缩 UI | 按钮二合一 | 合并"开始压缩"和右上角控制按钮 |
| AI 模型 | doubao-seed-2-0-mini-260428 | 替代旧文本模型 |
| R2 同步 | 调整 PIM 写入时机 | R2 上传完成后再写 PIM，r2Url 有值 |
| 字段校验 | 售价/库存改为可选 | 移除 error 级别强制校验 |

---

## 二、详细变更记录

### 2.1 PIM 中台数据同步

**数据库新增**

| 表 | 关键字段 |
|---|---|
| `products` | spu_code(UNIQUE), title, platforms_json(JSONB), images_json(JSONB), main_image_url, r2_base_path, status, is_deleted |
| `product_skus` | sku_code(UNIQUE), spu_code(FK→products CASCADE), name_zh, name_en, weight_g, size_json(JSONB), cost_price, selling_price, stock, image_url |

**字段保护策略**

分拣系统写入 PIM 时使用 `ON CONFLICT DO UPDATE`，运营字段用 COALESCE 保护：

| 类型 | 字段 | 策略 |
|---|---|---|
| 分拣字段 | title, shopee_title_en, platforms_json, images_json, r2_base_path, name_zh, name_en, image_url | 每次覆盖 |
| 运营字段 | description, category, weight_g, cost_price, selling_price, stock, status | COALESCE 保留原值 |
| 永不覆盖 | shopee_title_zh, shopee_desc_zh, name_zh_custom, name_en_custom | COALESCE(NULL) |

**调用时机**

```
handleSubmit → organize-files → R2 上传所有文件 →
r2Url 构建完毕 → 写回本地 product.json → syncProductToPIM()
```

文件：`src/main/services/pim/syncProductToPIM.ts`（新增）  
触发点：`src/main/ipc/uploadQueue.ts` Step 5.5

---

### 2.2 SPU 编码规则改为 `SP260530001`

**旧格式**：`KAXG260529-0001`（拼音首字母 + 日期 + 4位序号 + 分隔符）

**新格式**：`SP260530001`（SP 前缀 + 日期6位 + 3位序号）

**改动点**：
- `src/main/ipc/dbHandlers.ts:db:createSpu` — 移除拼音提取逻辑
- `src/main/ipc/dbHandlers.ts:db:getSpuCodePreview` — 预览同步新格式
- 移除 `PINYIN_INITIALS` 字典和 `toPinyinInitials` 函数（~70行死代码）

**示例**：`SP260530001` → SP 前缀 / 2026-05-30 / 第1号产品

---

### 2.3 AI SKU 识别全面修复

**问题1：模型不支持图片**
- 旧模型 `doubao-seed-1-6-flash-250828` 不接收 image_url
- 改为 `doubao-seed-2-0-mini-260428`（支持文字/图片/视频/音频输入）

**问题2：contentParts 顺序导致注意力稀释**
- 旧顺序：[主图]→[长Prompt]→[60行材质]→[30行热词]→[SKU图]
- 新顺序：[主图]→[SKU图全部]→[核心视觉任务+Visual Counter]→[材质JSON数组]→[关键词JSON数组]

**问题3：材质白名单压缩**
- 从多行展开文本 → 紧凑 JSON 数组，节省 ~60% token

**问题4：skuId 路径匹配失败**
- 模型将 `"路径/文件名.jpg"` 当字面占位符，自创假名
- 修复：Prompt 中写第一个 SKU 真实路径作示范，强制"一字不改地回填"
- 三段兜底匹配：精确路径 → 文件名 endsWith → 数组位置

**问题5：流式 SKU 正则太严格**
- 旧：`/\{\s*"skuId":"([^"]+)","skuName":"([^"]+)","skuNameEn":"([^"]+)"\s*\}/g`（固定三字段顺序）
- 新：先匹配 `{skuId...}` 块，再独立提取 skuName/skuNameEn（容错字段顺序和多字段）

**问题6：SPU 编码入口条件**
- 旧：`if (st.shortTitle)` → shortTitle 为空时跳过 SPU 创建
- 新：`if (st.shortTitle || st.productInfo.title)` → 产品标题也可触发

**问题7：流式最后一帧数据丢弃**
- `if (done) break` 改为先处理 value 再 break

---

### 2.4 图片压缩按钮合并

`src/renderer/src/components/CompressStep.tsx`
- 删除中间全宽蓝色"开始压缩"按钮
- 右上角按钮改为三态：
  - 待压缩：蓝色"开始压缩"+ 呼吸灯
  - 压缩中：灰色禁用 + "压缩中 X/Y..."
  - 完成：绿色"下一步" + 呼吸灯

---

### 2.5 售价/库存/包装字段改为可选

| 文件 | 改动 |
|---|---|
| `src/shared/validation/rules/skuRules.ts` | 移除售价 >0 和库存 >0 的 error 校验 |
| `src/main/ipc/dbHandlers.ts` | `outer_pack_*` 字段从 `?? null` 改为 `|| null` |
| `src/renderer/src/components/ProductForm.tsx` | `setProductInfo({ productNo })` 移到 if 块外 |

---

### 2.6 其他修复

| 修复 | 文件 |
|---|---|
| `nullIfEmpty` 处理空字符串 timestamp | `syncProductToPIM.ts` |
| `OrganizeResult` 新增 `productData` | `product.ts` + `organizeFiles.ts` |
| db/init.sql 补充 PIM 表 + pim_user 授权 | `db/init.sql` |
| 数据库结构文档 v2.0 | 新文档 |

---

## 三、文件变更清单

| 文件 | 状态 |
|---|---|
| `src/main/services/pim/syncProductToPIM.ts` | 新增 |
| `素材分拣系统数据库结构文档（PostgreSQL）v2.0.md` | 新增 |
| `src/main/index.ts` | 修改（AI Prompt 重构 + 流式修复）|
| `src/main/ipc/dbHandlers.ts` | 修改（SPU 编码 + 包装字段 + 移除拼音逻辑）|
| `src/main/ipc/uploadQueue.ts` | 修改（PIM 同步调用点）|
| `src/main/ipc/organizeFiles.ts` | 修改（返回 productData）|
| `src/main/services/config/defaultConfig.ts` | 修改（默认模型）|
| `src/renderer/src/components/ProductForm.tsx` | 修改（SKU 解析 + PIM 调用移除 + SPU 入口 + productNo 同步）|
| `src/renderer/src/components/CompressStep.tsx` | 修改（按钮合并）|
| `src/shared/constants.ts` | 修改（默认模型）|
| `src/shared/types/product.ts` | 修改（OrganizeResult.productData）|
| `src/shared/validation/rules/skuRules.ts` | 修改（移除售价/库存校验）|
| `src/preload/index.ts` | 修改（syncPimProduct API）|
| `src/preload/index.d.ts` | 修改（类型声明）|
| `db/init.sql` | 修改（PIM 表 + 授权）|
| `ai-config.json` | 修改（模型）|
| `package.json` | 修改（版本号 4.9.0）|

---

## 四、数据库表结构（v2.0）

| 表 | 版本 | 说明 |
|---|---|---|
| `spus` | v1.0 | SPU 主款表 |
| `skus` | v1.0 | SKU 变体表 |
| `assets` | v1.0 | 素材记录表 |
| `publish_logs` | v1.0 | 发布日志表 |
| `products` | v2.0 | PIM 中台产品主表 |
| `product_skus` | v2.0 | PIM 中台 SKU 表 |

详见 `素材分拣系统数据库结构文档（PostgreSQL）v2.0.md`。
