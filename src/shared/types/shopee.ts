// ==================== v4 Shopee 发布信息类型 ====================

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
  material: string
  size: string
}
