const fs = require('fs');
const crypto = require('crypto');

console.log('========== 测试参考文件格式 ==========\n');

// X加密函数
const xEncrypt = (data) => {
  const rnd = ~~(Math.random() * 0xffffffff) >>> 0;
  const r = 2 + ~~(Math.random() * 248);
  const result = Buffer.alloc(data.length + 4);

  // 随机前缀
  result[0] = rnd & 0xff;
  result[1] = (rnd >>> 8) & 0xff;
  result[2] = (rnd >>> 16) & 0xff;
  result[3] = (rnd >>> 24) & 0xff;

  // 复制数据
  data.copy(result, 4);

  // XOR加密
  for (let i = result.length - 1; i >= 4; i--) {
    result[i] ^= r;
  }

  // 写入标识和混淆位
  result[0] = 112; // 'p'
  result[1] = 120; // 'x'
  result[2] =
    (result[2] & 0b10101010) |
    (((r >> 7) & 1) << 6) |
    (((r >> 6) & 1) << 4) |
    (((r >> 5) & 1) << 2) |
    ((r >> 4) & 1);
  result[3] =
    (result[3] & 0b10101010) |
    (((r >> 3) & 1) << 6) |
    (((r >> 2) & 1) << 4) |
    (((r >> 1) & 1) << 2) |
    (r & 1);

  return result;
};

// X解密函数
const xDecrypt = (data) => {
  const t =
    (((data[2] >> 6) & 1) << 7) |
    (((data[2] >> 4) & 1) << 6) |
    (((data[2] >> 2) & 1) << 5) |
    ((data[2] & 1) << 4) |
    (((data[3] >> 6) & 1) << 3) |
    (((data[3] >> 4) & 1) << 2) |
    (((data[3] >> 2) & 1) << 1) |
    (data[3] & 1);

  const result = Buffer.from(data);

  for (let i = result.length - 1; i >= 4; i--) {
    result[i] ^= t;
  }

  return result.subarray(4);
};

// MD5哈希函数
const md5 = (text) => {
  return crypto.createHash('md5').update(text).digest('hex');
};

// 构建BON前缀
const buildBonPrefix = (platform, platformExt, info) => {
  const writer = [];

  // BON对象开始标记 (0x08 + 字段数量)
  writer.push(0x08, 0x03); // 3个字段

  // platform
  const platformBytes = Buffer.from('platform');
  writer.push(0x05, platformBytes.length);
  writer.push(...platformBytes);
  const platformValueBytes = Buffer.from(platform);
  writer.push(0x05, platformValueBytes.length);
  writer.push(...platformValueBytes);

  // platformExt
  const platformExtBytes = Buffer.from('platformExt');
  writer.push(0x05, platformExtBytes.length);
  writer.push(...platformExtBytes);
  const platformExtValueBytes = Buffer.from(platformExt);
  writer.push(0x05, platformExtValueBytes.length);
  writer.push(...platformExtValueBytes);

  // info
  const infoNameBytes = Buffer.from('info');
  writer.push(0x05, infoNameBytes.length);
  writer.push(...infoNameBytes);
  const infoValueBytes = Buffer.from(info);
  writer.push(0x05, infoValueBytes.length);
  writer.push(...infoValueBytes);

  return Buffer.from(writer);
};

// 构建BON尾部
const buildBonTail = (serverId, scene, referrerInfo, deviceUniqueId) => {
  const writer = [];

  // serverId (NULL)
  const serverIdBytes = Buffer.from('serverId');
  writer.push(0x05, serverIdBytes.length);
  writer.push(...serverIdBytes);
  writer.push(0x00); // NULL

  // scene (int32)
  const sceneBytes = Buffer.from('scene');
  writer.push(0x05, sceneBytes.length);
  writer.push(...sceneBytes);
  writer.push(0x01, scene & 0xff, (scene >> 8) & 0xff, (scene >> 16) & 0xff, (scene >> 24) & 0xff);

  // referrerInfo (string)
  const referrerBytes = Buffer.from('referrerInfo');
  writer.push(0x05, referrerBytes.length);
  writer.push(...referrerBytes);
  const referrerValueBytes = Buffer.from(referrerInfo);
  writer.push(0x05, referrerValueBytes.length);
  writer.push(...referrerValueBytes);

  // deviceUniqueId (string)
  const deviceIdBytes = Buffer.from('deviceUniqueId');
  writer.push(0x05, deviceIdBytes.length);
  writer.push(...deviceIdBytes);
  const deviceIdValueBytes = Buffer.from(deviceUniqueId);
  writer.push(0x05, deviceIdValueBytes.length);
  writer.push(...deviceIdValueBytes);

  return Buffer.from(writer);
};

