# 雨图饰品 · 素材分拣系统 接手文档

> 编写日期：2026-05-27
> 适用对象：接手继续开发的同事
> 阅读时间：约15分钟

---

## 一、项目背景

### 这个系统是什么

一个 **Electron 桌面应用**，帮助运营人员将本地产品图片按照妙手 ERP 规范进行分类整理，输出标准素材包（含 product.json）。

### 当前完成度

五步操作流程已全部打通：选择文件夹 → 图片标注 → AI 智能填表 → 确认输出 → 云端同步。支持独立 Electron 桌面模式和嵌入 PIM 中台模式（通过本地 Express Agent）。

### 与 PIM 中台的关系

本工具是上游：生成 product.json + 图片 → 上传至 R2 云存储 → PIM 中台读取 R2 数据并导入妙手 ERP。Excel 导入模板由 PIM 中台系统生成，本工具不涉及。

---

## 二、快速启动

### 环境要求

- Node.js 18+
- pnpm 8+
- Windows（开发主平台，macOS/Linux 构建脚本已配置但未经测试）

### 启动命令

```bash
# 安装依赖
pnpm install

# 开发模式启动（Electron 桌面应用）
pnpm dev

# 仅启动 Agent 服务（PIM 嵌入模式，端口 18899）
pnpm agent

# 构建生产版本
pnpm build

# 打包（Windows zip）
pnpm dist
```

### 首次启动必须配置

**AI API Key（火山引擎 Doubao）：**

应用启动后，在界面顶部工具栏点击设置图标，填写：
- API Key：从火山引擎控制台获取
- Base URL：`https://ark.cn-beijing.volces.com/api/v3`
- Model：`doubao-seed-1-6-flash-250828`

**R2 云存储（Cloudflare R2）：**

在设置面板中填写：Account ID、Access Key ID、Secret Access Key、Bucket Name、自定义域名。不配置则跳过云端上传，本地导出不受影响。

---

## 三、项目结构

```
src/
├── main/                          # Electron 主进程（Node.js 环境）
│   ├── index.ts                   # ★ 核心入口：IPC handlers + AI 调用 + 缓存处理
│   ├── ipc/
│   │   ├── organizeFiles.ts       # 物理归档 IPC
│   │   ├── scanFolder.ts          # 文件夹扫描 + sharp 缩略图生成
│   │   ├── selectDirectory.ts     # 系统文件夹选择对话框
│   │   ├── uploadQueue.ts         # R2 上传队列管理
│   │   ├── r2Config.ts            # R2 配置读写（electron-store）
│   │   └── dbHandlers.ts          # 本地数据库操作（纸箱预设等）
│   └── services/
│       ├── ai/
│       │   ├── index.ts           # AI Service Layer（doubaoProvider）
│       │   ├── provider/          # API 调用封装
│       │   └── utils/compressImage.ts  # Sharp 图片压缩 + 缓存
│       ├── config/                # AI 配置文件读写
│       ├── export/
│       │   ├── buildProductJson.ts      # product.json 构建入口
│       │   ├── buildAssetManifest.ts    # 素材清单生成
│       │   ├── generateFolderStructure.ts # 创建文件夹骨架
│       │   ├── renameImages.ts          # 图片重命名与复制
│       │   └── versioning/exportV4.ts   # ★ product.json 输出结构定义
│       └── r2/                    # R2 存储客户端
├── preload/
│   └── index.ts                   # ★ IPC 桥接层（所有 electronAPI 在此暴露）
├── renderer/src/
│   ├── components/
│   │   ├── ProductSorter.tsx      # 步骤路由（5步切换）
│   │   ├── FolderPicker.tsx       # 步骤1：选择文件夹
│   │   ├── ImageGrid.tsx          # 步骤2：图片标注（含主图数量校验）
│   │   ├── ImageCard.tsx          # 单张图片卡片
│   │   ├── LabelToolbar.tsx       # 标注类型工具栏
│   │   ├── ProductForm.tsx        # ★ 步骤3：AI 填表 + 流式解析 + SKU 管理
│   │   ├── PreviewPanel.tsx       # 步骤4：确认输出
│   │   ├── OutputResult.tsx       # 步骤5：完成页
│   │   ├── UploadQueueBar.tsx     # R2 上传进度条
│   │   └── step3/sections/       # 步骤3的子区域组件
│   │       ├── BasicInfoSection.tsx    # 产品基础信息
│   │       ├── ShopeeInfoSection.tsx   # Shopee 发布信息
│   │       ├── SkuTableSection.tsx     # SKU 规格表格
│   │       └── PackagingSection.tsx    # 纸箱包装
│   ├── store/
│   │   └── useSorterStore.ts      # ★ Zustand 状态管理（含 immer + persist）
│   └── hooks/
│       └── useFileSystem.ts       # ★ 双模式文件系统抽象层
├── shared/
│   ├── constants.ts               # 全局常量（类目编码/材质列表/AI默认配置）
│   ├── migration.ts               # product.json 版本迁移
│   ├── types/                     # ★ 前后端共享类型定义
│   │   ├── product.ts             # ProductInfo / ProductOutput
│   │   ├── sku.ts                 # SkuItem / SkuOutputV45
│   │   ├── shopee.ts              # ShopeeInfo / PlatformShopee
│   │   └── ...
│   └── validation/
│       ├── rules/shopeeRules.ts   # Shopee 字段校验
│       └── types.ts               # ValidationContext
└── agent/
    └── server.ts                  # PIM 嵌入模式的 Express Agent
```

