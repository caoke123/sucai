# AI 识图填表 — 完整逻辑文档

> 版本：v4.5.0 | 更新日期：2026-05-27
> 覆盖范围：AI 智能填表 / SKU 中英文名称生成 / Shopee 平台内容生成 / 单 SKU 翻译 / 批量翻译 / 图片压缩缓存 / 流式返回 / 缓存预热

---

## 一、功能概述

用户点击「AI 智能填表」按钮后，系统通过**单次流式 Vision API 调用**，边生成边回填：

- 即时感知：标题/类目 2-3 秒内率先出现
- 流式填写：SKU 名称逐条填入，无需等待全部完成
- 兜底机制：流结束用完整 JSON 做最终回填，确保零遗漏

返回内容：
- 产品中文标题、短标题、类目、卖点描述
- 每个 SKU 的中文款式名称 + 英文款式名称（同一对象，天然对应）
- Shopee 平台英文标题、英文描述、材质属性

---

## 二、执行流程

```
用户点击「AI 智能填表」
  │
  ├─ handleAiFill()
  │   ├─ 收集主图路径 (1条) + SKU图路径 (N条)
  │   ├─ 收集上下文 (productTitle/category/originalFileNames/folderName)
  │   │
  │   └─ IPC: callAiVision({ mainImagePaths, skuImagePaths, skuIds, existingNames, ... })
  │       → IPC 传输体积 ~500B（原 ~500KB base64）
  │         │
  │         └─ main/index.ts
  │             ├─ 主进程并发处理所有图片:
  │             │   └─ prepareImageBase64(path) → 读mtime查缓存
  │             │       ├─ 命中 → 0ms 返回 base64
  │             │       └─ 未命中 → readFile + Sharp压缩 480px/60% → 写缓存
  │             │
  │             ├─ contentParts 构造 (主图+结构化上下文+SKU标签+图片)
  │             ├─ fetch doubao API (stream: true)
  │             └─ 流式读取 → 每收到 delta → send('ai-vision-stream', { delta })
  │                 └─ 流结束 → send('ai-vision-stream', { done: true, data: parsed })
  │
  └─ 渲染进程流式接收
      ├─ StreamJsonParser.feed(delta) → 正则实时提取:
      │   ├─ "title" → setProductInfo  (2-3秒出现)
      │   ├─ "shortTitle" / "category" / "description"
      │   ├─ "shopee.title" → setShopeeInfo
      │   └─ { skuId, skuName, skuNameEn } → updateSkuItem (逐条填入)
      │
      └─ done 事件 → finalBackfill(data) → 完整 JSON 兜底回填
```

---

## 三、图片收集与处理规则

### 3.1 架构：压缩统一移到主进程

**旧架构**（v4.5 早期）：
```
渲染进程: readFileBase64 IPC → Canvas 压缩 → IPC 传 base64 → 主进程 Sharp 再压缩
问题: 同一张图被处理两遍，Canvas 压缩阻塞 UI 线程
```

**新架构**（当前）：
```
渲染进程: 只传文件路径 (string[])
主进程: 并发 fetch stat → 查 mtime 缓存 → 未命中则 Sharp 压缩 → 写缓存
优势: 消除双重压缩，IPC 传输体积从 ~500KB 降至 ~500B
```

### 3.2 主图收集
```
images.filter(label含'主图').slice(0, 1) → 取第一张主图路径
```

### 3.3 SKU 图收集
```
skuList 全部条目 → 所有 SKU 都传路径
needAiName=true → existingNames[i] = ''
needAiName=false → existingNames[i] = colorName (告知AI中文名已有)
```

---

## 四、图片压缩参数

| 参数 | 值 |
|------|-----|
| maxWidth | 480 px |
| maxHeight | 480 px |
| 质量 | 60% (JPEG) |
| 格式 | JPEG |
| 处理引擎 | Sharp (主进程) |
| 并发策略 | Promise.all (主进程) |
| 缓存策略 | 路径::mtime key, FIFO 100条, mtime 失效 |

