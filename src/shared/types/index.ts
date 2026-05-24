// ==================== 统一导出入口 ====================

export type { ImageLabel, ImageFile } from './image'

export type {
  ProductInfo,
  SkuSpecRow,
  ProductOutput,
  OuterPackaging,
  SkuOutput,
  OrganizeRequest,
  OrganizeResult,
  ScanFolderRequest,
  ScanFolderResult,
} from './product'

export type { SkuItem, SpuData, PackagingPreset, DbConfig } from './sku'

export type { ShopeeInfo, ShopeeAttributes } from './shopee'

export type {
  R2Config,
  UploadTask,
  UploadQueueState,
  R2ImageEntry,
  R2Metadata,
} from './r2'

export type { PimExtension } from './pim'

export type { AssetDescriptor, AssetManifest } from './assets'
