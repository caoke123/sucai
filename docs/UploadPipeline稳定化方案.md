# Upload Pipeline v1 稳定化 — 设计方案

> **版本**: v4.5.0  
> **日期**: 2026-05-26  
> **状态**: 设计阶段, 待确认后实施

---

## 当前架构分析

### 当前上传生命周期

```
OutputResult.tsx
  └─ uploadQueueAdd({ localPackagePath, folderName })
       │
       ├─ addTask()                         [内存]
       │   ├─ getAllFiles()                 [同步扫描]
       │   ├─ create UploadTask object       [纯内存]
       │   └─ processNext()
       │
       ├─ uploadProduct(task)
       │   ├─ getAllFiles() + getEmptyDirs()  [扫描]
       │   ├─ read originalJson                [JSON.parse]
       │   ├─ for (batch of allFiles)          [并发5x]
       │   │   └─ uploadFile() / uploadEmptyDir()
       │   │
       │   ├─ buildR2Metadata()               [构建 metadata]
       │   ├─ enrich images.main/detail/skus   [匹配 r2Url]
       │   ├─ upload product.json to R2        [PUT]
       │   └─ writeBack local product.json     [覆盖写入]
       │
       └─ task.status = 'done'               [内存]
```

### 风险矩阵

| 风险 | 触发条件 | 后果 | 等级 |
|------|---------|------|------|
| 任务内存丢失 | HMR restart / crash | 已上传文件丢失映射, 未执行 writeBack | 🔴 极高 |
| 批量 writeBack | 全部上传后统一回写 | 中途崩溃全部 r2Url 丢失 | 🔴 极高 |
| 非原子写入 | 崩溃发生在 writeFile 中途 | product.json 损坏 | 🟡 高 |
| path 不一致 | 不同模块 `path.join` 结果不同 | enrich 匹配失败, r2Url 为空 | 🟡 高 |
| 无恢复机制 | crash/restart 后 | 已上传的文件无状态记录 | 🟡 高 |

---

## 目标架构

### Upload Pipeline v1 稳定化后

```
OutputResult.tsx
  └─ uploadQueueAdd(...)
       │
       ├─ create UploadManifest              [文件持久化]
       │   └─ upload-manifest.json
       │
       ├─ uploadFiles (逐文件)
       │   ├─ upload single file
       │   ├─ mark manifest entry: status='success', r2Url=xxx
       │   ├─ immediateWriteBack               [逐文件原子写入]
       │   └─ save manifest                    [增量持久化]
       │
       └─ on complete
           ├─ upload final product.json to R2
           └─ delete upload-manifest.json      [清理]
```

---

## 阶段 1: Upload Manifest

### 1.1 Manifest 类型

```typescript
// src/shared/types/upload.ts (新增)

export interface UploadManifestEntry {
  id: string                         // uuid
  type: 'main' | 'detail' | 'sku'
  skuCode?: string                   // SKU 关联 (type='sku')
  localPath: string                  // 绝对路径, normalized
  relativePath: string               // 相对于素材包根目录
  r2Key: string                      // products/{folder}/{relativePath}
  r2Url: string                      // 上传成功后填写
  status: 'pending' | 'uploading' | 'success' | 'failed'
  retryCount: number
  errorMessage?: string
}

export interface UploadManifest {
  manifestVersion: 1
  taskId: string
  productNo: string
  localPackagePath: string
  folderName: string
  createdAt: string
  entries: UploadManifestEntry[]
}
```

### 1.2 Manifest 文件位置

```
{localPackagePath}/upload-manifest.json
```

与 product.json 在同一目录, 上传完成后自动删除。

### 1.3 实施步骤

1. `addTask()` → 扫描文件 → 构建 Manifest → 写入 `upload-manifest.json`
2. `uploadFile()` → 成功后立即更新对应 entry: `r2Url + status='success'`
3. 每次 entry 更新 → 写回 manifest 文件 (覆盖)
4. 全部完成 → 删除 manifest 文件

---

## 阶段 2: 路径标准化统一

### 2.1 统一函数

```typescript
// src/shared/utils/normalizePath.ts (新增, shared 层)

export function normalizeFilePath(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/')
}
```

### 2.2 需要统一的位置

