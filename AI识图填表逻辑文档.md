# AI 识图填表 — 完整逻辑文档

> 版本：v4.5.0 | 更新日期：2026-05-27  
> 覆盖范围：AI 智能填表 / SKU 中英文名称生成 / Shopee 平台内容生成 / 单 SKU 翻译 / 批量翻译 / 图片压缩缓存

---

## 一、功能概述

用户点击「AI 智能填表」按钮后，系统通过单次 Vision API 调用，一次性返回以下全部内容：
- 产品中文标题、短标题、类目、卖点描述
- 每个 SKU 的中文款式名称 + 英文款式名称（同一对象，天然对应，不会错位）
- Shopee 平台英文标题、英文描述、材质属性

触发方式：`ProductForm.tsx` → `handleAiFill()` → IPC `call-ai-vision` → 豆包 API

---

## 二、执行流程

```
用户点击「AI 智能填表」
  │
  ├─ handleAiFill()
  │   ├─ images.filter(主图).slice(0,1)               → 取1张主图
  │   ├─ skuList (全部 SKU)                             → 所有 SKU 都读取图片
  │   ├─ Promise.all 并发读取:
  │   │   ├─ 主图: readFileBase64 → Canvas 压缩 512px JPEG 65%
  │   │   └─ SKU图: readFileBase64 → Canvas 压缩 (每张)
  │   ├─ 收集上下文:
  │   │   ├─ productTitle       ← productInfo.title
  │   │   ├─ productCategory    ← currentSpu.categoryCode
  │   │   ├─ originalFileNames  ← images[].fileName
  │   │   └─ folderName         ← `[{code}] {shortTitle}_素材包`
  │   │
  │   └─ IPC: callAiVision({
  │         mainBase64List, skuBase64List, skuIds, existingNames,
  │         productTitle, productCategory, originalFileNames, folderName
  │       })
  │         │
  │         └─ main/index.ts
  │             ├─ contentParts = []
  │             ├─ 主图: push { type: 'image_url' }
  │             ├─ 结构化上下文 push (仅1次)
  │             ├─ SKU循环 (每种情况都传图或文字):
  │             │   ├─ 中文名已确定 → 传图 + "请直接用此中文名，生成英文名"
  │             │   ├─ 需识别中文名 → 传图 + "请识别此图，生成中英文名"
  │             │   └─ 图片读取失败 → 仅文字 "图片读取失败，请推测"
  │             ├─ fetch doubao API (maxTokens=2000)
  │             ├─ JSON.parse response
  │             └─ return { title, shortTitle, category, description, shopee, skus[] }
  │
  └─ 回填 Store
      ├─ setProductInfo({ title, description })
      ├─ setShortTitle → generateProductCode
      ├─ updateSpu({ categoryCode, spuName })
      ├─ skus: findIndex(s => s.imagePath===skuId) → updateSkuItem
      │   → colorName + skuNameEn 同时回填 (一对一中英文, 不会错位)
      ├─ shopee → setShopeeInfo + setShopeeAttributes
      └─ category==='BG': auto jitInvitationCode
```

---

## 三、图片收集规则

### 3.1 主图
```
images.filter(label含'主图').slice(0, 1) → 取第一张主图
```

### 3.2 SKU 图
```
skuList 中全部条目 → 所有 SKU 都读取图片
```

- `needAiName=true`: 无中文名，AI 需同时生成中英文
- `needAiName=false`: 已有中文名（从文件名/skuSpec提取），AI 仅需生成英文名，但仍传图以辅助翻译

### 3.3 b64 读取失败处理
```typescript
if (!b64) console.warn(`[AI填表] SKU图片读取失败，将降级处理: ${imagePath}`)
```
失败后仍发送文字标签给 AI，告知"图片读取失败，请推测"，确保 SKU 不丢失。

---

## 四、图片压缩参数

| 参数 | 渲染进程 (Canvas) | 主进程 (Sharp) |
|------|------------------|--------------|
| 使用场景 | call-ai-vision | call-translate-sku, call-shopee-english |
| maxWidth | 512 px | 512 px |
| maxHeight | 512 px | 512 px |
| 质量 | 0.65 (65%) | 0.65 (65%) |
| 格式 | JPEG | JPEG |
| 并发 | Promise.all | 串行（带缓存） |

### 4.1 主进程 Sharp 缓存

`src/main/services/ai/utils/compressImage.ts`

- `ImageCompressionCache` 单例，FIFO 淘汰（上限 100 条）
- key = 归一化路径（反斜杠 → 正斜杠）
- 命中缓存：0ms 返回，跳过磁盘 I/O + Sharp 压缩
- 切换产品时自动清空（`clear-image-cache` IPC 通道）