### 4.1 缓存预热

进入图片标注页 (Step2) 时，`ImageGrid.tsx` 的 `useEffect` 自动触发：
```typescript
window.electronAPI.preheatImageCache(allPaths)
```
- 后台静默执行，并发 5 张/批次
- 不阻塞用户标注操作
- 点 AI 填表时缓存已全部命中（图片处理耗时 <10ms）

### 4.2 缓存生命周期
```
命中 → 0ms 返回（无磁盘 I/O + 无 Sharp 压缩）
写入 → FIFO，超过 100 条淘汰最早项
mtime 失效 → 文件修改后自动重新压缩
主动清理 → 切换产品(productCode 变化)或 IPC clear-image-cache
```

---

## 五、并发处理架构

### 5.1 主进程统一处理

```typescript
const [mainBase64List, skuBase64List] = await Promise.all([
  Promise.all(mainImagePaths.map(p => prepareImageBase64(p, stats))),
  Promise.all(skuImagePaths.map(p => prepareImageBase64(p, stats).catch(() => ''))),
])
console.log(`[图片处理] 共 N 张，耗时 Xms，命中 Y 张，压缩 Z 张`)
```

- 所有图片（主图+SKU图）在一次 `Promise.all` 中并发处理
- 每张图独立查缓存，互不阻塞
- 缓存预热后全命中，耗时 <10ms

---

## 六、流式 contentParts 构造与事件推送

### 6.1 contentParts 结构

```
[0] 主图 image_url
[1] 结构化上下文 text (1次)
    └─ 文件夹名 / 标题 / 类目 / 原始文件名列表
    └─ 任务说明 / SKU命名规则 / 英文名规则 / Shopee规则 / JSON格式

[2..N] SKU条目:
  ├─ 中文名已定 → image + text("中文名已确定，请翻译英文名")
  ├─ 需识别 → text + image
  └─ 图片失败 → text("图片读取失败，请推测")
```

### 6.2 流式推送

```typescript
fetch(api, { body: { stream: true } })
  → res.body.getReader()
  → 逐行解析 SSE: "data: {...}"
  → 提取 delta = chunk.choices[0].delta.content
  → event.sender.send('ai-vision-stream', { delta })

// 流结束
  → JSON.parse(fullContent)
  → event.sender.send('ai-vision-stream', { done: true, data: parsed })
```

---

## 七、AI 模型参数

| 参数 | 值 |
|------|-----|
| 模型 | `doubao-seed-1-6-flash-250828` |
| max_tokens | 2000 |
| stream | true |
| API 端点 | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |

---

## 八、System Prompt 全文

```
[PRODUCT CONTEXT — PRIMARY SOURCE, READ FIRST]
素材包文件夹: [{productCode}] {shortTitle}_素材包
产品中文标题: {productTitle}
产品类目: {productCategory}
原始图片文件名:
  [0] filename1.jpg
  ...

[YOUR TASK]
你是一个跨境电商选品与数据录入及本地化专家。
基于以上产品上下文，结合图片内容作为辅助确认，请一次性完成以下任务：

1. 确认或优化产品中文标题(title, ≤60字)
2. 生成短标题(shortTitle, ≤10字)，用于文件夹命名
3. 从 "包包挂件"、"手机挂件"、"车内配饰"、"毛绒玩具" 中选择最合适的类目(category)
4. 生成卖点描述(description)
5. 对标记为"请识别此图"的 SKU 图片生成款式名称（中文 + 英文，同步输出）
6. 额外任务：同步生成 Shopee 平台优化的英文推广内容

[SHOPEE PLATFORM LOCALIZATION RULES]
- 标题 (shopee.title): 英文 Title Case，34-180个字符，自然融入3个热搜关键词
- 描述 (shopee.descriptionText): 500-1500字符，纯文本，包含 [IMAGE] 占位符
- 材质 (shopee.material): 2-4个英文材质词，逗号分隔

[SKU 命名规则]
- 每张图必须生成不同的款式名称，禁止多张图返回相同名称
- 优先参考原始文件名提取变体特征
- 对于标注"中文名已确定"的SKU：skuName必须原样使用提供的中文名不要修改
- 请确保skus数组中每个skuId都对应一条记录，不要遗漏任何SKU

[ENGLISH SKU NAME RULES]
- 每个 SKU 必须同时生成对应的英文款式名称（skuNameEn）
- 英文名 2-5个单词，Title Case，用于 Shopee 等跨境平台

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

### 9.1 流式回填 (StreamJsonParser)

边接收 delta 边用正则实时提取：

| 正则模式 | 字段 | 触发时机 |
|---------|------|---------|
| `"title"\s*:\s*"([^"]+)"` | 产品标题 | 2-3秒 |
| `"shortTitle"\s*:\s*"([^"]+)"` | 短标题 | 紧随其后 |
| `"category"\s*:\s*"([^"]+)"` | 类目 | 紧随其后 |
| `"description"\s*:\s*"([^"]+)"` | 描述 | 紧随其后 |
| `"shopee"\s*:\{...\}` | Shopee 标题 | 文本段 |
| `{ "skuId":"...", "skuName":"...", "skuNameEn":"..." }` | SKU 对象 | 逐条 |

