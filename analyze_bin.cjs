/**
 * Bin文件分析工具
 * 用于对比和分析bin文件结构
 */

const fs = require('fs');
const path = require('path');

/**
 * 读取并解析bin文件
 */
function parseBinFile(filePath) {
  const data = fs.readFileSync(filePath);
  
  console.log(`\n========== 文件: ${path.basename(filePath)} ==========`);
  console.log(`文件大小: ${data.length} 字节`);
  console.log(`原始数据 (Hex):`);
  console.log(data.toString('hex').match(/.{1,64}/g).join('\n'));
  
  // 查找JSON部分的结束位置（BON标记开始处）
  let jsonEndIndex = 0;
  for (let i = 0; i < data.length - 1; i++) {
    // 查找BON标记 0x05 + 字段名长度
    if (data[i] === 0x05 && data[i + 1] === 0x08) {
      // 检查是否是serverId字段
      const fieldNameLen = data[i + 1];
      if (i + 2 + fieldNameLen <= data.length) {
        const fieldName = data.slice(i + 2, i + 2 + fieldNameLen).toString('utf8');
        if (fieldName === "serverId") {
          jsonEndIndex = i;
          break;
        }
      }
    }
  }
  
  if (jsonEndIndex === 0) {
    // 尝试直接解析整个数据为JSON
    try {
      const jsonStr = data.toString('utf8');
      const jsonContent = JSON.parse(jsonStr);
      console.log('\n--- JSON内容 ---');
      console.log(JSON.stringify(jsonContent, null, 2));
      return { jsonContent, bonTail: null };
    } catch (e) {
      console.log('\n无法解析为JSON，可能是纯二进制格式');
      return { raw: data };
    }
  }
  
  // 分离JSON和BON尾部
  const jsonBytes = data.slice(0, jsonEndIndex);
  const bonTail = data.slice(jsonEndIndex);
  
  console.log(`\n--- JSON部分 (${jsonBytes.length} 字节) ---`);
  const jsonStr = jsonBytes.toString('utf8');
  console.log('JSON字符串:', jsonStr);
  
  try {
    const jsonContent = JSON.parse(jsonStr);
    console.log('\n解析后的JSON:');
    console.log(JSON.stringify(jsonContent, null, 2));
    
    // 分析info字段
    if (jsonContent.info) {
      console.log('\n--- Info字段分析 ---');
      console.log(`Info长度: ${jsonContent.info.length} 字符`);
      console.log(`Info前50字符: ${jsonContent.info.substring(0, 50)}...`);
      
      // 尝试解码base64
      try {
        const decoded = Buffer.from(jsonContent.info, 'base64');
        console.log(`Info Base64解码后长度: ${decoded.length} 字节`);
        console.log(`Info Base64解码 (Hex): ${decoded.toString('hex').substring(0, 100)}...`);
        
        // 尝试解析为JSON
        try {
          const infoJson = JSON.parse(decoded.toString('utf8'));
          console.log('Info是JSON格式:', JSON.stringify(infoJson, null, 2));
        } catch (e) {
          console.log('Info不是JSON格式，可能是加密数据');
        }
      } catch (e) {
        console.log('Info无法解码为base64');
      }
    }
  } catch (e) {
    console.log('JSON解析失败:', e.message);
  }
  
  console.log(`\n--- BON尾部 (${bonTail.length} 字节) ---`);
  console.log('BON尾部 (Hex):', bonTail.toString('hex'));
  
  // 解析BON尾部
  parseBonTail(bonTail);
  
  return { jsonBytes, bonTail };
}

/**
 * 解析BON尾部
 */
function parseBonTail(bonTail) {
  let offset = 0;
  
  console.log('\n--- BON字段解析 ---');
  while (offset < bonTail.length) {
    if (bonTail[offset] !== 0x05) {
      console.log(`偏移 ${offset}: 未知标记 0x${bonTail[offset].toString(16)}`);
      offset++;
      continue;
    }
    
    if (offset + 1 >= bonTail.length) break;
    
    const fieldNameLen = bonTail[offset + 1];
    if (offset + 2 + fieldNameLen > bonTail.length) break;
    
    const fieldName = bonTail.slice(offset + 2, offset + 2 + fieldNameLen).toString('utf8');
    offset += 2 + fieldNameLen;
    
    if (offset >= bonTail.length) break;
    
    const typeMarker = bonTail[offset];
    offset++;
    
    let value = null;
    
    switch (typeMarker) {
      case 0x00:
        value = 'NULL';
        break;
      case 0x01:
        // int32
        if (offset + 4 <= bonTail.length) {
          value = bonTail.readInt32LE(offset);
          offset += 4;
        }
        break;
      case 0x05:
        // 字符串
        if (offset < bonTail.length) {
          const strLen = bonTail[offset];
          offset++;
          if (offset + strLen <= bonTail.length) {
            value = bonTail.slice(offset, offset + strLen).toString('utf8');
            offset += strLen;
          }
        }
        break;
      default:
        value = `未知类型 0x${typeMarker.toString(16)}`;
    }
    
    console.log(`  ${fieldName}: ${value}`);
  }
}