| 来源 | 当前 | 改为 |
|------|------|------|
| ManifestEntry.localPath | `path.join(destDir, name)` | `normalizeFilePath(...)` |
| ManifestEntry.relativePath | `folder/newName` (手动拼接) | `normalizeFilePath(path.relative(base, full))` |
| pathToUrl Map key | `path.join(basePath, up.relativePath)` | `normalizeFilePath(path.join(...))` |
| enrich lookup | `pathToUrl.get(localPath)` | key 已是 normalized, 匹配前 normalize |
| product.json localPath | `file.destPath` (raw) | `normalizeFilePath(file.destPath)` |

### 2.3 变更范围

| 文件 | 变更 |
|------|------|
| `src/shared/utils/normalizePath.ts` | 新增 |
| `src/main/services/export/buildAssetManifest.ts` | localPath 使用 normalizeFilePath |
| `src/main/services/export/versioning/exportV4.ts` | 传入 normalize |
| `src/main/ipc/uploadQueue.ts` | Manifest 构建 + Map key 统一 |

---

## 阶段 3: 逐文件即时回写

### 3.1 当前流程 (批量)

```
uploadFile(a) → uploadFile(b) → uploadFile(c)
  ↓                              ↓
  └── ALL done ──→ enrich all ──→ writeBack all
```

### 3.2 新流程 (逐文件)

```
uploadFile(a) → success
  ├─ manifest.entry[a].r2Url = xxx
  ├─ manifest.entry[a].status = 'success'
  ├─ saveManifest()                    ← 持久化到 disk
  ├─ eagerEnrich(productJson, entry)   ← 更新 product.json 对应字段
  │   ├─ if type='main': images.main[i].r2Url = xxx
  │   ├─ if type='detail': images.detail[i].r2Url = xxx
  │   └─ if type='sku': skus[j].images.primary.r2Url = xxx
  └─ atomicWriteBack(productJson)      ← 临时文件 + rename

uploadFile(b) → ... (same)
uploadFile(c) → ... (same)
```

### 3.3 eagerEnrich 函数

```typescript
function eagerEnrich(
  productJson: Record<string, unknown>,
  entry: UploadManifestEntry,
): void {
  const images = productJson.images as Record<string, Array<Record<string, unknown>>>
  if (!images) return

  switch (entry.type) {
    case 'main':
    case 'detail': {
      const list = images[entry.type]
      if (!list) return
      const target = list.find(
        (img) => normalizeFilePath(img.localPath as string) === entry.localPath
      )
      if (target) target.r2Url = entry.r2Url
      break
    }
    case 'sku': {
      const skus = productJson.skus as Array<Record<string, unknown>>
      if (!skus) return
      const target = skus.find(
        (s) => s.skuCode === entry.skuCode
      )
      if (target) {
        const primary = (target as Record<string, unknown>).images as Record<string, unknown>
        if (primary?.primary) (primary.primary as Record<string, unknown>).r2Url = entry.r2Url
      }
      break
    }
  }
}
```

---

## 阶段 4: 原子写入

### 4.1 实现

```typescript
import { writeFile, rename } from 'fs/promises'

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + '.tmp'
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmpPath, filePath)  // 原子操作
}
```

### 4.2 失败保护

```
writeFile(tmp) → crash here → original file intact ✓
rename(tmp, original) → OS atomic ✓
```

### 4.3 适用范围

| 操作 | 改为原子 |
|------|---------|
| 逐文件 enrich 后 writeBack | ✓ |
| 最终 product.json upload to R2 | 不需要 (单向) |
| Manifest 保存 | ✓ |
| organizeFiles writeProductJson | 可选 (后续) |

---

## 阶段 5: Upload Recovery

### 5.1 任务持久化

```
{userData}/upload-tasks.json

结构:
{
  "tasks": [
    {
      "taskId": "...",
      "productNo": "...",
      "status": "pending" | "uploading",
      "localPackagePath": "...",
      "folderName": "...",
      "createdAt": "...",
      "manifestPath": "..."
    }
  ]
}
```

### 5.2 恢复流程

```
App 启动
  ├─ upload-tasks.json 存在?
  │   ├─ 无 → 正常启动
  │   └─ 有
  │       ├─ status='uploading'
  │       │   ├─ 展示恢复对话框: "检测到未完成上传任务, 是否恢复?"
  │       │   ├─ 用户确认
  │       │   │   ├─ 读取 upload-manifest.json
  │       │   │   ├─ 跳过 status='success' 的 entry
  │       │   │   └─ 重新上传 status='pending'/'failed' 的 entry
  │       │   └─ 用户取消 → 删除 manifest + task
  │       └─ status='pending' → 自动加入队列
  └─ 继续正常启动
```

