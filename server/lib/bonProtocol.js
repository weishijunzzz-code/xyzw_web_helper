/**
 * bonProtocol 加载器
 * 从前端 src 目录加载 bonProtocol.js，避免维护两份代码
 * bonProtocol.js 是纯逻辑文件，不依赖浏览器 API，可以直接在 Node.js 中运行
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bonProtocolPath = path.resolve(__dirname, '..', '..', 'src', 'utils', 'bonProtocol.js');

let _module = null;

export async function loadBonProtocol() {
  if (_module) return _module;
  _module = await import(pathToFileURL(bonProtocolPath).href);
  return _module;
}

export async function getGUtils() {
  const mod = await loadBonProtocol();
  return mod.g_utils;
}
