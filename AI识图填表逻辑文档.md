# AI 识图填表 — 完整逻辑文档

## 一、触发入口

**文件**：`src/renderer/src/components/ProductForm.tsx`  
**函数**：`handleAiFill`  
**触发方式**：用户在「产品基础信息」卡片中点击 `🎨 AI 智能填表` 按钮

> **性能优化 (v1.2)**：主图+SKU 并发读取、仅传需识别图片、512px压缩、单张主图、进度提示。

---

## 二、执行流程总览

```
用户点击按钮 → "正在读取图片..."
    ↓
① 收集主图（1张）+ needAiName=true 的 SKU 图
    ↓
② Promise.all 并发：主图 + 需识别的 SKU 图 → 同时读磁盘+Canvas压缩
    ↓
③ "正在调用 AI 识别..."
    ↓
④ 构造 AI payload（仅传需识别的图，已有名的仅文本标签）
    ↓
⑤ 通过 IPC → 主进程 → 火山引擎 Doubao API
    ↓
⑥ 解析 AI JSON → "正在填写表单..."
    ↓
⑦ 回填：标题/短标题/描述/类目/SKU名称
    ↓
⑧ useEffect 自动触发 SKU 编码生成
```

---

## 三、详细步骤

### 步骤①：收集图片

```typescript
const mainImages = images.filter(img => img.labels.includes('主图')).slice(0, 3)
// SKU 图从 skuList（Store 状态）中获取，遍历全部 skuList
```

- **主图**：从 `images`（ImageFile[]）中筛选标签含 `主图` 的，取前 3 张
- **SKU 图**：从 `skuList`（SkuItem[]）中获取全部，按索引遍历
- 每个 SKU 携带两个关键标记：
  - `skuIds[i]` = `imagePath` 的归一化路径（反斜杠 → 正斜杠）
  - `existingNames[i]` = 已有名称（`needAiName: false` 时 = `colorName`，否则为空）

### 步骤②：图片读取与压缩

```typescript
const readB64 = async (imgPath: string): Promise<string> => {
  if (!window.electronAPI) return ''
  const raw = `data:image/jpeg;base64,${await window.electronAPI.readFileBase64(imgPath)}`
  return compressImageBase64(raw)  // ← 核心压缩
}
```

**压缩参数**（`compressImageBase64`）：

| 参数 | 值 | 说明 |
|---|---|---|
| `maxWidth` | 1024 px | 最大宽度 |
| `maxHeight` | 1024 px | 最大高度 |
| `quality` | 0.8 (80%) | JPEG 质量 |

**压缩流程**：
1. 创建 `new Image()` 加载 Base64
2. `img.onload` → 检查宽高 → 等比缩放 → `canvas.drawImage` → `canvas.toDataURL('image/jpeg', 0.8)`
3. Canvas 创建失败或图片加载失败 → 降级返回原图

**耗时瓶颈**：每张图片的 `readFileBase64`（IPC 到主进程读磁盘）+ `compressImageBase64`（Canvas 渲染）。主图用 `Promise.all` 并发，SKU 图在 `for` 循环中逐个 `await`。

### 步骤③：构造 AI 请求

**文件**：`src/main/index.ts` — IPC 通道 `call-ai-vision`

**Content Parts 结构**（`messages[0].content` 数组）：

```
[主图1] [主图2] [主图3]              ← 直接 image_url
[text] SKU_ID: D:/img/a.jpg — 已有名称，无需识别   ← 文本标签
[SKU图1]                               ← image_url
[text] SKU_ID: D:/img/b.jpg — 请识别此图的款式名称  ← 文本标签
[SKU图2]                               ← image_url
...
[text] 系统 Prompt（约 300 tokens）    ← 最后的文本指令
```

**AI 模型参数**：

| 参数 | 值 |
|---|---|
| 模型 | `doubao-seed-2-0-lite-260428` |
| `max_tokens` | 2000 |
| API 端点 | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |

### 步骤④：IPC 通道

**渲染进程**：`window.electronAPI.callAiVision(payload)`  
**预加载**：`src/preload/index.ts` → `ipcRenderer.invoke('call-ai-vision', payload)`  
**主进程**：`src/main/index.ts` → `ipcMain.handle('call-ai-vision', ...)`

### 步骤⑤：火山引擎 API 调用

