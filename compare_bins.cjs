const fs = require('fs');

const file1 = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\bin-5627-0-67627581-坤 (1).bin';
const file2 = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';

const data1 = fs.readFileSync(file1);
const data2 = fs.readFileSync(file2);

console.log('========== 文件对比分析 ==========\n');
console.log(`文件1 (生成): ${file1.split('\\').pop()} - ${data1.length} 字节`);
console.log(`文件2 (参考): ${file2.split('\\').pop()} - ${data2.length} 字节\n`);

// 查找JSON部分
function findJsonPart(data, label) {
  console.log(`\n----- ${label} -----`);
  
  // 查找JSON结束位置（}后跟BON标记）
  let jsonEnd = -1;
  for (let i = data.length - 1; i > 50; i--) {
    if (data[i] === 0x7d) { // }
      // 检查后面是否是BON标记
      if (i + 1 < data.length && data[i + 1] === 0x05) {
        jsonEnd = i + 1;
        break;
      }
    }
  }
  
  if (jsonEnd === -1) {
    console.log('未找到JSON结束位置');
    return null;
  }
  
  // 从后往前找JSON开始位置
  let jsonStart = -1;
  for (let i = jsonEnd - 1; i > 0; i--) {
    if (data[i] === 0x7b) { // {
      jsonStart = i;
      break;
    }
  }
  
  if (jsonStart === -1) {
    console.log('未找到JSON开始位置');
    return null;
  }
  
  console.log(`JSON位置: ${jsonStart} - ${jsonEnd} (${jsonEnd - jsonStart} 字节)`);
  
  const jsonBytes = data.slice(jsonStart, jsonEnd);
  const jsonStr = jsonBytes.toString('utf8');
  console.log(`JSON内容:\n${jsonStr}\n`);
  
  try {
    const jsonObj = JSON.parse(jsonStr);
    console.log('解析后的JSON:');
    console.log(JSON.stringify(jsonObj, null, 2));
    
    if (jsonObj.info) {
      console.log(`\nInfo字段分析:`);
      console.log(`- 长度: ${jsonObj.info.length}`);
      console.log(`- 前50字符: ${jsonObj.info.substring(0, 50)}`);
      
      // 尝试解码
      try {
        const decoded = Buffer.from(jsonObj.info, 'base64');
        console.log(`- Base64解码后长度: ${decoded.length}`);
        console.log(`- 解码后内容: ${decoded.toString('utf8').substring(0, 200)}`);
      } catch (e) {
        console.log(`- 无法解码: ${e.message}`);
      }
    }
    
    return { start: jsonStart, end: jsonEnd, obj: jsonObj };
  } catch (e) {
    console.log(`JSON解析失败: ${e.message}`);
    return null;
  }
}

const json1 = findJsonPart(data1, '生成的文件');
const json2 = findJsonPart(data2, '参考文件');

// 对比JSON内容
console.log('\n\n========== JSON内容对比 ==========');
if (json1 && json2) {
  console.log('\n字段对比:');
  const keys1 = Object.keys(json1.obj);
  const keys2 = Object.keys(json2.obj);
  const allKeys = new Set([...keys1, ...keys2]);
  
  for (const key of allKeys) {
    const val1 = json1.obj[key];
    const val2 = json2.obj[key];
    
    if (val1 === undefined) {
      console.log(`  [缺失] ${key}: 生成文件缺失`);
    } else if (val2 === undefined) {
      console.log(`  [缺失] ${key}: 参考文件缺失`);
    } else if (val1 !== val2) {
      console.log(`  [不同] ${key}:`);
      console.log(`    生成: ${val1.toString().substring(0, 50)}...`);
      console.log(`    参考: ${val2.toString().substring(0, 50)}...`);
    } else {
      console.log(`  [相同] ${key}`);
    }
  }
  
  // 对比info字段长度
  if (json1.obj.info && json2.obj.info) {
    console.log(`\nInfo字段长度对比:`);
    console.log(`  生成文件: ${json1.obj.info.length} 字符`);
    console.log(`  参考文件: ${json2.obj.info.length} 字符`);
    console.log(`  差异: ${Math.abs(json1.obj.info.length - json2.obj.info.length)} 字符`);
  }
}

// 分析BON尾部
console.log('\n\n========== BON尾部对比 ==========');
function analyzeBonTail(data, jsonEnd, label) {
  console.log(`\n----- ${label} -----`);
  const bonTail = data.slice(jsonEnd);
  console.log(`BON尾部长度: ${bonTail.length} 字节`);
  console.log(`BON尾部Hex: ${bonTail.toString('hex')}`);
  
  // 解析BON字段
  let offset = 0;
  while (offset < bonTail.length) {
    if (bonTail[offset] !== 0x05) {
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
        if (offset + 4 <= bonTail.length) {
          value = bonTail.readInt32LE(offset);
          offset += 4;
        }
        break;
      case 0x05:
        if (offset < bonTail.length) {
          const strLen = bonTail[offset];
          offset++;
          if (offset + strLen <= bonTail.length) {
            value = bonTail.slice(offset, offset + strLen).toString('utf8');
            offset += strLen;
          }
        }
        break;
    }
    
    console.log(`  ${fieldName}: ${value}`);
  }
}

if (json1 && json2) {
  analyzeBonTail(data1, json1.end, '生成的文件');
  analyzeBonTail(data2, json2.end, '参考文件');
}

// 总结
console.log('\n\n========== 总结 ==========');
if (data1.equals(data2)) {
  console.log('✅ 两个文件完全相同');
} else {
  console.log('❌ 两个文件不同');
  
  // 计算相似度
  let sameBytes = 0;
  const minLen = Math.min(data1.length, data2.length);
  for (let i = 0; i < minLen; i++) {
    if (data1[i] === data2[i]) sameBytes++;
  }
  console.log(`相似度: ${(sameBytes / Math.max(data1.length, data2.length) * 100).toFixed(2)}%`);
  
  // 找出第一个不同的字节
  for (let i = 0; i < minLen; i++) {
    if (data1[i] !== data2[i]) {
      console.log(`第一个不同字节位置: ${i}`);
      console.log(`  生成: 0x${data1[i].toString(16).padStart(2, '0')}`);
      console.log(`  参考: 0x${data2[i].toString(16).padStart(2, '0')}`);
      break;
    }
  }
}
