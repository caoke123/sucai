# AI 识别系统分析报告

> **项目**: 雨图饰品素材分拣系统 v4.5.0  
> **日期**: 2026-05-26  
> **范围**: AI 自动填表 / Shopee 英文生成 / SKU AI 翻译 全链路审计

---

## 目录

1. [系统总览](#a-系统总览)
2. [调用链](#b-调用链)
3. [Prompt 结构](#c-prompt-结构)
4. [上下文组装](#d-上下文组装)
5. [性能分析](#e-性能分析)
6. [风险分析](#f-风险分析)
7. [可优化项](#g-可优化项)
8. [文件风险等级](#h-文件风险等级)

---

## A. 系统总览

### 文件结构

```
src/main/services/ai/
├── index.ts                     # 统一入口: generateShopeeEnglish + translateSingleSku
├── provider/doubaoProvider.ts   # 豆包 API: fetch + 30s timeout + retry 2x
├── prompt/shopeePrompt.ts       # Shopee Prompt Builder: System + User + 文件名上下文
├── parser/parseShopeeResponse.ts # JSON 解析: markdown剥离 + schema验证 + SKU对齐
└── utils/
    ├── compressImage.ts         # Sharp 512px JPEG 65%
    └── normalizeAiError.ts      # 5类错误归一化

src/main/index.ts                # IPC 通道:
                                 #   call-ai-vision          (中文填表)
                                 #   call-single-sku-vision  (单图 SKU 识别)
                                 #   call-shopee-english     (英文生成)
                                 #   call-translate-sku      (单 SKU 翻译)

src/renderer/src/components/
├── ProductForm.tsx              # 前端编排: handleAiFill, handleShopeeAiGenerate,
│                                #           handleTranslateSku
└── step3/sections/
    ├── ShopeeInfoSection.tsx    # 「AI 一键生成」按钮
    └── SkuTableSection.tsx      # ✨ 单 SKU 翻译按钮
```

### 4 个 AI 调用入口

| 入口 | 触发按钮 | 模型类型 | 图片数 | max_tokens | System Prompt |
|------|---------|---------|--------|-----------|---------------|
| `call-ai-vision` | 「AI 智能填表」 | Vision | 主图≤1 + SKU图≤N | 2000 | 无 |
| `call-single-sku-vision` | (needAiName时自动) | Vision | 1张 SKU | 30 | 无 |
| `call-shopee-english` | 「AI 一键生成」 | Text + Vision(可选) | 可选 1张主图 | 2000 | ✓ |
| `call-translate-sku` | ✨ 按钮 | Text + Vision(可选) | 可选 1张 SKU | 50 | 无 |

---

## B. 调用链

### B.1 「AI 智能填表」完整链路

```
[UI] 点击「AI 智能填表」
  │
  ├─ ProductForm.handleAiFill()
  │   ├─ images.filter(主图).slice(0,1)           → 取1张主图
  │   ├─ skuList.filter(needAiName===true)         → 取未命名的 SKU
  │   ├─ Promise.all 并发读取:
  │   │   ├─ 主图: readFileBase64 → Canvas 压缩 512px
  │   │   └─ SKU图: readFileBase64 → Canvas 压缩 512px (每张)
  │   ├─ 收集上下文:
  │   │   ├─ productTitle       ← productInfo.title
  │   │   ├─ productCategory    ← currentSpu.categoryCode
  │   │   ├─ originalFileNames  ← images[].fileName
  │   │   └─ folderName         ← `[${productCode}] ${shortTitle}_素材包`
  │   │
  │   └─ IPC: callAiVision({
  │         mainBase64List, skuBase64List, skuIds, existingNames,
  │         productTitle, productCategory, originalFileNames, folderName
  │       })
  │         │
  │         └─ main/index.ts (78-200行)
  │             ├─ contentParts = []
  │             ├─ 主图: push { type: 'image_url' }
  │             ├─ SKU循环:
  │             │   ├─ 已有名: push text "SKU_ID: xxx — 已有名称..."
  │             │   │   └─ ⚠️ 结构化 context 在此块内 push (BUG #1)
  │             │   └─ 未命名: push text + push image
  │             ├─ ⚠️ 旧 Prompt push (BUG #2: 双重 Prompt)
  │             ├─ fetch doubao API
  │             ├─ JSON.parse response
  │             └─ return { title, shortTitle, category, description, skus[] }
  │
  └─ 回填 Store
      ├─ setProductInfo({ title, description })
      ├─ setShortTitle → generateProductCode
      ├─ updateSpu({ categoryCode, spuName })
      ├─ skus: findIndex(s => s.imagePath===skuId) → updateSkuItem
      └─ category==='BG': auto jitInvitationCode
```

### B.2 「AI 一键生成」完整链路

```
[UI] 点击「AI 一键生成」
  │
  ├─ ProductForm.handleShopeeAiGenerate()
  │   ├─ 收集: title, description, category, skuNames, originalFileNames
  │   ├─ images.filter(主图)[0].originalPath → mainImagePath
  │   │
  │   └─ IPC: callShopeeEnglish({ title, desc, cat, skuNames, originalFileNames, mainImagePath })
  │         │
  │         └─ main/index.ts → generateShopeeEnglish()
  │             ├─ compressImageToBase64(mainImagePath)              ← Sharp 512px JPEG
  │             ├─ buildShopeePrompt({ title, desc, cat, skuNames })
  │             │     → System: "You are a professional copywriter..."
  │             │     → User: 文件名上下文 + SKU列表 + 翻译规则 + 格式要求
  │             ├─ callDoubaoApi(messages, maxTokens=2000, temp=0.7)
  │             ├─ parseShopeeResponse(content, skuCount)
  │             │     → sanitizeJsonString (strip markdown + extract {})
  │             │     → validateStringField (fallback '')
  │             │     → alignSkuCount (pad/truncate)
  │             └─ return { title, descriptionText, material, skuNamesEn[] }
  │
  └─ 回填 Store
      ├─ setShopeeInfo({ title, descriptionText })
      ├─ setShopeeAttributes({ material })
      └─ skuNamesEn.forEach((nameEn, i) → updateSkuItem(i, { skuNameEn }))
```

### B.3 ✨「AI 翻译」完整链路

```
[UI] 点击 ✨ 按钮 (中文名称旁)
  │
  ├─ SkuTableSection.onAiTranslateSku(idx)
  │   │
  │   └─ ProductForm.handleTranslateSku(idx)
  │       ├─ sku = skuList[idx]
  │       ├─ targetCode = sku.skuCode || sku.colorName    ← 捕获稳定标识
  │       ├─ setTranslatingSkuCode(targetCode)              ← loading 独立化
  │       │
  │       └─ IPC: callTranslateSku({ title, category, skuName, skuFileName, skuImagePath })
  │             │
  │             └─ main/index.ts → translateSingleSku()
  │                 ├─ compressImageToBase64(skuImagePath)          ← Sharp 压缩
  │                 ├─ 构建 inline prompt (无 System Prompt)
  │                 │     → "Translate this single SKU..."
  │                 │     → 标题/类目/SKU名/文件名/规则/example
  │                 ├─ callDoubaoApi(messages, maxTokens=50, temp=0.5)
  │                 ├─ content.trim().replace(/['"]/g, '')
  │                 └─ return { nameEn }
  │
  └─ 回填 Store
      ├─ st2.skuList.findIndex(s => s.skuCode===targetCode || s.colorName===targetCode)
      └─ updateSkuItem(targetIdx, { skuNameEn })          ← 精确匹配 ✓
```

---

## C. Prompt 结构

### C.1 call-ai-vision (中文填表)

**当前 contentParts 实际构造顺序** (存在 BUG):

```
[0] 主图 image_url
[1] SKU_ID: sku-0 text (已有名时)
[1]   → 结构化 context: 文件夹名/标题/类目/原始文件名   ← ⚠️ 在 existing[i] 条件内
[2] SKU_ID: sku-1 — 请识别此图 text + image
[3] 旧版 Prompt (外层): "你是一个跨境电商选品..."       ← ⚠️ 与新版共存
```

**问题**: 新版结构化 context 在 `if (existing[i])` 块内被反复 push, 且与旧版外层 Prompt 共存, 导致:
- Token 消耗翻倍
- AI 收到矛盾指令
- 上下文优先级混乱

### C.2 call-shopee-english (英文生成)

| 角色 | 大小 | 内容要点 |
|------|------|---------|
| System | ~350 tokens | 定位: copywriter; 优先级: 文件名>标题>SKU名>视觉; Shopee 规则 (Title Case, 34-180, 3 keywords, 无平台名) |
| User | ~500 tokens | 标题/类目/描述/原始文件名表 (SKU i: "中文名" \| 文件名)/SKU列表/翻译规则 (蝴蝶结→Bow, 毛衣→Sweater)/输出格式 JSON |

**主图 image**: 若有 mainImageBase64, 插在 user content 最前

### C.3 call-translate-sku (单 SKU 翻译)

| 角色 | 大小 | 内容 |
|------|------|------|
| System | 无 | — |
| User | ~200 tokens | 标题/类目/SKU中文名/文件名提示/规则 (2-5词, Title Case, 不输出裸颜色词)/example/要求纯文本返回 |

**SKU image**: 若有 skuImagePath, 插在 user content 最前

### C.4 call-single-sku-vision (1对1 识别)

| 角色 | 大小 | 内容 |
|------|------|------|
| System | 无 | — |
| User | ~80 tokens | SKU 图片 + "仔细观察输出具体颜色/款式/规格名称, 2-6汉字, 直接输出名字" |

---

## D. 上下文组装

### D.1 数据来源矩阵

| 数据 | 来源 | 获取方式 | 使用者 |
|------|------|---------|--------|
| `productTitle` | Store `productInfo.title` | Hook destructure | call-ai-vision, call-shopee-english, call-translate-sku |
| `category` | Store `currentSpu.categoryCode` | Hook destructure | 同上 |
| `skuName` | Store `skuList[].colorName` | Hook destructure | 同上 |
| `originalFileNames` | Store `images[].fileName` | 遍历拼接 | call-ai-vision, call-shopee-english |
| `folderName` | `productCode` + `shortTitle` | 字符串拼接 `[{code}] {title}_素材包` | call-ai-vision |
| `skuFileName` | `skuList[].imagePath` → basename | path 提取 | call-translate-sku |
| `mainImageBase64` | Canvas 压缩 512px (renderer) | readFileBase64 → Canvas.toDataURL | call-ai-vision |
| `skuImageBase64` | Canvas 压缩 (renderer) / Sharp 压缩 (main) | 同上或 compressImageToBase64 | 所有 |

### D.2 设计优先级 vs 实际执行

| 层级 | 设计意图 | call-ai-vision | call-shopee-english | call-translate-sku |
|------|---------|---------------|---------------------|-------------------|
| 1 | 原始文件名 | ⚠️ 重复/错位 | ✓ | ✓ |
| 2 | 产品标题 | ✓ | ✓ | ✓ |
| 3 | SKU中文名 | ✓ | ✓ | ✓ |
| 4 | 图片识别 | ✓ | 可选 | 可选 |

---

## E. 性能分析

### E.1 瓶颈排名

| 排名 | 瓶颈 | 影响 | 严重度 |
|------|------|------|--------|
| 🔴 1 | **call-ai-vision 双重 Prompt + 重复 context** | Token 翻倍, 响应质量下降, 费用双倍 | 严重 |
| 🟡 2 | **handleAiFill: N 张 SKU 图并发 Canvas 压缩** | 每张 ~50ms, N=10 时 ~500ms renderer 阻塞 | 中 |
| 🟡 3 | **每次都重新 Sharp 压缩图片 (无缓存)** | 主进程 CPU, 重复计算 | 中 |
| 🟢 4 | call-translate-sku (maxTokens=50) | 极快 | 低 |
| 🟢 5 | call-shopee-english (maxTokens=2000) | 正常 | 低 |

### E.2 一次完整操作的 API 调用次数

| 操作 | 调用次数 | Vision | Text-Only |
|------|---------|--------|-----------|
| AI 智能填表 | 1 | ✓ (主图+N张SKU图) | ✓ |
| Shopee 一键生成 | 1 | 可选 (1张主图) | ✓ |
| 单 SKU 翻译 × N | N | ✓ (每次带SKU图) | — |
| **总计** | **2+N** | **N+1** | **N+2** |

### E.3 Vision 重复调用警告

🚨 `call-translate-sku` 每次点击 ✨ 都调用 Vision (带 SKU 图片)。若用户逐个点击 10 个 SKU 翻译按钮, 产生 **10 次独立的 Vision API 调用**, 每次需压缩+传输 1 张图片。

---

## F. 风险分析

| # | 风险 | 位置 | 等级 | 说明 |
|---|------|------|------|------|
| 1 | **双重 Prompt** | `main/index.ts:114-168` | 🔴 | 新版 context 在 `existing[i]` 条件内, 旧版在外层, 两套 Prompt 同时发送 |
| 2 | **context 重复 push** | `main/index.ts:114` | 🔴 | 每个已有名称的 SKU 都会 push 一次完整 context, 文本重复 N 次 |
| 3 | **Vision 重复调用** | `ai/index.ts:165-169` | 🟡 | 每次都压缩图片调 Vision, 无跳过逻辑, 即使文件名+标题已足够 |
| 4 | **无 System Prompt** | `ai/index.ts:176` | 🟡 | translateSingleSku 仅靠 user prompt, 角色约束弱 |
| 5 | **imagePath 跨平台** | `ProductForm.tsx:399` | 🟢 | `\` vs `/` 路径匹配可能失败 (已有 replace 处理) |
| 6 | **SKU 编码重算** | `ProductForm.tsx:244` | 🟢 | useEffect 依赖 categoryCode+skuName, 频繁触发 |
| 7 | **无 schema 校验** | `ai/index.ts:205` | 🟢 | 单 SKU 翻译返回仅 strip quotes, 可能含意外文本 |

---

## G. 可优化项

| # | 建议 | 优先级 | 预期收益 |
|---|------|--------|---------|
| 1 | **紧急修复 call-ai-vision 双重 Prompt** | 🔴 P0 | Token -50%, 质量提升 |
| | — 删除旧版外层 Prompt (143-168行) | | |
| | — 结构化 context 移到 SKU 循环之前 | | |
| 2 | **Vision 图片缓存** | 🟡 P1 | CPU -50% |
| | — 同一张图压缩后缓存 base64 | | |
| | — key = filePath, 生命周期 = 当前产品 | | |
| 3 | **translateSingleSku Text-only 降级** | 🟡 P1 | API 调用量 -80% |
| | — 文件名+标题语义丰富时跳过 Vision | | |
| | — 仅当都缺失/模糊时才传图 | | |
| 4 | **批量 SKU 翻译合并** | 🟢 P2 | N 次 → 1 次 |
| | — 用户标记需翻译的 SKU → 一次性批量调用 | | |
| 5 | **translateSingleSku 加 System Prompt** | 🟢 P2 | 输出更稳定 |
| 6 | **Token 使用日志** | 🟢 P2 | 可观测性 |

---

## H. 文件风险等级

| 文件 | 等级 | 原因 |
|------|------|------|
| `src/main/index.ts` (call-ai-vision) | 🔴 高风险 | 当前有双重 Prompt bug, 是所有 AI 自动填表入口 |
| `src/main/services/ai/index.ts` | 🟡 中风险 | generateShopeeEnglish + translateSingleSku 核心函数 |
| `src/main/services/ai/prompt/shopeePrompt.ts` | 🟡 中风险 | System Prompt 质量直接影响输出 |
| `src/renderer/src/components/ProductForm.tsx` | 🟡 中风险 | 前端编排 + 回填逻辑, 改动需 UI 验证 |
| `src/main/services/ai/provider/doubaoProvider.ts` | 🟢 低风险 | 稳定, 无已知缺陷 |
| `src/main/services/ai/parser/parseShopeeResponse.ts` | 🟢 低风险 | 容错好, markdown/schema/边界处理完善 |
| `src/renderer/src/components/step3/sections/SkuTableSection.tsx` | 🟢 低风险 | 纯 UI, 改动影响小 |

---

## 附录: 当前已知缺陷 (BUG)

### Bug #1: call-ai-vision 结构化 context 被重复 push

**位置**: `src/main/index.ts:114`

```typescript
// 当前代码 — 结构化 context 在 if (existing[i]) 块内
if (existing[i]) {
    contentParts.push({
        type: 'text',
        text: `[PRODUCT CONTEXT — PRIMARY SOURCE, READ FIRST]...`  // ← 每个已有 SKU 都 push 一次
    })
}
```

### Bug #2: call-ai-vision 旧版 Prompt 残留

**位置**: `src/main/index.ts:143-168`

```typescript
// 外层旧版 Prompt — 与新版 Prompt 共存
contentParts.push({
    type: 'text',
    text: `你是一个跨境电商选品与数据录入专家...`  // ← 双重指令
})
```
