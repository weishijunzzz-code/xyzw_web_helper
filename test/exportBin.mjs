/**
 * 验证 BIN 导出数据流的测试脚本
 *
 * 模拟完整链路：
 * 1. 模拟扫码/bin导入方式存入 IndexedDB 的数据（g_utils.encode 默认 x 加密 → px 格式）
 * 2. 模拟导出时的 convertBinToLx 转换（px → pl）
 * 3. 模拟上号器 sh1.js 的 decryptBin + BonDecoder 解析导出文件
 * 4. 断言解析结果与原始数据一致
 */
import { g_utils, getEnc, bon } from "../src/utils/bonProtocol.js";

// ============ 上号器 sh1.js 的解密与解析逻辑（从 sh1.readable.js 还原） ============

function decryptBin(data) {
  var e = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (e.length < 5) return e;

  if (e[0] === 0x70 && e[1] === 0x6c) {
    // pl: lx 方案
    var t =
      (((e[2] >> 6) & 1) << 7) |
      (((e[2] >> 4) & 1) << 6) |
      (((e[2] >> 2) & 1) << 5) |
      ((e[2] & 1) << 4) |
      (((e[3] >> 6) & 1) << 3) |
      (((e[3] >> 4) & 1) << 2) |
      (((e[3] >> 2) & 1) << 1) |
      (e[3] & 1);
    for (var n = Math.min(100, e.length); --n >= 2; ) e[n] ^= t;
    e[0] = 4;
    e[1] = 34;
    e[2] = 77;
    e[3] = 24;
    // Node 环境模拟 window.lz4（bonProtocol 内部使用同一 lz4 库）
    return globalThis.__lz4.decompress(e);
  }

  if (e[0] === 0x70 && e[1] === 0x78) {
    // px: x 方案
    var t2 =
      (((e[2] >> 6) & 1) << 7) |
      (((e[2] >> 4) & 1) << 6) |
      (((e[2] >> 2) & 1) << 5) |
      ((e[2] & 1) << 4) |
      (((e[3] >> 6) & 1) << 3) |
      (((e[3] >> 4) & 1) << 2) |
      (((e[3] >> 2) & 1) << 1) |
      (e[3] & 1);
    for (var m = e.length; --m >= 4; ) e[m] ^= t2;
    return e.subarray(4);
  }

  return e;
}

// BON 解码器（与上号器 BonDecoder 一致，复用 bonProtocol 的 bon.decode 即可验证数据有效性）
const bonDecode = (bytes) => bon.decode(bytes);

// ============ 项目中 openGame / exportTokenBin 使用的 convertBinToLx ============

// 从 index.vue 还原的转换逻辑
function xDecrypt(e) {
  // x.decrypt: 提取 key → 全量 XOR → 去掉前4字节
  const t =
    (((e[2] >> 6) & 1) << 7) |
    (((e[2] >> 4) & 1) << 6) |
    (((e[2] >> 2) & 1) << 5) |
    ((e[2] & 1) << 4) |
    (((e[3] >> 6) & 1) << 3) |
    (((e[3] >> 4) & 1) << 2) |
    (((e[3] >> 2) & 1) << 1) |
    (e[3] & 1);
  const out = new Uint8Array(e);
  for (let n = out.length; --n >= 4; ) out[n] ^= t;
  return out.slice(4);
}

function lxEncrypt(plain) {
  return new Uint8Array(getEnc("lx").encrypt(plain));
}

function convertBinToLx(buf) {
  const e = new Uint8Array(buf);
  // 已是 pl 格式，原样返回
  if (e.length > 4 && e[0] === 112 && e[1] === 108) return e;
  // px 格式 → 转 pl
  if (e.length > 4 && e[0] === 112 && e[1] === 120) {
    const plain = xDecrypt(e);
    return lxEncrypt(plain);
  }
  return e;
}

// ============ 测试 ============

