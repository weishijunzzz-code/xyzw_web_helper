import { db } from './lib/db.js';
import { PushService } from './lib/pushService.js';
import { GameManager } from './lib/gameManager.js';

const tokenId = process.argv[2];
const actId = Number(process.argv[3] || 2606261);
if (!tokenId) { console.error('用法: node test-towers.js <tokenId> [actId]'); process.exit(1); }

const gm = new GameManager(db, new PushService({ on() {} }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await gm.init();
  await gm.connect(tokenId, '');
  await sleep(4000);
  console.log('连接状态:', gm.getConnectionStatus(tokenId));

  console.log('\n[测试1] towers_getinfo 带 actId =', actId);
  try {
    const r = await gm.sendMessageWithPromise(tokenId, 'towers_getinfo', { actId }, 8000);
    console.log('成功，响应keys:', Object.keys(r || {}));
    console.log('actId in resp:', r?.actId ?? r?.towerData?.actId);
  } catch (e) { console.log('失败:', e.message); }

  await sleep(1000);
  console.log('连接状态:', gm.getConnectionStatus(tokenId));

  console.log('\n[测试2] towers_getinfo 空参 {}');
  try {
    const r2 = await gm.sendMessageWithPromise(tokenId, 'towers_getinfo', {}, 8000);
    console.log('成功，响应keys:', Object.keys(r2 || {}));
  } catch (e) { console.log('失败:', e.message); }

  await sleep(500);
  console.log('最终连接状态:', gm.getConnectionStatus(tokenId));
  gm.disconnect(tokenId);
  process.exit(0);
}
main().catch(e => { console.error('异常:', e); process.exit(1); });