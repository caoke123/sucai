# Release Checklist — v4.0.0-beta.1 RC-1

## 打包前检查

- [x] `src/shared/constants.ts` DEFAULT_AI_CONFIG.apiKey = '' (空字符串)
- [x] `src/main/ipc/r2Config.ts` accessKeyId/secretAccessKey = '' (空字符串)
- [x] `src/renderer/src/store/useSorterStore.ts` aiConfig.apiKey = '' (空字符串)
- [x] `ai-config.json` 不在 Git 跟踪中 (.gitignore)
- [x] `r2-config.json` 不在 Git 跟踪中 (.gitignore)
- [x] `SORTER_API_DOC.md` 不在 Git 跟踪中 (.gitignore)
- [x] `dist/` / `out/` / `node_modules/` 在 .gitignore
- [x] `npx tsc --noEmit` → 0 errors
- [x] `npm run build` → electron-vite build 成功
- [x] `npm run dev` → Electron 启动成功

## 密钥检查

- [x] 代码中无硬编码 API Key
- [x] 代码中无硬编码 R2 Secret
- [x] 默认配置模板密钥为空
- [ ] 轮换豆包 API Key (ark-83ad293a-... 已在 Git 历史中暴露)
- [ ] 轮换 Cloudflare R2 Access Key (已在 Git 历史中暴露)
- [ ] 运行 git-filter-repo 清理历史中的密钥
- [ ] force push 覆盖 GitHub remote

## Config 检查

- [x] `validateAiConfig()` — 缺失 apiKey 时返回 typed error
- [x] `validateR2Config()` — 缺失密钥时返回 typed error
- [x] 首次启动自动创建配置模板文件
- [x] 配置模板密钥为空, 用户通过设置面板填入
- [x] AI Service 使用 `DEFAULT_AI_CONFIG_TEMPLATE`
- [x] uploadQueue 使用 `validateR2Config()` 检查配置

## Electron 安全检查

- [x] `contextIsolation: true`
- [x] `nodeIntegration: false`
- [x] preload 通过 `contextBridge.exposeInMainWorld`
- [x] preload 不暴露 fs / path / process
- [x] 所有 IPC channel 全 typed
- [x] renderer 无法直接 fetch (AI 调用仅主进程)
- [x] R2 上传仅主进程

## Preload 检查

- [x] `window.electronAPI` 类型完整 (index.d.ts)
- [x] `window.api` 数据库操作类型完整
- [x] 新增 `callShopeeEnglish` 类型完整
- [x] 无 `any` 类型暴露

## 上传检查

- [x] uploadQueue 3次重试, 2s 间隔
- [x] 上传失败本地文件保留
- [x] 上传失败队列不移除
- [x] R2 metadata v4 写入 (toolVersion/stockSummary)
- [x] 上传完成后写回本地 product.json

## 导出检查

- [x] organizeFiles 写入 v4 product.json
- [x] v4 product.json 含 localPath/shopee/pim/stock/skuNameEn
- [x] exportV4 builder 纯函数
- [x] buildProductJson 使用 versioning layer
- [x] PreviewPanel 预览结构与导出一致

## Windows 检查

- [x] `safePath()` 非法字符替换
- [x] `normalizePath()` 路径标准化
- [x] `getUniqueOutputPath()` 重复导出碰撞处理
- [x] electron-builder zip 生成成功 (122.9 MB)
- [ ] NSIS portable 构建 (网络问题, 需重试)
- [ ] 中文用户名路径测试
- [ ] OneDrive 路径测试
- [ ] 非管理员权限测试
- [ ] 超长路径测试
- [ ] 文件占用测试
- [ ] 无网络启动测试

## ⚠ Git 历史密钥暴露 (紧急)

Git 远程: `https://github.com/caoke123/sucai.git`

以下 commit 含真实密钥:
- `b3294ea` (v1.0.0): ai-config.json 含 API Key + r2Config.ts 含 R2 密钥
- `bf4fae5` (v3.0.0): r2Config.ts 含 R2 密钥

当前代码已清除, 但 Git 历史中仍可检索。

修复步骤:
```bash
# 1. 轮换密钥 (先在 Cloudflare/火山引擎控制台操作!)
# 2. 安装 git-filter-repo
pip install git-filter-repo

# 3. 清理 ai-config.json 中的 API Key
git filter-repo --path ai-config.json --invert-paths --force

# 4. 清理 r2Config.ts 中的 R2 密钥  
git filter-repo --path src/main/ipc/r2Config.ts --invert-paths --force

# 5. 重新推送
git push origin --force --all
git push origin --force --tags

# 6. 通知协作者重新 clone
```

## 发布包验证

- [x] `雨图饰品素材分拣系统-4.0.0-beta.1-win.zip` (122.9 MB)
- [ ] 解压后首次启动测试
- [ ] config 初始化测试 (config 文件自动生成)
- [ ] AI Pipeline 测试 (需用户填入 Key)
- [ ] R2 Upload 测试 (需用户填入 Key)
- [ ] export v4 全流程测试
- [ ] 大 SKU 数量 (>50) 性能测试