---

## 四、核心功能说明

### 4.1 五步操作流程

| 步骤 | 组件 | 做什么 |
|------|------|--------|
| 1 | FolderPicker | 选择源文件夹（含产品图片）+ 输出位置 → 扫描图片生成缩略图 |
| 2 | ImageGrid | 标注图片类型（主图/SKU图/详情图/尺寸图/证书），主图需 6-9 张 |
| 3 | ProductForm | AI 智能填表 + 手动编辑产品信息、SKU 规格、Shopee 发布内容 |
| 4 | PreviewPanel | 预览即将导出的数据结构和图片清单，确认后提交 |
| 5 | OutputResult | 显示导出结果，可打开文件夹或处理下一个产品 |

### 4.2 AI 智能填表

**触发位置：** 步骤3 `ProductForm` 顶部「AI 智能填表」按钮。

**一次调用返回：**
- 产品中文标题、短标题、类目、描述
- 材质（从 150+ 白名单中选）、图案（英文 Title Case）
- 每个 SKU 的中文名 + 英文名（≤28 字符）
- Shopee 英文标题（120-160 字符，含 ≥3 个关键词）、六段结构英文描述

**流式返回机制：**
主进程通过 `call-ai-vision` IPC → fetch Doubao API（stream: true）→ SSE 逐行解析 → 通过 `ai-vision-stream` 事件推送 delta → 渲染进程 `StreamJsonParser` 正则实时提取字段 → 边生成边回填 UI。

**详细文档：** `AI识图填表逻辑文档.md`

### 4.3 R2 云端同步

导出完成后自动将素材包加入上传队列，后台并发上传至 Cloudflare R2。支持断点续传、进度显示。

配置在应用设置面板中填写，通过 `electron-store` 持久化。

### 4.4 导出的 product.json

导出到素材包根目录，包含完整的产品信息（标题/描述/SKU 列表/Shopee 平台数据/R2 同步状态）。核心数据结构见 `SORTER_API_DOC.md`。

---

## 五、已知问题

| # | 问题 | 优先级 | 位置 |
|---|------|--------|------|
| 1 | 导出完成后重新选择文件夹，部分情况下新图片未正确加载 | 高 | FolderPicker.tsx / store reset 流程 |

---

## 六、待开发功能

| # | 功能 | 说明 |
|---|------|------|
| 1 | PIM 中台对接 | R2 数据同步到 PIM 系统 |
| 2 | AI 填表支持图案/材质字段 | Prompt 已更新，回填逻辑已完成，确认 AI 实际返回质量 |
| 3 | Agent 模式稳定性测试 | PIM 嵌入模式下 Express Agent 的完整流程验证 |

---

## 七、重要约定

### 代码规范

- 注释全部用中文，函数和变量用英文
- 不使用 `any` 类型
- 每次只改一件事，改完运行 `pnpm tsc --noEmit` 验证
- 文件操作代码只写在 `main/` 或 `agent/` 中，渲染进程通过 `useFileSystem` Hook 间接访问

### 不能动的地方

- `src/preload/index.ts` 的结构（改了会影响所有 IPC 通信）
- `src/shared/types/` 的字段名（前后端共用，改名需全局同步）
- System Prompt 的 JSON 输出格式（改了会破坏 StreamJsonParser 正则解析）

### 关键配置位置

| 配置项 | 位置 |
|--------|------|
| AI 模型参数 | `src/main/index.ts` System Prompt + fetch body |
| R2 配置 | 应用设置面板 → `src/main/ipc/r2Config.ts`（electron-store） |
| 图片压缩参数 | `src/main/services/ai/utils/compressImage.ts` |
| 工具版本号 | `src/shared/constants.ts` `TOOL_VERSION` |
| 类目编码表 | `src/shared/constants.ts` `CATEGORY_CODE_MAP` |
| UI 主题色 | 全局 CSS 变量，定义在 `src/renderer/src/assets/` |

---

## 八、关键文档索引

| 文档 | 内容 | 更新频率 |
|------|------|---------|
| `CLAUDE.md` | 项目规范 + 开发进度（OpenCode 专用） | 每次开发后 |
| `AI识图填表逻辑文档.md` | AI 填表完整机制（Prompt/流式/回填/缓存） | AI 功能变更时 |
| `SORTER_API_DOC.md` | product.json 结构 + R2 路径规则 + PIM 对接 | 数据结构变更时 |
| `HANDOVER.md`（本文档） | 接手文档 | 项目交接时 |

---

## 九、联系与交接

如有问题，以下文件包含最完整的上下文信息：
- `CLAUDE.md` — 开发规范和进度
- `AI识图填表逻辑文档.md` — AI 填表机制详解
- `src/main/index.ts` — 主进程所有业务逻辑入口
- `src/renderer/src/store/useSorterStore.ts` — 全局状态管理
