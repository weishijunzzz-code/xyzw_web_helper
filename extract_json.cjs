const fs = require('fs');

const refFile = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';
const refData = fs.readFileSync(refFile);

// JSON在偏移1084结束，查找开始位置
// 从后往前找 { 字符
let jsonStart = -1;
for (let i = 1084; i > 0; i--) {
  if (refData[i] === 0x7b) { // {
    // 验证这是否是JSON开始
    const chunk = refData.slice(i, i + 20).toString('utf8');
    if (chunk.startsWith('{"') || chunk.startsWith('{')) {
      jsonStart = i;
      break;
    }
  }
}

console.log('JSON开始位置:', jsonStart);
console.log('JSON结束位置:', 1084);
console.log('JSON长度:', 1084 - jsonStart + 1, '字节');

if (jsonStart !== -1) {
  const jsonBytes = refData.slice(jsonStart, 1085);
  console.log('\nJSON内容:');
  console.log(jsonBytes.toString('utf8'));
  
  // 解析JSON
  try {
    const jsonObj = JSON.parse(jsonBytes.toString('utf8'));
    console.log('\n解析后的JSON:');
    console.log(JSON.stringify(jsonObj, null, 2));
    
    // 分析info字段
    if (jsonObj.info) {
      console.log('\nInfo字段分析:');
      console.log('- 长度:', jsonObj.info.length);
      console.log('- 前100字符:', jsonObj.info.substring(0, 100));
      
      // 检查是否是Base64
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(jsonObj.info);
      console.log('- 是否是Base64:', isBase64);
      
      if (isBase64) {
        try {
          const decoded = Buffer.from(jsonObj.info, 'base64');
          console.log('- Base64解码后长度:', decoded.length);
          console.log('- 解码后前50字节 (Hex):', decoded.slice(0, 50).toString('hex'));
          
          // 尝试解析为JSON
          try {
            const innerJson = JSON.parse(decoded.toString('utf8'));
            console.log('- 解码后是JSON:', JSON.stringify(innerJson, null, 2));
          } catch (e) {
            console.log('- 解码后不是JSON，可能是加密数据');
          }
        } catch (e) {
          console.log('- Base64解码失败:', e.message);
        }
      }
    }
  } catch (e) {
    console.log('JSON解析失败:', e.message);
  }
}

// 分析JSON前的数据
console.log('\n========== JSON前的数据 ==========');
if (jsonStart > 0) {
  const preData = refData.slice(0, jsonStart);
  console.log('长度:', preData.length, '字节');
  console.log('Hex (前100字节):', preData.slice(0, 100).toString('hex'));
  
  // 尝试解压（可能是gzip或lz4）
  console.log('\n可能是压缩或加密数据');
}