---

## 五、并发读取架构

```
主图读取任务 (1个)  ─┐
                      ├─ Promise.all 并发
SKU图读取任务 (N个)  ─┘
  │
  ├─ readB64(path) → Electron IPC readFileBase64 → Canvas 压缩
  └─ 失败时返回 '' (空字符串), 不阻塞其他任务
```

所有任务并发执行，不区分 needAiName 状态。

---

## 六、contentParts 构造规则

`src/main/index.ts:116-218`

### 6.1 消息结构

```
[0] 主图 image_url
[1] 结构化上下文 text (1次)
    └─ 文件夹名 / 标题 / 类目 / 原始文件名列表
    └─ 任务说明 / SKU命名规则 / 英文名规则 / Shopee规则 / JSON格式

[2..N] SKU条目 (每条SKU按标签+图片方式构造):
  ├─ 中文名已定 (existing[i] 有值):
  │   ├─ [image_url] (有b64时)
  │   └─ text: "SKU_ID: xxx — 中文名已确定为'xxx'，请直接用此中文名，生成英文名"
  │
  ├─ 需识别中文名 (existing[i] 为空, b64 有值):
  │   ├─ text: "SKU_ID: xxx — 请识别此图，生成中英文名"
  │   └─ [image_url]
  │
  └─ 图片读取失败 (existing[i] 为空, b64 为空):
      └─ text: "SKU_ID: xxx — 图片读取失败，请推测此SKU的名称"
```

### 6.2 SKU Labels 伪代码

```typescript
for (let i = 0; i < list.length; i++) {
  const s = list[i]
  const skuId = imagePath (归一化)
  const b64 = skuB64ByIndex.get(i) || ''

  if (s.needAiName) {
    // 无中文名 → 需识别
    skuBase64List.push(b64)
    existingNames.push('')
    if (!b64) console.warn('图片读取失败')
  } else {
    // 有中文名 → 只需翻译
    skuBase64List.push(b64)      // 传图!
    existingNames.push(s.colorName)  // 传中文名!
  }
}
```

---

## 七、AI 模型参数

| 参数 | 值 |
|------|-----|
| 模型 | `doubao-seed-1-6-flash-250828` |
| max_tokens | 2000 |
| API 端点 | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
| 默认温度 | 模型默认 |

---

## 八、System Prompt 全文

`src/main/index.ts:126-180`

```
[PRODUCT CONTEXT — PRIMARY SOURCE, READ FIRST]
素材包文件夹: [{productCode}] {shortTitle}_素材包
产品中文标题: {productTitle}
产品类目: {productCategory}
原始图片文件名:
  [0] filename1.jpg
  [1] filename2.jpg
  ...

[YOUR TASK]
你是一个跨境电商选品与数据录入及本地化专家。
基于以上产品上下文，结合图片内容作为辅助确认，请一次性完成以下任务：

1. 确认或优化产品中文标题(title, ≤60字)
2. 生成短标题(shortTitle, ≤10字)，用于文件夹命名
3. 从 "包包挂件"、"手机挂件"、"车内配饰"、"毛绒玩具" 中选择最合适的类目(category)
4. 生成卖点描述(description)
5. 对标记为"请识别此图"的 SKU 图片生成款式名称（中文 + 英文，同步输出）
6. 额外任务：同步生成专门针对 Shopee 平台优化的英文推广内容

[SHOPEE PLATFORM LOCALIZATION RULES]
- 标题 (shopee.title): 英文 Title Case，34-180个字符，自然融入3个热搜关键词
- 描述 (shopee.descriptionText): 500-1500字符，纯文本，包含 [IMAGE] 占位符
- 材质 (shopee.material): 2-4个英文材质词，逗号分隔

[SKU 命名规则]
- 每张图必须生成不同的款式名称，禁止多张图返回相同名称
- 优先参考该图对应的原始文件名
- 变体特征：颜色、材质、数量、尺寸、配件、款式、图案等
- 文件名中有明确特征词必须保留在款式名称中
- 2-10个中文字符
- 对于标注"中文名已确定"的SKU：skuName必须原样使用提供的中文名不要修改
- 请确保skus数组中每个skuId都对应一条记录，不要遗漏任何SKU

[ENGLISH SKU NAME RULES]
- 每个 SKU 必须同时生成对应的英文款式名称（skuNameEn）
- 英文名 2-5个单词，Title Case
- 不是裸颜色词，不是纯产品名
- 示例：中文"蓝色香肠嘴挂件" → 英文"Blue Sausage Mouth Charm"

⚠️ 极其重要：必须返回以下格式的纯 JSON 对象：
{
  "title": "...",
  "shortTitle": "...",
  "category": "...",
  "description": "...",
  "shopee": { "title": "...", "descriptionText": "...", "material": "..." },
  "skus": [
    {
      "skuId": "D:/images/blue.jpg",
      "skuName": "蓝色香肠嘴挂件",
      "skuNameEn": "Blue Sausage Mouth Charm"
    }
  ]
}
```

