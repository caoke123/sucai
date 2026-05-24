// ==================== 图片标注类型 ====================

export type ImageLabel =
  | '主图'
  | 'SKU图'
  | '详情图'
  | '尺寸图'
  | '证书'
  | '未分类'

export interface ImageFile {
  id: string
  originalPath: string
  thumbnailDataUrl: string
  fileName: string
  fileExt: string
  labels: ImageLabel[]
  skuSpec?: string
  size?: string
  weight?: string
  order?: number
}