### 9.2 最终兜底回填

流结束时用完整 JSON 做 `finalBackfill`：
- 生成产品编码 (shortTitle → code)
- 补填 Shopee 描述和材质
- 确保所有 SKU 都已回填
- JIT 邀请码自动设置 (category==='BG')

---

## 十、已知问题与修复记录

| # | 问题 | 修复日期 | 修复方式 |
|---|------|---------|---------|
| ✅ 1 | 中英文 SKU 名称来自两次独立 AI 调用，顺序错位 | 2026-05-27 | 合并为一次调用，中英文同属一个 skus 对象 |
| ✅ 2 | Shopee AI 覆盖已生成的 skuNameEn | 2026-05-27 | Shopee AI 不再返回 skuNamesEn |
| ✅ 3 | needAiName=false 的 SKU 不传图，AI 不返回该 SKU | 2026-05-27 | 全部 SKU 都传图 + 改 label |
| ✅ 4 | b64 为空时整个 SKU 被跳过 | 2026-05-27 | b64 为空时仍发送文字降级标签 |
| ✅ 5 | SKU 初始化无去重 | 2026-05-27 | 按 skuSpec + colorName 两级去重 |
| ✅ 6 | Sharp 图片压缩无缓存，重复计算 | 2026-05-27 | ImageCompressionCache FIFO + mtime 失效 |
| ✅ 7 | 单 SKU 翻译始终调用 Vision | 2026-05-27 | translateSingleSku 智能降级 |
| ✅ 8 | 渲染进程 Canvas 双重压缩 + 阻塞 UI | 2026-05-27 | 压缩统一移到主进程 Sharp |
| ✅ 9 | 用户等待 AI 全部返回才看到结果 | 2026-05-27 | 流式返回 + StreamJsonParser 实时填写 |
| ✅ 10 | 每次填表都重新压缩图片 | 2026-05-27 | 缓存预热 + mtime 失效策略 |

---

## 十一、性能数据

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| IPC 传输体积 | ~500KB | ~500B |
| UI 线程阻塞 | Canvas 压缩阻塞 | 无阻塞 |
| 图片处理耗时（预热后） | - | <10ms |
| 用户感知到第一个结果 | 5-15秒 | 2-3秒 |
| 一次填表 API 调用 | 1+1 (Vision+Shopee) | 1 次流式 Vision |
| Sharp 缓存命中率 | - | 100% (预热后) |

---

## 十二、下一步优化方向（待实现）

| # | 方向 | 预期收益 |
|---|------|---------|
| 1 | AI 返回 schema 校验 (jsonschema/zod) | 容错性提升 |
| 2 | Token 使用日志 | 可观测性 |
| 3 | 批量 SKU 翻译合并 (N次→1次) | 耗时 -70% |
