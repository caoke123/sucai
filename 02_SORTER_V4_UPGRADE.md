# 雨图素材分拣系统 v4.0 升级开发文档

> 基于版本：v3.0.0
> 升级目标版本：v4.0.0
> 更新日期：2026-05-24

---

## 一、升级目标

v3.0 已完成图片分类、素材包生成、R2 云同步。v4.0 的目标是：

1. **补充 Shopee 发布所需的全部产品字段**（价格、库存、属性、英文信息等）
2. **AI 自动生成**英文标题、英文描述、属性建议
3. **更新 product.json 数据结构**，使其成为覆盖发布全流程的完整数据源
4. **保持向后兼容**，v3.0 生成的旧 product.json 仍可读取

---

## 二、product.json v4.0 完整数据结构

```json
{
  // ────────── 基础信息（v3.0 已有）──────────
  "title": "棒球绳结三件套挂件（AI生成中文标题，供内部参考）",
  "productNo": "SG00022",
  "category": "包包挂件",
  "description": "含迷你棒球、小棒球棍、彩绳绳结，心形挂扣设计...",
  "createdAt": "2026-05-23T05:47:41.779Z",
  "toolVersion": "4.0.0",

  // ────────── 本地路径（v4.0 新增）──────────
  "localPath": "D:\\products\\[SG00022] 棒球绳结挂件_素材包",

  // ────────── 外包装（v3.0 已有，补充填写）──────────
  "outerPackaging": {
    "length": 23,
    "width": 13,
    "height": 16,
    "weight": 150,
    "presetName": "7号标准3层 (23×13×16cm)"
  },

  // ────────── Shopee 平台发布信息（v4.0 新增）──────────
  "shopee": {
    "title": "Baseball Bag Charm Keychain 3pcs Set Mini Ball Bat Rope Knot Heart Clip Sports Style",
    "descriptionText": "This adorable 3-piece baseball keychain set includes a mini baseball, a small bat, and a colorful rope knot, all connected with a heart-shaped clip. Perfect for adding a sporty and stylish touch to your bag or keys. Durable material, vibrant colors available.",
    "attributes": {
      "brand": "No Brand",
      "origin": "China",
      "material": "Resin, Rope",
      "size": ""
    },
    "leadTime": 5
  },

  // ────────── SKU 列表（v3.0 已有字段 + v4.0 新增字段）──────────
  "skus": [
    {
      "skuCode": "BG-CR-0001",
      "skuName": "橙黄棒球绳结",
      "size": "",
      "weight": 45,
      "costPrice": 3.5,
      "sellingPrice": 11.00,
      "stock": 100,
      "image": "IMG_2173.JPG",
      "imageUrl": "https://yutu.nv315.top/..."
    },
    {
      "skuCode": "BG-RD-0002",
      "skuName": "黑红棒球绳结",
      "size": "",
      "weight": 45,
      "costPrice": 3.5,
      "sellingPrice": 11.00,
      "stock": 100,
      "image": "IMG_2174.JPG",
      "imageUrl": "https://yutu.nv315.top/..."
    }
  ],

  // ────────── R2 云存储（v3.0 已有，不变）──────────
  "r2": {
    "basePath": "products/[SG00022] 棒球绳结挂件_素材包/",
    "baseUrl": "https://yutu.nv315.top/...",
    "syncedAt": "2026-05-23T05:47:56.813Z",
    "images": {
      "main": [{ "fileName": "主_4.jpg", "url": "https://..." }],
      "sku": [{ "fileName": "SKU_1.jpg", "url": "https://..." }],
      "detail": [{ "fileName": "详情_1.png", "url": "https://..." }],
      "size": [],
      "certificate": []
    }
  },

  // ────────── PIM 扩展字段（供将来使用）──────────
  "pim": {
    "syncedAt": null,
    "status": "draft"
  }
}
```

---

## 三、新增字段说明

### 3.1 顶层新增字段

| 字段 | 类型 | 说明 | 填写方式 |
|------|------|------|---------|
| `localPath` | string | 本地素材包根目录绝对路径 | 系统自动写入（Step 4 生成素材包时） |

