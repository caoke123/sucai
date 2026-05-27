// ==================== 统一导出入口 ====================

export type { ImageLabel, ImageFile } from './image'

export type {
  ProductInfo,
  SkuSpecRow,
  ProductOutput,
  InternalInfo,
  OrganizeRequest,
  OrganizeResult,
  ScanFolderRequest,
  ScanFolderResult,
} from './product'

export type {
  SkuItem,
  SpuData,
  PackagingPreset,
  DbConfig,
  ProductImage,
  ProductImages,
  SkuOutputV45,
  SkuSize,
  SkuPricing,
} from './sku'

export type {
  ShopeeInfo,
  ShopeeAttributes,
  ProductPlatforms,
  PlatformShopee,
  PlatformShopeeAttributes,
  ShopeeLogistics,
  ShopeeInvitation,
} from './shopee'

export type {
  R2Config,
  UploadTask,
  UploadQueueState,
  R2ImageEntry,
  R2Metadata,
  R2MetadataV45,
} from './r2'

export type { PimExtension } from './pim'

export type { AssetFile, ProductAssets } from './assets'

export type { CompressResult, CompressState } from './compress'
