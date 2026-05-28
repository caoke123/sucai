# 产品素材分拣工具 — OpenCode 项目说明

## 项目目的
帮助用户将本地产品图片按照妙手 ERP 的规范进行分类整理，输出标准素材包（含 product.json）。
Excel 导入模板由下游的 PIM 中台系统生成，本工具不涉及。

## 技术栈
- Electron 33 + electron-vite 2（桌面应用壳）
- React 18 + TypeScript 5（UI 层）
- Vite 5（构建工具）
- Tailwind CSS 3（样式，与 PIM 中台保持一致）
- Zustand 4 + immer（状态管理）
- sharp 0.33（图片处理，仅在主进程/Agent 中使用）
- Express 4（PIM 嵌入模式的本地 Agent）

## 两种运行模式
1. 独立 Electron 桌面应用：文件操作通过 IPC（ipcMain/ipcRenderer）
2. 嵌入 PIM 中台：文件操作通过本地 Express Agent（端口 18899）
   判断方式：检查 window.electronAPI 是否存在

## 项目结构关键说明
- src/shared/types.ts：所有类型定义，前后端共用，修改需同步通知
- src/main/：Electron 主进程，Node.js 环境，可用 fs/path/sharp
- src/renderer/：React 渲染进程，浏览器环境，不能直接用 fs
- src/renderer/hooks/useFileSystem.ts：封装两种模式的通信，所有文件操作必须经过此 Hook
- agent/：独立的 Express 服务，供 PIM 嵌入模式使用

## 输出的文件夹结构
产品主图/ SKU图/ 详情图/ 尺寸图表/ 产品证书/ 产品视频/（空）+ product.json

## 文件命名规则
- 主图：主图_1.jpg, 主图_2.jpg ...
- SKU图：规格值_序号.jpg，如 白色_1.jpg, 粉色_2.jpg
- 详情图：详情图_1.jpg, 详情图_2.jpg ...
- 尺寸图：尺寸_1.png ...
- 证书：证书_1.pdf ...

## UI 风格要求
- 与 PIM 中台一致，干净简洁，无渐变无阴影
- 主色 #4c6ef5，页面背景 #f8f9fa，卡片白色
- 字体：系统默认中文字体，正文 13px，标题 16px
- 边框：1px solid #e9ecef
- 圆角：6px（标准）/ 8px（卡片）

## 代码规范
- 所有注释使用中文
- 函数和变量命名使用英文
- 文件操作代码只写在主进程（main/）或 Agent（agent/）中
- 渲染进程只能通过 useFileSystem Hook 间接访问文件系统
- 禁止在渲染进程中直接 import 'fs' 或 'path'

## 当前进度
- [x] 步骤1：项目初始化 + 环境配置
- [x] 步骤2：shared/types.ts + 基础配置
- [x] 步骤3：主进程 IPC 模块 (organizeFiles / uploadQueue / r2Config / scanFolder / selectDirectory / dbHandlers / compressImages)
- [x] 步骤4：渲染进程组件开发 (ProductSorter / ProductForm / CompressStep / PreviewPanel / ImageGrid / OutputResult)
- [x] 步骤5：Agent 服务 (agent/server.ts — Express HTTP API, 端口 18899)
- [x] 步骤6：打包与部署
- [x] v4.8：PostgreSQL 数据库集成 (spu_seq → SPU/SKU全局唯一编码 / assets素材记录 / publish API)
- [x] v4.8：图片压缩步骤 (Sharp 1000px/2MB / CompressStep UI)
- [x] v4.8：AI JSON 安全解析 (safeJsonParse)
