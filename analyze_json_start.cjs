const fs = require('fs');

const refFile = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';
const refData = fs.readFileSync(refFile);

console.log('文件大小:', refData.length, '字节');
console.log('\n查找JSON开始位置...\n');

// 查找 {"info" 模式
for (let i = 0; i < refData.length - 20; i++) {
  // 查找 { 字符
  if (refData[i] === 0x7b) {
    const chunk = refData.slice(i, i + 20).toString('utf8');
    if (chunk.includes('"info"') || chunk.includes('info')) {
      console.log(`偏移 ${i}: ${chunk}`);
      console.log(`  Hex: ${refData.slice(i, i + 50).toString('hex')}`);
      console.log('');
    }
  }
}

// 从后往前查找JSON
console.log('\n从后往前查找...\n');
for (let i = refData.length - 1; i > 100; i--) {
  if (refData[i] === 0x7d) { // }
    const chunk = refData.slice(Math.max(0, i - 100), i + 1).toString('utf8');
    if (chunk.includes('timestamp') || chunk.includes('sign')) {
      console.log(`JSON可能在偏移 ${i} 结束`);
      console.log(`内容: ${chunk.slice(-100)}`);
      console.log('');
      break;
    }
  }
}

// 查找BON标记 0x05 0x08 (serverId)
console.log('\n查找BON标记...\n');
for (let i = 0; i < refData.length - 10; i++) {
  if (refData[i] === 0x05 && refData[i+1] === 0x08) {
    const fieldName = refData.slice(i + 2, i + 10).toString('utf8');
    console.log(`偏移 ${i}: 可能是serverId字段`);
    console.log(`  字段名: ${fieldName}`);
    console.log(`  前后文Hex: ${refData.slice(Math.max(0, i - 20), i + 30).toString('hex')}`);
    console.log('');
    
    // 尝试解析JSON部分
    if (i > 50) {
      const jsonChunk = refData.slice(Math.max(0, i - 200), i).toString('utf8');
      console.log(`  JSON候选内容: ${jsonChunk.slice(-150)}`);
      console.log('');
    }
    break;
  }
}