```typescript
const res = await fetch(`${config.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  },
  body: JSON.stringify({
    model: config.model,
    messages: [{ role: 'user', content: contentParts }],
    max_tokens: 2000,
  }),
})
```

### 步骤⑥：解析 AI 返回

```
AI 原始返回 → 去 Markdown 标记 → JSON.parse → {
  title, shortTitle, category, description, skus: [{skuId, skuName}]
}
```

**容错**：JSON 解析失败时打印原始内容前 500 字符到控制台，并返回错误。

### 步骤⑦：回填表单

| AI 字段 | 回填目标 | 方法 |
|---|---|---|
| `title` | `productInfo.title` | `setProductInfo` |
| `shortTitle` | 短标题 + 产品编号 | `setShortTitle` + `generateProductCode` |
| `description` | `productInfo.description` | `setProductInfo` |
| `category` | `currentSpu.categoryCode` (类目下拉框) | `updateSpu({ categoryCode })` |
| `skus[].skuName` | 对应 SKU 的 `colorName` | `updateSkuItem(index, { colorName, needAiName: false })` |

**SKU 名称匹配方式**：通过 `imagePath` 归一化后与 AI 返回的 `skuId` 进行 `findIndex` 精准匹配。

### 步骤⑧：编码联动（自动触发）

```typescript
useEffect(() => {
  // 监听 currentSpu.categoryCode 变化 + skuList 中 colorName 变化
  const catCode = getCategoryCode(categoryName)
  const updated = skuList.map((sku, i) => ({
    ...sku,
    skuCode: `${catCode}-${getStyleCode(sku.colorName)}-${String(i+1).padStart(4,'0')}`
  }))
  setSkuList(updated)
}, [currentSpu?.categoryCode, skuList.map(s => s.colorName).join(',')])
```

---

## 四、耗时分析

| 阶段 | 操作 | 耗时因素 |
|---|---|---|
| 图片读取 | `readFileBase64` IPC 调用 | 每秒约 2-5 张（取决于磁盘/SSD 速度） |
| 图片压缩 | Canvas 缩放 + JPEG 编码 | 每张约 50-200ms |
| AI 推理 | API 网络请求 + 模型推理 | 2-15 秒（取决于图片数量和数据中心负载） |
| 总计 | 3 张主图 + N 张 SKU 图 | **通常 5-30 秒** |

**优化建议**：
1. 主图并发读取（`Promise.all`）— 已实现
2. SKU 图改为并发读取，而非 `for` 循环串行 — **待优化**
3. 压缩参数适当降低（如 `maxWidth=800, quality=0.6`）以减少传输体积

---

## 五、完整调用链

```
ProductForm.tsx
  handleAiFill()
    ├─ readB64() × N                    // 并发读取+压缩主图
    │   ├─ window.electronAPI.readFileBase64()  // IPC → 主进程 fs.readFile
    │   └─ compressImageBase64()               // Canvas 压缩
    ├─ readB64() × M (for循环)          // 逐个读取+压缩 SKU 图
    │   └─ (同上)
    └─ window.electronAPI.callAiVision(payload)
        └─ [IPC] src/main/index.ts
            └─ fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions')
                ├─ POST body: { model, messages: [contentParts], max_tokens: 2000 }
                ├─ 等待 AI 返回 ~2-15s
                ├─ JSON.parse(response)
                └─ return { success: true, data: parsed }
            ← [IPC 返回]
    ← 回填表单
```

---

## 六、AI System Prompt 全文

```
你是一个跨境电商选品与数据录入专家。我为你提供了一系列产品图片，
在每张 SKU 图片之前，我都用文本标明了该图片的【SKU_ID】。

请你仔细观察标记为"请识别此图"的 SKU 图片，为它生成一个精准且吸引人的
【SKU 款式名称】。
- 不要仅局限于颜色！可以是款式、样式、图案、材质或特定风格
  （如："miu系挂绳针织裙"、"复古做旧款"、"珍珠白蝴蝶结"、"库洛米同款"）。
- 名字简练，控制在 10 个中文字符以内。
- 如果标记为"已有名称，无需识别"，请跳过，不要在 skus 数组中返回它。

此外：
1. [category] 必须且只能从 "包包挂件"、"手机挂件"、"车内配饰"、"毛绒玩具" 中选择。
2. 为产品生成标题(title，≤60字)、短标题(shortTitle，≤10字)、卖点描述(description)。

⚠️【极其重要】：在输出的 JSON 中，skus 数组内的每一个对象，必须包含 skuId 字段，
且该字段的值必须与我发给你的图片标签【SKU_ID】完全一致！绝对不能张冠李戴！

输出纯 JSON，不带 Markdown 代码块，格式如下：
{
  "title": "...",
  "shortTitle": "...",
  "category": "包包挂件",
  "description": "...",
  "skus": [
    { "skuId": "a_001", "skuName": "茱萸粉毛球款" }
  ]
}
```

---

## 七、SKU 名称来源优先级（初始化时）

```
1. img.skuSpec 已有值（标注阶段手动或 AI 填写）  →  直接使用
2. 文件名有意义（如 "珍珠白.jpg"）            →  extractSkuFromFilename 提取
3. 文件名无意义（如 "IMG_4829.jpg"）           →  needAiName: true，等待 AI 填充
```

**文件名黑名单**（`isInvalidFilename`）：`微信` `wechat` `qq` `钉钉` `dingtalk` `img_` `dsc_` `pxl_` `dcim` `screenshot` `屏幕截图` `截屏` `batch` `chatgpt` `midjourney` `mj_` `dall` `sd_` `stable_diffusion` `未命名` `untitled` `新建` `temp` `tmp` `image` `picture` `photo` `pic` `下载` `download` `草图` `无标题` `画板` + 纯数字/时间戳格式