### 3.2 `shopee` 对象（全部新增）

| 字段 | 类型 | 说明 | 填写方式 |
|------|------|------|---------|
| `shopee.title` | string | Shopee 英文商品标题（≤120字符） | AI 生成 + 人工审核 |
| `shopee.descriptionText` | string | 商品英文描述纯文字 | AI 生成 + 人工审核 |
| `shopee.attributes.brand` | string | 品牌，默认 "No Brand" | 人工填写，可预设默认值 |
| `shopee.attributes.origin` | string | 原产地，默认 "China" | 人工填写，可预设默认值 |
| `shopee.attributes.material` | string | 材质（英文） | AI 生成建议 + 人工确认 |
| `shopee.attributes.size` | string | 尺寸描述，可选 | 人工填写 |
| `shopee.leadTime` | number | 备货时间（天），默认 5 | 人工填写，可预设默认值 |

### 3.3 `skus[]` 新增字段

| 字段 | 类型 | 说明 | 填写方式 |
|------|------|------|---------|
| `skus[].stock` | number | 库存数量 | 人工填写（Step 3 SKU 表格新增列） |

### 3.4 `skus[]` 原有字段（需确保填写，不能为 0）

| 字段 | 说明 |
|------|------|
| `skus[].sellingPrice` | 售价，发布前必须 > 0 |
| `skus[].weight` | 单品重量（g） |
| `skus[].costPrice` | 成本价（可选，供内部参考） |

---

## 四、Step 3（填写产品信息）UI 改造

### 4.1 现有 Step 3 表单

目前 Step 3 只有：产品标题（中文）、类目、SKU 名称（AI填写）。

### 4.2 v4.0 新增表单区域

在 Step 3 新增以下 UI 区块：

---

#### 区块 A：Shopee 英文信息

```
┌─────────────────────────────────────────────────┐
│  Shopee 发布信息                    [AI 一键生成] │
├─────────────────────────────────────────────────┤
│  英文标题 *                                       │
│  [______________________________________] 0/120  │
│                                                  │
│  英文描述 *                                       │
│  [______________________________________]        │
│  [______________________________________]        │
│  [______________________________________]        │
│                                                  │
│  品牌        [No Brand          ▼]              │
│  原产地      [China             ▼]              │
│  材质 *      [___________________] (AI建议: 树脂) │
│  尺寸        [___________________] (可选)        │
│  备货时间    [5] 天                              │
└─────────────────────────────────────────────────┘
```

**AI 一键生成按钮逻辑：**
- 调用豆包 API（与现有 AI 填表逻辑一致）
- 传入参数：中文标题、中文描述、已识别的 SKU 名称列表、主图
- 生成内容：英文标题、英文描述、材质建议
- 生成后填入表单，用户可手动修改
- 字符数实时计数，标题超过 120 字符变红提示

---

#### 区块 B：SKU 表格新增列

在现有 SKU 表格（skuName / skuCode）后新增：

| SKU 名称 | SKU 编码 | **售价 (¥)** | **库存** | **重量 (g)** | **成本价 (¥)** |
|---------|---------|------------|--------|------------|--------------|
| 橙黄棒球绳结 | BG-CR-0001 | 11.00 | 100 | 45 | 3.50 |
| 黑红棒球绳结 | BG-RD-0002 | 11.00 | 100 | 45 | 3.50 |

**批量填写功能（提升效率）：**
- 在表格顶部增加「批量设置」行：售价、库存、重量、成本价各有一个输入框
- 点击「应用到全部」，将该值填入所有 SKU 对应列
- 单行仍可单独修改覆盖

---

#### 区块 C：外包装信息（已有，确保显示）

```
┌─────────────────────────────────────┐
│  外包装规格                           │
├─────────────────────────────────────┤
│  预设  [7号标准3层 (23×13×16cm)  ▼] │
│  或自定义: 长[  ] 宽[  ] 高[  ] cm  │
│  重量（含包装）[   ] g               │
└─────────────────────────────────────┘
```

