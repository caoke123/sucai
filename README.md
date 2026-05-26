# 雨图饰品素材分拣系统 v4.0.0-beta.1

> 跨境电商产品图片分类整理 + AI 智能填表 + R2 云端同步

## 快速开始

```bash
npm install
npm run dev
```

## 核心功能

- **图片扫描与标注**: 文件夹扫描 → Sharp 缩略图 → 多标签标注 (主图/SKU图/详情图/尺寸图/证书)
- **AI 智能填表**: 豆包 Doubao 视觉模型自动识别产品标题/类目/SKU名称
- **AI 英文生成**: 一键生成 Shopee 英文标题/描述/材质/SKU英文名
- **SKU 编码**: 自动生成类目-风格-序号格式编码
- **素材包导出**: 标准化文件夹结构 + product.json v4
- **R2 云端同步**: 自动上传队列 (并发5x + retry 3次) + CDN URL 回写
- **发布前校验**: Shopee/SKU/图片 error/warning 分级
- **版本迁移**: v1/v2/v3 → v4 自动补全

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 33 |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS 3 |
| 状态管理 | Zustand 5 + Immer |
| 构建 | electron-vite 2 |
| 图片处理 | sharp 0.33 |
| AI 模型 | 豆包 Doubao (seed-1-6-flash) |
| 云存储 | Cloudflare R2 (S3 API) |

## 项目结构

```
src/
├── shared/          # 共享类型 + 常量 + 校验 + 迁移
├── main/            # Electron 主进程 (IPC + AI Pipeline + Export + R2)
│   ├── ipc/         # IPC Handler 层
│   └── services/    # AI / Export / R2 / Config
├── preload/         # contextBridge API
└── renderer/        # React UI (组件 + Store + Hooks)
```

## 文档

- [完整开发文档](docs/开发文档.md) — 技术架构 / 开发指南 / API 参考
- [V4 技术架构白皮书](docs/V4_ARCHITECTURE.md)
- [Release Checklist](docs/release-checklist.md)

## 开发

```bash
npm run dev       # 开发模式
npm run build     # 生产构建
npx electron-builder --win   # Windows 打包
```

## License

Private
