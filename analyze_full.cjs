const fs = require('fs');

const refFile = 'd:\\jiechuangcode\\code04\\xyzw_web_helper\\request_body(1) (27).bin';
const refData = fs.readFileSync(refFile);

console.log('文件大小:', refData.length, '字节');
console.log('\n完整Hex输出:');
console.log(refData.toString('hex').match(/.{1,64}/g).join('\n'));

console.log('\n\n========== 文本内容 ==========');
console.log(refData.toString('utf8'));