---

### 4.3 Step 4（确认输出）新增展示

在预览界面新增「Shopee 发布信息预览」区块，让用户最后确认一次：
- 英文标题
- 属性汇总
- SKU 价格/库存汇总表

---

## 五、AI 生成逻辑设计

### 5.1 触发时机

用户点击「AI 一键生成」按钮时触发，不自动触发（避免用户未准备好就生成）。

### 5.2 Prompt 设计

系统提示词（System Prompt，固定不变）：

```
You are a professional cross-border e-commerce copywriter specializing in Shopee product listings. Your task is to generate optimized English product content strictly following Shopee platform rules and best practices.

SHOPEE PLATFORM RULES (non-negotiable, must follow exactly):
1. Title must be in English only. No minority languages, no made-up words.
2. Title length: between 34 and 180 characters (aim for 80-120 for best performance).
3. Every word in the title must start with a capital letter (Title Case).
4. Title must include exactly 3 trending/high-search keywords relevant to the product. Weave them naturally — do not keyword-stuff.
5. No keyword may appear more than once in the title.
6. Do not mention any platform names (e.g., Shopee, Amazon, Taobao, AliExpress) anywhere in title or description.
7. Do not mention any shop names or brand names other than the product's own brand.
8. Description must be in English only. No minority languages, no made-up words.
9. Description must not exceed 3000 characters total.
10. Description must include at least one image placeholder marker: [IMAGE] — place it at a natural break between sections.
11. SKU color/size/model names must use short English descriptions (e.g., "Orange Yellow", "Black Red", "Pink Purple").

OUTPUT FORMAT:
Return only a valid JSON object, no explanation, no markdown code blocks, no extra text.
{
  "title": "...",
  "descriptionText": "...",
  "material": "...",
  "skuNamesEn": ["...", "..."]
}
```

用户提示词（User Prompt，每次调用时填入产品数据）：

```
Generate Shopee English product content for the following product.

[PRODUCT DATA]
Chinese Title: {title}
Chinese Description: {description}
Category: {category}
SKU Color Names (Chinese): {skus.map(s => s.skuName).join(', ')}

[CONTENT REQUIREMENTS]

Title:
- Title Case (every word capitalized)
- 34–180 characters, aim for 80–120
- Include exactly 3 trending keywords for this product category, integrated naturally
- No duplicate keywords
- No platform names, no shop names

Description:
- Total length: 500–1500 characters (well under 3000 limit)
- Structure:
    Paragraph 1 (2–3 sentences): Lead with the strongest selling point. What makes this product special?
    [IMAGE]
    Paragraph 2 (2–3 sentences): Describe key features and what's included in the set.
    Paragraph 3 (1–2 sentences): Describe use cases or gifting scenarios.
- Plain text only, no markdown, no bullet points, no hashtags
- Do not mention any platform or shop names

Material:
- 2–4 English material terms, comma-separated
- Example: "Resin, Cotton Rope, Metal Clip"

SKU English Names:
- Translate each Chinese SKU color name to a short English description
- 2–3 words max per name, Title Case
- Example: "橙黄棒球绳结" → "Orange Yellow", "黑红棒球绳结" → "Black Red"
- Return as an array in the same order as the input SKU list

Return only the JSON object. No other text.
```

### 5.3 返回处理

返回的 JSON 共 4 个字段，处理逻辑如下：

| 字段 | 写入位置 | 验证规则 |
|------|---------|---------|
|  |  | 长度 34–180 字符，不满足则高亮警告；检查是否 Title Case |
|  |  | 长度不超过 3000 字符；检查是否包含  占位符 |
|  |  | 非空即可 |
|  | 写入各  | 数组长度必须与 skus 数组一致，否则报错 |

**解析失败处理：**
- JSON 解析失败：提示「AI 生成失败，请手动填写」，保留表单当前值不清空
- 字段验证不通过：填入值但标红对应字段，提示具体问题
- 所有字段生成后均可手动编辑修改

