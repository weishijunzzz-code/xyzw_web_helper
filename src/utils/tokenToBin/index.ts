/**
 * Token转Bin文件模块导出
 * 提供token转换为bin文件的完整功能
 */

// 核心功能
export {
  convertTokenToBin,
  buildBinFile,
  tokenToBinComplete,
  downloadBinFile,
  saveBinToLocal,
  getBinFromLocal,
} from "../tokenToBin";

// 验证功能
export {
  validateBinFile,
  parseBinFile,
  getBinFileInfo,
  verifyBinSign,
  isBinExpired,
  formatBinInfo,
} from "../binValidator";

// 类型定义
export type {
  TokenToBinConfig,
  CombUser,
} from "../tokenToBin";

export type {
  ValidationResult,
  ParseResult,
  BinFileInfo,
} from "../binValidator";