// 生成参考文件格式的bin文件
const generateRefBin = (userData) => {
  // 步骤1: 加密用户数据生成info字段
  const userDataJson = JSON.stringify(userData);
  const userDataBytes = Buffer.from(userDataJson);

  // 使用X加密用户数据
  const encryptedInfo = xEncrypt(userDataBytes);

  // 转为Base64
  const infoBase64 = encryptedInfo.toString('base64');

  // 步骤2: 生成sign和timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  const signText = `${infoBase64}${timestamp}`;
  const sign = md5(signText);

  // 步骤3: 构建JSON部分
  const jsonObj = {
    info: infoBase64,
    sign: sign,
    timestamp: timestamp,
  };
  const jsonStr = JSON.stringify(jsonObj);
  const jsonBytes = Buffer.from(jsonStr);

  // 步骤4: 生成设备ID
  const deviceUniqueId = `DID-${crypto.randomUUID()}`;

  // 步骤5: 构建BON前缀
  const bonPrefix = buildBonPrefix('hortor', 'mix', infoBase64);

  // 步骤6: 构建BON尾部
  const bonTail = buildBonTail(null, 0, '', deviceUniqueId);

  // 步骤7: 组合所有部分
  const combined = Buffer.concat([bonPrefix, jsonBytes, bonTail]);

  // 步骤8: 整体X加密
  const encrypted = xEncrypt(combined);

  return encrypted;
};