### 5.3 对话框设计

```
┌─────────────────────────────────────┐
│   ⚠ 检测到未完成上传任务              │
│                                     │
│   产品: [LSJX00031] 蓝星三角趴小熊猫   │
│   进度: 已上传 3/6 个文件              │
│                                     │
│   [恢复上传]        [放弃任务]        │
└─────────────────────────────────────┘
```

---

## 阶段 6: Upload Logger

### 6.1 新增文件

```
src/main/services/upload/logger.ts
```

### 6.2 日志格式

```
[R2:taskId] uploadFile: 产品主图/主_1.jpg → ok (456ms)
[R2:taskId] enrich: main[0].r2Url = https://.../主_1.jpg
[R2:taskId] writeBack: atomic (12ms)
[R2:taskId] manifest: saved (3 entries)
[R2:taskId] recovery: 2 pending, 3 skipped
```

### 6.3 日志要求

- 每条日志包含 `taskId` 前缀 (可搜索)
- 不输出完整 JSON / 长路径
- 中文路径正常显示
- 错误日志含 `[R2 ERROR:taskId]` 前缀

---

## 任务生命周期

```
                    ┌──────────┐
                    │  pending  │
                    └────┬─────┘
                         │ addTask()
                    ┌────▼─────┐
                    │ scanning │  → getAllFiles()
                    └────┬─────┘
                         │ Manifest created → save to disk
                    ┌────▼─────┐
              ┌─────│uploading │
              │     └────┬─────┘
              │          │ per-file success → eagerEnrich + atomicWriteBack
              │     ┌────▼─────┐
              │     │  done    │  → delete manifest + upload-tasks entry
              │     └──────────┘
              │
              │     ┌──────────┐
              └─────│  failed  │  → retryCount < 3 → pending
                    └──────────┘  → retryCount >= 3 → failed (user retry)

  App restart
    └─ upload-tasks.json 存在 + status='uploading'
       └─ 恢复: skip success entries, re-upload pending/failed
```

---

## 修改文件列表

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/shared/utils/normalizePath.ts` | 新增 | 统一路径标准化 |
| `src/shared/types/upload.ts` | 新增 | UploadManifest 类型定义 |
| `src/main/services/upload/manifest.ts` | 新增 | Manifest 构建/保存/读取/清理 |
| `src/main/services/upload/logger.ts` | 新增 | 结构化上传日志 |
| `src/main/services/upload/eagerEnrich.ts` | 新增 | 逐文件即时回写 |
| `src/main/services/upload/atomicWrite.ts` | 新增 | 原子文件写入 |
| `src/main/services/upload/recovery.ts` | 新增 | 上传恢复 |
| `src/main/ipc/uploadQueue.ts` | 改 | Manifest 模式 + 逐文件回写 + 原子写入 + 日志 |
| `src/main/services/export/buildAssetManifest.ts` | 改 | localPath 使用 normalizeFilePath |
| `src/main/index.ts` | 改 | 启动时调用 recovery.checkAndRecover() |
| `src/renderer/src/components/UploadQueueBar.tsx` | 改 | 恢复对话框 |

---

## 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| Manifest 与 product.json 不同步 | 中 | 以 product.json 为准, manifest 仅辅助 |
| 逐文件 writeBack 增加 IO | 低 | 磁盘 IO 远小于网络 IO |
| Manifest 文件泄漏 | 低 | done/failed 后自动清理, 启动时清理孤儿 |
| 旧 task 格式不兼容 | 低 | manifestVersion 字段做版本校验 |
| recovery 逻辑复杂 | 中 | 仅恢复 pending/failed, 不恢复已完成 |

---

## 分阶段实施计划

| 阶段 | 内容 | 复杂度 | 风险 |
|------|------|--------|------|
| 1 | `normalizePath` 统一 + 接入现有 enrich | 低 | 低 |
| 2 | Manifest 类型 + 构建 + 保存 | 中 | 低 |
| 3 | 逐文件 eagerEnrich + atomicWriteBack | 高 | 中 |
| 4 | upload-tasks.json 持久化 + recovery 对话框 | 中 | 中 |
| 5 | Logger + 诊断完善 | 低 | 低 |
| 6 | 全流程回归测试 + R2 验证 | — | — |

**建议从阶段 1 开始, 每阶段独立 commit。**
