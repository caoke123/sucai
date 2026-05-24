// ==================== 工具版本 ====================
// 与 package.json 保持同步，用于 product.json 的 toolVersion 字段
export const TOOL_VERSION = '4.0.0'

// ==================== 标签 → 文件夹名称映射 ====================
export const LABEL_TO_FOLDER: Record<string, string> = {
  '主图': '产品主图',
  'SKU图': 'SKU图',
  '详情图': '详情图',
  '尺寸图': '尺寸图表',
  '证书': '产品证书',
}

// 导出素材包需要的所有子文件夹名称
export const PACKAGE_SUB_FOLDERS: string[] = [
  '产品主图',
  'SKU图',
  '详情图',
  '尺寸图表',
  '产品证书',
  '产品视频',
]

// ==================== R2 分类映射 ====================
export const FOLDER_TO_R2_CATEGORY: Record<string, string> = {
  '产品主图': 'main',
  'SKU图': 'sku',
  '详情图': 'detail',
  '尺寸图表': 'size',
  '产品证书': 'certificate',
}

// ==================== 货源类目编码表 ====================
export const CATEGORY_CODE_MAP: Record<string, string> = {
  '包包挂件': 'BG',
  '手机挂件': 'PH',
  '车内配饰': 'CR',
  '毛绒玩具': 'TO',
}

// ==================== 风格/颜色系编码表 ====================
export const STYLE_CODE_MAP: Record<string, string> = {
  '白色系': 'WT',
  '棕色系': 'BR',
  '红色系': 'RD',
  '彩虹系': 'RB',
  '奶油风': 'CR',
  '黑色系': 'BK',
  '混色/其他': 'MX',
}

// ==================== 风格匹配关键字表 ====================
export const STYLE_KEYWORD_MAP: Record<string, string> = {
  '白': 'WT', 'white': 'WT', '银': 'WT',
  '棕': 'BR', '褐': 'BR', '啡': 'BR', '咖': 'BR', 'brown': 'BR',
  '红': 'RD', '粉': 'RD', '桃': 'RD', 'pink': 'RD', 'red': 'RD',
  '彩': 'RB', '虹': 'RB', '花': 'RB', 'rainbow': 'RB',
  '奶': 'CR', '米': 'CR', '黄': 'CR', 'cream': 'CR',
  '黑': 'BK', '灰': 'BK', 'black': 'BK',
}

// ==================== 默认 AI 配置 ====================
export const DEFAULT_AI_CONFIG = {
  apiKey: '',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  model: 'doubao-seed-1-6-flash-250828',
}

// ==================== v4 Shopee 默认值 ====================
export const DEFAULT_SHOPEE_VALUES = {
  brand: 'No Brand',
  origin: 'China',
  leadTime: 5,
  material: '',
  size: '',
}

// ==================== 素材包文件夹后缀 ====================
export const PACKAGE_SUFFIX = '_素材包'

// ==================== 图片扩展名过滤 ====================
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff']

// ==================== MIME 类型映射 ====================
export const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
}

// ==================== 文件名黑名单 ====================
export const INVALID_FILENAME_BLACKLIST = [
  '微信', 'wechat', 'qq', '钉钉', 'dingtalk',
  'img_', 'dsc_', 'pxl_', 'dcim', 'screenshot', '屏幕截图', '截屏',
  'batch', 'chatgpt', 'chat gpt', 'midjourney', 'mj_',
  'dall', 'sd_', 'stable_diffusion', 'stable diffusion',
  '未命名', 'untitled', '新建', 'temp', 'tmp',
  'image', 'picture', 'photo', 'pic', '下载', 'download',
  '草图', '无标题', '画板',
]

// ==================== 无意义文件名检测正则 ====================
export const MEANINGLESS_NAME_REGEX = [
  /^\d+$/,
  /^(img|dsc|image|pic)_?\d+/i,
  /^[a-fA-F0-9-]{8,}$/,
  /^[a-zA-Z]{8,}$/,
  /^O1CN|TB|wx_camera_/i,
]

// ==================== 上传并发数 ====================
export const UPLOAD_CONCURRENCY = 5
export const UPLOAD_MAX_RETRIES = 3
export const UPLOAD_RETRY_DELAY_MS = 2000

// ==================== 图片压缩默认参数 ====================
export const IMAGE_COMPRESSION = {
  maxWidth: 512,
  maxHeight: 512,
  quality: 0.65,
}

// ==================== 缩略图生成参数 ====================
export const THUMBNAIL_SIZE = {
  width: 200,
  height: 200,
  quality: 75,
}