// 解析参考文件格式的bin文件
const parseRefBin = (binData) => {
  // 步骤1: X解密
  const decrypted = xDecrypt(binData);

  // 步骤2: 查找JSON开始位置
  let jsonStart = -1;
  for (let i = 0; i < decrypted.length - 10; i++) {
    if (decrypted[i] === 0x7b && decrypted[i + 1] === 0x22) { // {""
      jsonStart = i;
      break;
    }
  }

  if (jsonStart === -1) {
    throw new Error('无法找到JSON开始位置');
  }

  // 步骤3: 查找JSON结束位置
  // 方法：查找 "timestamp":1234567890} 后面的 BON标记 0x05
  let jsonEnd = -1;

  // 先尝试找 "timestamp" 字段
  const timestampPattern = Buffer.from('"timestamp":');
  let timestampIdx = -1;
  for (let i = jsonStart; i < decrypted.length - timestampPattern.length; i++) {
    let match = true;
    for (let j = 0; j < timestampPattern.length; j++) {
      if (decrypted[i + j] !== timestampPattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      timestampIdx = i;
      break;
    }
  }

  if (timestampIdx !== -1) {
    // 从timestamp后面找数字和 }
    let i = timestampIdx + timestampPattern.length;
    // 跳过数字
    while (i < decrypted.length && decrypted[i] >= 0x30 && decrypted[i] <= 0x39) {
      i++;
    }
    // 检查是否是 }
    if (i < decrypted.length && decrypted[i] === 0x7d) {
      jsonEnd = i + 1;
    }
  }

  // 如果上面的方法失败，使用花括号匹配
  if (jsonEnd === -1) {
    let depth = 0;
    for (let i = jsonStart; i < decrypted.length; i++) {
      if (decrypted[i] === 0x7b) depth++;
      else if (decrypted[i] === 0x7d) {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
  }

  if (jsonEnd === -1) {
    throw new Error('无法找到JSON结束位置');
  }

  // 步骤4: 提取并解析JSON
  const jsonBytes = decrypted.slice(jsonStart, jsonEnd);
  const jsonStr = jsonBytes.toString('utf8');
  const jsonObj = JSON.parse(jsonStr);

  // 步骤5: 解析BON前缀 (提取platform, platformExt, info)
  const platform = 'hortor';
  const platformExt = 'mix';
  const info = jsonObj.info;

  // 步骤6: 解析BON尾部
  const tailBytes = decrypted.slice(jsonEnd);
  let serverId = null;
  let scene = 0;
  let referrerInfo = '';
  let deviceUniqueId = '';

  // 简单解析BON尾部
  const decoder = new TextDecoder();
  for (let i = 0; i < tailBytes.length - 2; ) {
    if (tailBytes[i] === 0x05) {
      const nameLen = tailBytes[i + 1];
      if (i + 2 + nameLen > tailBytes.length) break;

      const fieldName = decoder.decode(tailBytes.slice(i + 2, i + 2 + nameLen));
      i += 2 + nameLen;

      if (i >= tailBytes.length) break;

      const typeMarker = tailBytes[i];
      i++;

      switch (fieldName) {
        case 'serverId':
          if (typeMarker === 0x00) serverId = null;
          break;
        case 'scene':
          if (typeMarker === 0x01 && i + 4 <= tailBytes.length) {
            scene = tailBytes[i] | (tailBytes[i + 1] << 8) | (tailBytes[i + 2] << 16) | (tailBytes[i + 3] << 24);
            i += 4;
          }
          break;
        case 'referrerInfo':
          if (typeMarker === 0x05 && i < tailBytes.length) {
            const strLen = tailBytes[i];
            i++;
            if (i + strLen <= tailBytes.length) {
              referrerInfo = decoder.decode(tailBytes.slice(i, i + strLen));
              i += strLen;
            }
          }
          break;
        case 'deviceUniqueId':
          if (typeMarker === 0x05 && i < tailBytes.length) {
            const strLen = tailBytes[i];
            i++;
            if (i + strLen <= tailBytes.length) {
              deviceUniqueId = decoder.decode(tailBytes.slice(i, i + strLen));
              i += strLen;
            }
          }
          break;
        default:
          // 跳过未知字段
          if (typeMarker === 0x00) {
            // NULL
          } else if (typeMarker === 0x01 && i + 4 <= tailBytes.length) {
            i += 4;
          } else if (typeMarker === 0x05 && i < tailBytes.length) {
            const strLen = tailBytes[i];
            i++;
            i += strLen;
          }
          break;
      }
    } else {
      i++;
    }
  }

  // 步骤7: 解密info字段获取用户数据
  let parsedUserData;
  try {
    const infoBytes = Buffer.from(info, 'base64');
    const decryptedInfo = xDecrypt(infoBytes);
    const userDataJson = decryptedInfo.toString('utf8');
    parsedUserData = JSON.parse(userDataJson);
  } catch (e) {
    console.warn('无法解密info字段:', e.message);
  }

  return {
    platform,
    platformExt,
    info,
    sign: jsonObj.sign,
    timestamp: jsonObj.timestamp,
    serverId,
    scene,
    referrerInfo,
    deviceUniqueId,
    userData: parsedUserData,
  };
};

// 主测试函数
const runTest = () => {
  console.log('1. 生成测试bin文件...\n');

  // 测试用户数据
  const testUserData = {
    uid: 12345,
    name: '测试用户',
    token: 'test_token_12345',
    openid: 'openid_test',
    unionid: 'unionid_test',
    avatar: '',
    sessId: 123456789,
    connId: 987654321,
    isRestore: 0,
  };

  console.log('用户数据:', JSON.stringify(testUserData, null, 2));
  console.log('');

  // 生成bin文件
  const binData = generateRefBin(testUserData);
  console.log(`✅ 生成成功！文件大小: ${binData.length} 字节`);
  console.log(`文件头部: ${binData.slice(0, 4).toString('hex')}`);
  console.log('');

  // 保存到文件
  fs.writeFileSync('test_generated.bin', binData);
  console.log('✅ 已保存到 test_generated.bin');
  console.log('');

  // 解析生成的bin文件
  console.log('2. 解析生成的bin文件...\n');

  try {
    const parsed = parseRefBin(binData);
    console.log('✅ 解析成功！');
    console.log('解析结果:');
    console.log(JSON.stringify(parsed, null, 2));
    console.log('');

    // 验证数据一致性
    console.log('3. 验证数据一致性...\n');

    let allValid = true;

    if (parsed.platform !== 'hortor') {
      console.log('❌ platform 不匹配');
      allValid = false;
    } else {
      console.log('✅ platform 正确');
    }

    if (parsed.platformExt !== 'mix') {
      console.log('❌ platformExt 不匹配');
      allValid = false;
    } else {
      console.log('✅ platformExt 正确');
    }

    if (!parsed.userData) {
      console.log('❌ 无法获取userData');
      allValid = false;
    } else {
      console.log('✅ userData 存在');

      if (parsed.userData.uid !== testUserData.uid) {
        console.log(`❌ uid 不匹配: ${parsed.userData.uid} != ${testUserData.uid}`);
        allValid = false;
      } else {
        console.log('✅ uid 正确');
      }

      if (parsed.userData.name !== testUserData.name) {
        console.log(`❌ name 不匹配: ${parsed.userData.name} != ${testUserData.name}`);
        allValid = false;
      } else {
        console.log('✅ name 正确');
      }

      if (parsed.userData.token !== testUserData.token) {
        console.log(`❌ token 不匹配`);
        allValid = false;
      } else {
        console.log('✅ token 正确');
      }
    }

    if (allValid) {
      console.log('\n✅✅✅ 所有测试通过！格式正确！✅✅✅');
    } else {
      console.log('\n❌❌❌ 部分测试失败 ❌❌❌');
    }

  } catch (e) {
    console.log('❌ 解析失败:', e.message);
    console.error(e);
  }

  // 测试解析参考文件
  console.log('\n4. 测试解析参考文件...\n');

  try {
    const refFile = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';
    const refData = fs.readFileSync(refFile);
    console.log(`参考文件大小: ${refData.length} 字节`);

    const parsedRef = parseRefBin(refData);
    console.log('✅ 参考文件解析成功！');
    console.log('解析结果:');
    console.log(JSON.stringify({
      platform: parsedRef.platform,
      platformExt: parsedRef.platformExt,
      sign: parsedRef.sign ? parsedRef.sign.substring(0, 20) + '...' : null,
      timestamp: parsedRef.timestamp,
      deviceUniqueId: parsedRef.deviceUniqueId,
      userData: parsedRef.userData ? {
        uid: parsedRef.userData.uid,
        name: parsedRef.userData.name,
        token: parsedRef.userData.token ? parsedRef.userData.token.substring(0, 20) + '...' : null,
      } : null,
    }, null, 2));

  } catch (e) {
    console.log('❌ 参考文件解析失败:', e.message);
    console.error(e);
  }
};

runTest();