/**
 * 对比两个bin文件
 */
function compareBinFiles(file1, file2) {
  console.log('\n\n========================================');
  console.log('           Bin文件对比分析');
  console.log('========================================');
  
  const data1 = fs.readFileSync(file1);
  const data2 = fs.readFileSync(file2);
  
  console.log(`\n文件1: ${path.basename(file1)} (${data1.length} 字节)`);
  console.log(`文件2: ${path.basename(file2)} (${data2.length} 字节)`);
  
  // 解析两个文件
  const parsed1 = parseBinFile(file1);
  const parsed2 = parseBinFile(file2);
  
  // 对比JSON部分
  console.log('\n\n========== JSON内容对比 ==========');
  
  try {
    const json1 = JSON.parse(parsed1.jsonBytes?.toString('utf8') || '{}');
    const json2 = JSON.parse(parsed2.jsonBytes?.toString('utf8') || '{}');
    
    console.log('\n字段对比:');
    const allKeys = new Set([...Object.keys(json1), ...Object.keys(json2)]);
    
    for (const key of allKeys) {
      const val1 = json1[key];
      const val2 = json2[key];
      
      if (val1 === undefined) {
        console.log(`  [缺失] ${key}: 文件1缺失，文件2=${val2}`);
      } else if (val2 === undefined) {
        console.log(`  [缺失] ${key}: 文件1=${val1}，文件2缺失`);
      } else if (val1 !== val2) {
        console.log(`  [不同] ${key}:`);
        console.log(`    文件1: ${val1}`);
        console.log(`    文件2: ${val2}`);
      } else {
        console.log(`  [相同] ${key}: ${val1}`);
      }
    }
  } catch (e) {
    console.log('JSON对比失败:', e.message);
  }
  
  // 对比BON尾部
  console.log('\n\n========== BON尾部对比 ==========');
  
  if (parsed1.bonTail && parsed2.bonTail) {
    if (parsed1.bonTail.equals(parsed2.bonTail)) {
      console.log('BON尾部完全相同');
    } else {
      console.log('BON尾部不同');
      console.log('文件1 BON尾部长度:', parsed1.bonTail.length);
      console.log('文件2 BON尾部长度:', parsed2.bonTail.length);
      
      // 逐字节对比
      const maxLen = Math.max(parsed1.bonTail.length, parsed2.bonTail.length);
      for (let i = 0; i < maxLen; i++) {
        const byte1 = i < parsed1.bonTail.length ? parsed1.bonTail[i] : 'N/A';
        const byte2 = i < parsed2.bonTail.length ? parsed2.bonTail[i] : 'N/A';
        
        if (byte1 !== byte2) {
          const hex1 = byte1 !== 'N/A' ? `0x${byte1.toString(16).padStart(2, '0')}` : 'N/A';
          const hex2 = byte2 !== 'N/A' ? `0x${byte2.toString(16).padStart(2, '0')}` : 'N/A';
          console.log(`  偏移 ${i}: 文件1=${hex1}, 文件2=${hex2}`);
        }
      }
    }
  }
  
  // 总结
  console.log('\n\n========== 总结 ==========');
  if (data1.equals(data2)) {
    console.log('✅ 两个文件完全相同');
  } else {
    console.log('❌ 两个文件不同');
    console.log(`   文件1大小: ${data1.length} 字节`);
    console.log(`   文件2大小: ${data2.length} 字节`);
    
    // 计算相似度
    let sameBytes = 0;
    const minLen = Math.min(data1.length, data2.length);
    for (let i = 0; i < minLen; i++) {
      if (data1[i] === data2[i]) sameBytes++;
    }
    console.log(`   相似度: ${(sameBytes / Math.max(data1.length, data2.length) * 100).toFixed(2)}%`);
  }
}

// 主程序
const file1 = process.argv[2] || 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\bin-5627-0-67627581-坤 (3).bin';
const file2 = process.argv[3] || 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';

if (!fs.existsSync(file1)) {
  console.error(`文件不存在: ${file1}`);
  process.exit(1);
}

if (!fs.existsSync(file2)) {
  console.error(`文件不存在: ${file2}`);
  process.exit(1);
}

compareBinFiles(file1, file2);
