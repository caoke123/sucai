// ==================== Shopee 类型 ====================

// Store 侧使用的 UI 类型 (不变)
export interface ShopeeInfo {
  title: string
  descriptionText: string
  attributes: ShopeeAttributes
  leadTime: number
  minimumOrderQty: number
  jitInvitationCode: string
}

export interface ShopeeAttributes {
  brand: string
  origin: string
  size: string
}

// ==================== product.json v4.5 输出类型 ====================

export interface ProductPlatforms {
  shopee: PlatformShopee
}

export interface PlatformShopee {
  title: string
  description: string
  category: string[]
  attributes: PlatformShopeeAttributes
  logistics: ShopeeLogistics
  invitation: ShopeeInvitation
  status: 'draft' | 'active' | 'delisted'
  publishedAt: string | null
  shopeeItemId: string | null
}

export interface PlatformShopeeAttributes {
  brand: string
  origin: string
  '材质': string
  '图案': string
  '商品类型': string
  'Custom Product': string
}

export interface ShopeeLogistics {
  leadTime: number
  minimumOrderQty: number
  jit: boolean
}

export interface ShopeeInvitation {
  code: string
}