---

## 九、回填逻辑

### 9.1 基本信息回填

| AI 字段 | 回填目标 | 方法 |
|---|---|---|
| `title` | `productInfo.title` | `setProductInfo` |
| `shortTitle` | 短标题 + 产品编号 | `setShortTitle` + `generateProductCode` |
| `description` | `productInfo.description` | `setProductInfo` |
| `category` | `currentSpu.categoryCode` | `updateSpu({ categoryCode })` |

### 9.2 SKU 名称回填

通过 `imagePath` 归一化路径精准匹配（`findIndex`），杜绝错位：

```typescript
const targetIndex = s3.skuList.findIndex(
  (s) => s.imagePath.replace(/\\/g, '/') === aiSku.skuId
)
if (targetIndex !== -1) {
  s3.updateSkuItem(targetIndex, {
    colorName: aiSku.skuName,
    skuNameEn: aiSku.skuNameEn || '',   // 来自同一AI对象, 天然对应
    needAiName: false,
  })
}
```

### 9.3 Shopee 信息回填

```typescript
if (infoData.shopee) {
  setShopeeInfo({ title: shopeeData.title })
  setShopeeInfo({ descriptionText: shopeeData.descriptionText })
  setShopeeAttributes({ material: shopeeData.material })
}
```

### 9.4 部分失败容错

```typescript
const needAiCount = list.filter((s) => s.needAiName).length
const skuFailed = needAiCount - skuSucceeded
if (skuFailed > 0 && needAiCount > 0) {
  setAiError(`${skuSucceeded} 个 SKU 名称识别成功，${skuFailed} 个失败（可手动填写）`)
}
```

---

## 十、已知问题与修复记录

| # | 问题 | 修复日期 | 修复方式 |
|---|------|---------|---------|
| ✅ 1 | 中英文 SKU 名称来自两次独立 AI 调用，顺序错位 | 2026-05-27 | 合并为一次调用，中英文同属一个 skus 对象 |
| ✅ 2 | Shopee AI 覆盖已生成的 skuNameEn | 2026-05-27 | Shopee AI 不再返回 skuNamesEn |
| ✅ 3 | `needAiName=false` 的 SKU 不传图，AI 不返回该 SKU | 2026-05-27 | 全部 SKU 都传图 + 改 label 为"中文名已确定，请翻译" |
| ✅ 4 | b64 为空时整个 SKU 被跳过（无文字标签） | 2026-05-27 | b64 为空时仍发送文字降级标签 |
| ✅ 5 | SKU 初始化无去重，同名多图产生多条 SKU | 2026-05-27 | 按 skuSpec + colorName 两级去重 |
| ✅ 6 | Sharp 图片压缩无缓存，重复计算 | 2026-05-27 | ImageCompressionCache FIFO 缓存 + IPC 清理 |
| ✅ 7 | 单 SKU 翻译始终调用 Vision，成本高 | 2026-05-27 | translateSingleSku 智能降级 + System Prompt + 严格清洗 |

---

## 十一、性能数据

| 指标 | 值 |
|------|-----|
| 一张主图 + 5 张 SKU 图的总 API 调用 | 1 次 (Vision) |
| 单次调用 Token 消耗 | ~500-800 input + ~500 output |
| 图片压缩耗时 (Sharp 命中缓存) | 0ms |
| 图片压缩耗时 (Sharp 未命中) | 50-200ms / 张 |
| Canvas 压缩耗时 (渲染进程) | 50-100ms / 张 |
| AI 响应耗时 | 2-15 秒 |
| 单 SKU 翻译 (Text-only 降级) | ~10/sku |

---

## 十二、下一步优化方向（待实现）

| # | 方向 | 预期收益 |
|---|------|---------|
| 1 | Vision 图片缓存 (同图压缩后缓存 base64) | CPU -50% |
| 2 | translateSingleSku Text-only 降级 (文件名+标题够时跳过 Vision) | API 成本 -80% |
| 3 | 批量 SKU 翻译合并 (N 次 → 1 次) | 耗时 -70% |
| 4 | Token 使用日志 | 可观测性 |
| 5 | AI 返回 schema 校验 (jsoonschema/zod) | 容错性提升 |