** 占位符说明：**
- AI 在描述文字中插入  标记，表示图片应插入的位置
- 发布器（YutuPublisher）在填写描述时，遇到  标记则上传一张详情图，其余文字正常输入
- 分拣系统在预览描述时，将  渲染为「📷 图片」提示标签

** 说明：**
- 新增  字段，存储 SKU 的英文短名称
- 用于 Shopee 规格填写时显示英文颜色名（Shopee 建议用英文简称描述颜色/尺寸）
- 在 SKU 表格中新增「英文名称」列，AI 生成后可手动修改

---

## 六、`localPath` 写入时机

在 Step 4「生成素材包」时，系统已知输出目录路径。在写入 `product.json` 时，同步写入：

```javascript
product.localPath = outputFolderPath  // Step 1 用户选择的输出目录 + 素材包文件夹名
// 示例: "D:\\products\\[SG00022] 棒球绳结挂件_素材包"
```

注意：这是**绝对路径**，在这台电脑上有效。如果素材包被移动到其他目录，需要手动更新此字段。这是已知限制，可以在 UI 上标注说明。

---

## 七、向后兼容处理

v4.0 读取旧 v3.0 的 product.json 时，以下字段可能不存在：

| 缺失字段 | 处理方式 |
|---------|---------|
| `localPath` | 弹出「请选择本地素材包目录」对话框，让用户手动指定 |
| `shopee` | 整个区块为空，用户手动填写或 AI 生成 |
| `skus[].stock` | 默认显示 0，提示用户填写 |
| `skus[].sellingPrice` | 默认显示 0，提示用户填写 |

---

## 八、数据校验（发布前检查）

在 Step 4 预览界面，新增校验提示：

| 校验项 | 规则 | 提示类型 |
|--------|------|---------|
| `shopee.title` | 非空，≤120字符 | 错误（必须修复） |
| `shopee.descriptionText` | 非空 | 错误 |
| `shopee.attributes.material` | 非空 | 警告（可跳过） |
| `skus[].sellingPrice` | 全部 > 0 | 错误 |
| `skus[].stock` | 全部 > 0 | 错误 |
| `localPath` | 目录存在 | 错误 |
| 主图数量 | ≥ 1 | 错误 |
| SKU 图完整性 | 每个 skuName 都有对应图片 | 错误 |

错误项不允许进入 Step 5（完成），警告项可以继续。

---

## 九、版本迁移说明

`product.json` 中 `toolVersion` 字段标识生成版本：

| toolVersion | 含义 |
|-------------|------|
| 1.x.x | 早期版本，无 r2 字段 |
| 3.x.x | 有 r2 字段，无 shopee / localPath / stock |
| 4.x.x | 完整结构 |

读取时根据 `toolVersion` 决定是否需要补全默认值，避免因字段缺失导致崩溃。

---

## 十、给 OpenCode 的开发指引

### 改动范围

| 文件/模块 | 改动类型 | 说明 |
|-----------|---------|------|
| `product.json` 写入逻辑 | 修改 | 新增 shopee / localPath / stock 字段 |
| Step 3 表单组件 | 修改 | 新增区块 A（Shopee英文信息）和区块 B（SKU表格新列） |
| Step 4 预览组件 | 修改 | 新增 Shopee 信息预览 + 校验提示 |
| AI 填表模块 | 修改 | 新增生成 shopee 字段的 Prompt 和解析逻辑 |
| Step 4 素材包生成 | 修改 | 写入 localPath 字段 |
| 向后兼容读取逻辑 | 新增 | 读取旧版 JSON 时补全默认值 |

### 不需要改动的部分

- Step 1（文件夹选择）
- Step 2（图片标注）
- SKU 编码生成逻辑
- R2 上传逻辑
- 整体状态管理架构

### 开发顺序建议

1. 先更新 product.json 类型定义（TypeScript interface）
2. 再改 Step 3 表单 UI
3. 再接入 AI 生成逻辑
4. 再改 Step 4 预览和校验
5. 最后改素材包生成时写入 localPath
