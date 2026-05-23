// 图片可以被标注的类别
export type ImageLabel =
  | '主图'
  | 'SKU图'
  | '详情图'
  | '尺寸图'
  | '证书'
  | '未分类';

// 每张图片的数据结构
export interface ImageFile {
  id: string;                    // 唯一 ID，如 "img_0"
  originalPath: string;          // 原始文件的完整路径
  thumbnailDataUrl: string;      // base64 缩略图，格式："data:image/jpeg;base64,..."
  fileName: string;              // 文件名，如 "DSC_0001.jpg"
  fileExt: string;               // 扩展名，如 ".jpg"
  labels: ImageLabel[];          // 当前标注的类别列表，默认 ["未分类"]（支持多标签）
  skuSpec?: string;              // SKU图专用：对应的规格值，如 "白色"
  size?: string;                 // SKU 尺寸，如 "10x5x5"
  weight?: string;               // SKU 重量（克），如 "200"
  order?: number;                // 同类图片中的排序编号（生成时自动赋值）
}

// 单个 SKU 的完整数据
export interface SkuItem {
  skuCode: string;
  colorName: string;
  dimensions: string;
  weight: number;
  costPrice: number;
  sellingPrice: number;
  imagePath: string;
  previewUrl?: string;
  needAiName?: boolean;
}

// SPU 产品聚合数据
export interface SpuData {
  spuCode: string;
  spuName: string;
  categoryCode: string;
  styleCode: string;
  outerPackLength: number;
  outerPackWidth: number;
  outerPackHeight: number;
  outerPackWeight: number;
}

// 纸箱包装预设
export interface PackagingPreset {
  id?: number;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
}

// 数据库连接配置
export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// SKU 规格行（一个规格组合）
export interface SkuSpecRow {
  id: string;                    // 唯一 ID
  spec1?: string;                // 规格1的值，如 "白色"
  spec2?: string;                // 规格2的值，如 "36"
}

// 产品基础信息（本工具录入，不含售价/库存，由 PIM 补充）
export interface ProductInfo {
  title: string;                 // 产品标题（必填）
  currency: string;              // 货币类型，默认 "CNY"
  sourceUrl: string;             // 货源链接
  sourcePlatform: string;        // 货源平台，如 "1688"
  productNo: string;             // 产品主编号
  category: string;              // 货源类目
  description: string;           // 详情描述
  attributes: string;            // 属性，用中文分号分隔
  spec1Name: string;             // 规格1的名称，如 "颜色"
  spec2Name: string;             // 规格2的名称，如 "尺码"
  skuSpecs: SkuSpecRow[];        // SKU 规格列表
}

// 整理完成后的输出 JSON（product.json）
export interface ProductOutput {
  title: string;
  productNo: string;
  category: string;
  description: string;
  outerPackaging: {
    length: number | null;
    width: number | null;
    height: number | null;
    weight: number | null;
    presetName: string;
  };
  skus: Array<{
    skuCode: string;
    skuName: string;
    size: string;
    weight: number;
    costPrice: number;
    sellingPrice: number;
    image: string;
  }>;
  createdAt: string;
  toolVersion: string;
}

// IPC 通信：整理文件的请求参数
export interface OrganizeRequest {
  sourceFolderPath: string;
  outputFolderPath: string;
  images: ImageFile[];
  productInfo: ProductInfo;
  shortTitle?: string;
  skuList?: SkuItem[];
  outerPackaging?: {
    length: number;
    width: number;
    height: number;
    weight: number;
    presetName: string;
  };
}

// IPC 通信：扫描文件夹的请求参数
export interface ScanFolderRequest {
  folderPath: string;
}

// IPC 通信：扫描文件夹的返回结果
export interface ScanFolderResult {
  success: boolean;
  images?: ImageFile[];
  error?: string;
}

// IPC 通信：整理文件的请求参数
export interface OrganizeRequest {
  sourceFolderPath: string;      // 原始图片所在文件夹
  outputFolderPath: string;      // 输出素材包的目标文件夹
  images: ImageFile[];           // 带标注信息的图片列表
  productInfo: ProductInfo;      // 产品基础信息
  shortTitle?: string;           // AI 生成的短标题，优先用于文件夹命名
}

// IPC 通信：整理文件的返回结果
export interface OrganizeResult {
  success: boolean;
  outputPath?: string;           // 生成的素材包完整路径
  error?: string;
}

// R2 云存储配置
export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  customDomain: string;
}

// 单个上传任务
export interface UploadTask {
  taskId: string;
  productNo: string;
  productName: string;
  localPackagePath: string;
  folderName: string;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  progress: number;
  totalFiles: number;
  uploadedFiles: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  completedAt?: string;
  publicBaseUrl?: string;
}

// 上传队列状态
export interface UploadQueueState {
  tasks: UploadTask[];
  isProcessing: boolean;
}