const main = async () => {
  console.log("=== BIN 导出数据流验证 ===\n");

  // lz4 库注入（模拟 window.lz4）
  const lz4 = (await import("lz4js")).default;
  globalThis.__lz4 = lz4;

  // 步骤1：模拟扫码导入时存入 IndexedDB 的数据
  // wxqrcode.vue: info 是 combUser 对象、serverId 改为数字后 g_utils.encode（默认x加密 → px）
  const originalData = {
    platform: "hortor",
    platformExt: "mix",
    info: {
      uid: 180051582,
      token: "abc123xyz_token_string",
      nickname: "测试角色",
      openid: "oX1234567890abcdef",
    },
    serverId: 5648, // 5621服
    scene: 0,
    referrerInfo: "",
    deviceUniqueId: "DID-test-1234",
  };
  const indexeddbBin = g_utils.encode(originalData); // ArrayBuffer, px 格式
  const pxBytes = new Uint8Array(indexeddbBin);
  console.log(
    `[1] IndexedDB 数据格式: ${String.fromCharCode(pxBytes[0])}${String.fromCharCode(pxBytes[1])} (px=x加密, ${pxBytes.length}字节)`,
  );

  // 步骤2：模拟导出（修复后：convertBinToLx 统一转 pl）
  const exportData = convertBinToLx(indexeddbBin);
  const plBytes = exportData instanceof Uint8Array ? exportData : new Uint8Array(exportData);
  console.log(
    `[2] 导出文件格式: ${String.fromCharCode(plBytes[0])}${String.fromCharCode(plBytes[1])} (pl=lx加密 LZ4+XOR, ${plBytes.length}字节)`,
  );

  // 步骤3：模拟上号器导入导出文件后的解析（decryptBin → BON decode）
  const decrypted = decryptBin(new Uint8Array(plBytes));
  const saveInfo = bonDecode(decrypted);
  console.log("[3] 上号器解析结果:", JSON.stringify(saveInfo, null, 2));

  // 步骤4：断言关键字段一致
  const assert = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`    ${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(actual)}${ok ? "" : " != " + JSON.stringify(expected)}`);
    return ok;
  };

  let allOk = true;
  allOk = assert("platform", saveInfo.platform, "hortor") && allOk;
  allOk = assert("platformExt", saveInfo.platformExt, "mix") && allOk;
  allOk = assert("serverId", saveInfo.serverId, 5648) && allOk;
  allOk = assert("scene", saveInfo.scene, 0) && allOk;
  allOk = assert("info.uid", saveInfo.info?.uid, 180051582) && allOk;
  allOk = assert("info.token", saveInfo.info?.token, "abc123xyz_token_string") && allOk;

  // 步骤5：同时验证 g_utils.parse(auto) 也能解析导出文件（本项目"导入BIN"回导场景）
  // 注意：bin文件直接是BON业务对象（无body字段），getData()为undefined时需像bin.vue一样用 _raw fallback
  try {
    const binMsg = g_utils.parse(
      plBytes.buffer.byteLength === plBytes.length
        ? plBytes.buffer
        : plBytes.buffer.slice(plBytes.byteOffset, plBytes.byteOffset + plBytes.length),
    );
    let data = binMsg.getData();
    if (!data && binMsg._raw) {
      data = binMsg._raw;
    }
    const okServerId = Number(data?.serverId) === 5648;
    console.log(
      `    ${okServerId ? "✅" : "❌"} g_utils.parse 回导解析: serverId=${data?.serverId}`,
    );
    allOk = allOk && okServerId;
  } catch (e) {
    console.log(`    ❌ g_utils.parse 回导解析失败: ${e.message}`);
    allOk = false;
  }

  console.log(
    `\n=== ${allOk ? "✅ 全部验证通过：导出的BIN可被上号器正确解析" : "❌ 验证失败"} ===`,
  );
  process.exit(allOk ? 0 : 1);
};

main().catch((e) => {
  console.error("测试执行失败:", e);
  process.exit(1);
});
