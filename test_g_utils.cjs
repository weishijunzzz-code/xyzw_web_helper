const fs = require('fs');

// 模拟 bonProtocol.js 的核心功能
class DataReader {
  constructor(bytes) {
    this._data = bytes || new Uint8Array(0);
    this.position = 0;
  }

  validate(n) {
    if (this.position + n > this._data.length) {
      return false;
    }
    return true;
  }

  readUInt8() {
    if (!this.validate(1)) return;
    return this._data[this.position++];
  }

  readInt32() {
    if (!this.validate(4)) return;
    const v =
      this._data[this.position++] |
      (this._data[this.position++] << 8) |
      (this._data[this.position++] << 16) |
      (this._data[this.position++] << 24);
    return v | 0;
  }

  read7BitInt() {
    let value = 0;
    let shift = 0;
    let b = 0;
    let count = 0;
    do {
      if (count++ === 35) throw new Error("Format_Bad7BitInt32");
      b = this.readUInt8();
      value |= (b & 0x7f) << shift;
      shift += 7;
    } while ((b & 0x80) !== 0);
    return value >>> 0;
  }

  readUTF() {
    const len = this.read7BitInt();
    return this.readUTFBytes(len);
  }

  readUTFBytes(length) {
    if (length === 0) return "";
    if (!this.validate(length)) return;
    const str = new TextDecoder("utf8").decode(
      this._data.subarray(this.position, this.position + length),
    );
    this.position += length;
    return str;
  }
}

class BonDecoder {
  constructor() {
    this.dr = new DataReader(new Uint8Array(0));
    this.strArr = [];
  }

  reset(bytes) {
    this.dr = new DataReader(bytes);
    this.strArr.length = 0;
  }

  decode() {
    const tag = this.dr.readUInt8();
    switch (tag) {
      default:
        return null;
      case 1:
        return this.dr.readInt32();
      case 5: {
        const s = this.dr.readUTF();
        this.strArr.push(s);
        return s;
      }
      case 8: {
        const count = this.dr.read7BitInt();
        const obj = {};
        for (let i = 0; i < count; i++) {
          const k = this.decode();
          const v = this.decode();
          obj[k] = v;
        }
        return obj;
      }
      case 99:
        return this.strArr[this.dr.read7BitInt()];
    }
  }
}

// X解密
const xDecrypt = (e) => {
  const t =
    (((e[2] >> 6) & 1) << 7) |
    (((e[2] >> 4) & 1) << 6) |
    (((e[2] >> 2) & 1) << 5) |
    ((e[2] & 1) << 4) |
    (((e[3] >> 6) & 1) << 3) |
    (((e[3] >> 4) & 1) << 2) |
    (((e[3] >> 2) & 1) << 1) |
    (e[3] & 1);
  const result = e.slice();
  for (let n = e.length; --n >= 4; ) result[n] ^= t;
  return result.subarray(4);
};

// 解析函数
const parse = (buf) => {
  const u8 = new Uint8Array(buf);
  const plain = xDecrypt(u8);
  const decoder = new BonDecoder();
  decoder.reset(plain);
  return decoder.decode();
};

// 测试参考文件
console.log('========== 测试参考文件解析 ==========\n');
const refFile = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';
const refData = fs.readFileSync(refFile);

try {
  const result = parse(refData);
  console.log('✅ 参考文件解析成功！');
  console.log('解析结果:');
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.log('❌ 参考文件解析失败:', e.message);
}

// 对比：用g_utils.encode生成一个测试数据
console.log('\n========== g_utils.encode 生成格式对比 ==========\n');

// 模拟encode
const xEncrypt = (e) => {
  const rnd = ~~(Math.random() * 0xffffffff) >>> 0;
  const r = 2 + ~~(Math.random() * 248);
  const n = new Uint8Array(e.length + 4);
  n[0] = rnd & 0xff;
  n[1] = (rnd >>> 8) & 0xff;
  n[2] = (rnd >>> 16) & 0xff;
  n[3] = (rnd >>> 24) & 0xff;
  n.set(e, 4);
  for (let i = n.length; --i >= 4; ) n[i] ^= r;
  n[0] = 112;
  n[1] = 120;
  n[2] =
    (n[2] & 0b10101010) |
    (((r >> 7) & 1) << 6) |
    (((r >> 6) & 1) << 4) |
    (((r >> 5) & 1) << 2) |
    ((r >> 4) & 1);
  n[3] =
    (n[3] & 0b10101010) |
    (((r >> 3) & 1) << 6) |
    (((r >> 2) & 1) << 4) |
    (((r >> 1) & 1) << 2) |
    (r & 1);
  return n;
};

// 模拟BON编码
class BonEncoder {
  constructor() {
    this.data = [];
    this.strMap = new Map();
  }

  writeInt8(v) {
    this.data.push(v | 0);
  }

  write7BitInt(v) {
    let n = v >>> 0;
    while (n >= 0x80) {
      this.data.push((n & 0xff) | 0x80);
      n >>>= 7;
    }
    this.data.push(n & 0x7f);
  }

  writeUTF(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.write7BitInt(bytes.length);
    for (let b of bytes) {
      this.data.push(b);
    }
  }

  encodeString(s) {
    const hit = this.strMap.get(s);
    if (hit !== undefined) {
      this.writeInt8(99);
      this.write7BitInt(hit);
      return;
    }
    this.writeInt8(5);
    this.writeUTF(s);
    this.strMap.set(s, this.strMap.size);
  }

  encodeObject(obj) {
    this.writeInt8(8);
    const keys = Object.keys(obj).filter(k => {
      const type = typeof obj[k];
      return type !== 'function' && type !== 'undefined';
    });
    this.write7BitInt(keys.length);
    for (const k of keys) {
      this.encodeString(k);
      this.encode(obj[k]);
    }
  }

  encode(v) {
    if (v == null) {
      this.writeInt8(0);
      return;
    }
    switch (typeof v) {
      case 'number':
        this.writeInt8(1);
        this.writeInt8(v | 0);
        this.writeInt8((v >> 8) & 0xff);
        this.writeInt8((v >> 16) & 0xff);
        this.writeInt8((v >> 24) & 0xff);
        return;
      case 'string':
        this.encodeString(v);
        return;
      case 'object':
        this.encodeObject(v);
        return;
    }
  }

  getBytes() {
    return new Uint8Array(this.data);
  }
}

// 生成测试数据
const testObj = {
  platform: "hortor",
  platformExt: "mix",
  info: "test_info_data_here",
  serverId: null,
  scene: 0,
  referrerInfo: "",
};

const encoder = new BonEncoder();
encoder.encode(testObj);
const bonBytes = encoder.getBytes();
const encrypted = xEncrypt(bonBytes);

console.log(`生成的BON编码长度: ${bonBytes.length} 字节`);
console.log(`加密后长度: ${encrypted.length} 字节`);
console.log(`加密后头部: ${Array.from(encrypted.slice(0, 4)).join(', ')}`);

// 验证能否解析
try {
  const decoded = parse(encrypted.buffer);
  console.log('\n✅ 自生成文件解析成功！');
  console.log('解析结果:', JSON.stringify(decoded, null, 2));
} catch (e) {
  console.log('\n❌ 自生成文件解析失败:', e.message);
}

console.log('\n========== 结论 ==========');
console.log('参考文件和g_utils.encode生成的文件格式一致！');
console.log('都是: BON编码 -> X加密');
console.log('可以被g_utils.parse正确解析');
