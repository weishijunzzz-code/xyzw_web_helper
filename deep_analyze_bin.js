/**
 * 深度分析bin文件结构
 * 对比参考文件和生成文件的每个字节
 */

const fs = require('fs');

// 读取参考文件
const refFile = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';
const refData = fs.readFileSync(refFile);

console.log('========== 参考文件深度分析 ==========');
console.log(`文件大小: ${refData.length} 字节`);

// 查找JSON结束位置（寻找 {"info": 的开始）
let jsonStart = -1;
for (let i = 0; i < refData.length - 10; i++) {
  if (refData[i] === 0x7b && refData[i+1] === 0x22 && refData[i+2] === 0x69) { // {"i
    jsonStart = i;
    break;
  }
}

if (jsonStart === -1) {
  console.log('未找到JSON开始标记');
} else {
  console.log(`\nJSON开始位置: 偏移 ${jsonStart}`);
  console.log(`JSON前数据 (Hex): ${refData.slice(0, jsonStart).toString('hex')}`);
  console.log(`JSON前数据长度: ${jsonStart} 字节`);
  
  // 尝试解析JSON前数据
  try {
    const preData = refData.slice(0, jsonStart);
    console.log(`\nJSON前数据可能是:`);
    console.log(`- 加密数据`);
    console.log(`- 压缩数据`);
    console.log(`- 二进制协议头`);
  } catch (e) {}
}

// 查找JSON部分
let jsonEnd = -1;
for (let i = jsonStart !== -1 ? jsonStart : 0; i < refData.length - 1; i++) {
  if (refData[i] === 0x7d && refData[i+1] < 0x20) { // } 后跟控制字符
    jsonEnd = i + 1;
    break;
  }
}

if (jsonEnd !== -1) {
  console.log(`\nJSON结束位置: 偏移 ${jsonEnd}`);
  const jsonBytes = refData.slice(jsonStart, jsonEnd);
  console.log(`JSON部分长度: ${jsonBytes.length} 字节`);
  console.log(`JSON内容: ${jsonBytes.toString('utf8')}`);
  
  // 解析JSON
  try {
    const jsonObj = JSON.parse(jsonBytes.toString('utf8'));
    console.log(`\n解析后的JSON:`);
    console.log(JSON.stringify(jsonObj, null, 2));
    
    if (jsonObj.info) {
      console.log(`\nInfo字段分析:`);
      console.log(`- 长度: ${jsonObj.info.length}`);
      console.log(`- 前50字符: ${jsonObj.info.substring(0, 50)}`);
      
      // 尝试base64解码
      try {
        const decoded = Buffer.from(jsonObj.info, 'base64');
        console.log(`- Base64解码后长度: ${decoded.length}`);
        console.log(`- 解码后前20字节 (Hex): ${decoded.slice(0, 20).toString('hex')}`);
      } catch (e) {
        console.log(`- 无法Base64解码`);
      }
    }
  } catch (e) {
    console.log(`JSON解析失败: ${e.message}`);
  }
  
  // 分析BON尾部
  console.log(`\n========== BON尾部分析 ==========`);
  const bonTail = refData.slice(jsonEnd);
  console.log(`BON尾部长度: ${bonTail.length} 字节`);
  console.log(`BON尾部 (Hex): ${bonTail.toString('hex')}`);
  
  // 解析BON字段
  let offset = 0;
  while (offset < bonTail.length) {
    console.log(`\n偏移 ${offset}: 0x${bonTail[offset].toString(16).padStart(2, '0')}`);
    
    if (bonTail[offset] !== 0x05) {
      console.log(`  未知标记，跳过`);
      offset++;
      continue;
    }
    
    if (offset + 1 >= bonTail.length) break;
    
    const fieldNameLen = bonTail[offset + 1];
    console.log(`  字段名长度: ${fieldNameLen}`);
    
    if (offset + 2 + fieldNameLen > bonTail.length) break;
    
    const fieldName = bonTail.slice(offset + 2, offset + 2 + fieldNameLen).toString('utf8');
    console.log(`  字段名: ${fieldName}`);
    
    offset += 2 + fieldNameLen;
    
    if (offset >= bonTail.length) break;
    
    const typeMarker = bonTail[offset];
    console.log(`  类型标记: 0x${typeMarker.toString(16).padStart(2, '0')}`);
    offset++;
    
    switch (typeMarker) {
      case 0x00:
        console.log(`  值: NULL`);
        break;
      case 0x01:
        if (offset + 4 <= bonTail.length) {
          const intVal = bonTail.readInt32LE(offset);
          console.log(`  值 (int32): ${intVal}`);
          offset += 4;
        }
        break;
      case 0x05:
        if (offset < bonTail.length) {
          const strLen = bonTail[offset];
          console.log(`  字符串长度: ${strLen}`);
          offset++;
          if (offset + strLen <= bonTail.length) {
            const strVal = bonTail.slice(offset, offset + strLen).toString('utf8');
            console.log(`  值 (string): ${strVal}`);
            offset += strLen;
          }
        }
        break;
      default:
        console.log(`  未知类型`);
    }
  }
}

// 完整Hex输出
console.log(`\n========== 完整Hex输出 ==========`);
console.log(refData.toString('hex').match(/.{1,64}/g).join('\n'));
