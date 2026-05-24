// 类型定义已拆分至 src/shared/types/ 目录
// 此文件作为兼容入口，重新导出所有类型
//
// 拆分结构:
//   types/image.ts   - ImageLabel, ImageFile
//   types/product.ts - ProductInfo, ProductOutput, OrganizeRequest/Result, ScanFolderRequest/Result
//   types/sku.ts     - SkuItem, SpuData, PackagingPreset, DbConfig
//   types/shopee.ts  - ShopeeInfo (v4 新增)
//   types/r2.ts      - R2Config, UploadTask, UploadQueueState, R2Metadata
//   types/pim.ts     - PimExtension (v4 新增)
//   types/index.ts   - 统一导出

export type {
  ImageLabel,
  ImageFile,
  ProductInfo,
  SkuSpecRow,
  ProductOutput,
  SkuOutput,
  OrganizeRequest,
  OrganizeResult,
  ScanFolderRequest,
  ScanFolderResult,
  SkuItem,
  SpuData,
  PackagingPreset,
  DbConfig,
  ShopeeInfo,
  ShopeeAttributes,
  R2Config,
  UploadTask,
  UploadQueueState,
  R2ImageEntry,
  R2Metadata,
  PimExtension,
} from './types'
