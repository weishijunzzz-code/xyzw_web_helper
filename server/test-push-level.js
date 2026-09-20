/**
 * 后端协议推关 - 最小测试脚本（只推1关，不循环）
 * 用法: node test-push-level.js <tokenId>
 * 会自动按ID查到真实userId，不用手动填。
 */
import { db } from './lib/db.js';
import { PushService } from './lib/pushService.js';
import { GameManager } from './lib/gameManager.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tokenId = process.argv[2];
if (!tokenId) {
  console.error('用法: node test-push-level.js <tokenId>');
  process.exit(1);
}

const fakeWss = { on() {} };

async function main() {
  console.log('=== 后端协议推关测试（只推1关）tokenId:', tokenId, '===\n');

  // 直接读数据库，按ID查到真实userId
  const sqlite = new Database(path.join(__dirname, 'data', 'xyzw.db'), { readonly: true });
  const row = sqlite.prepare('SELECT id,name,user_id FROM tokens WHERE id = ?').get(tokenId);
  sqlite.close();
  if (!row) {
    console.error('❌ 数据库里找不到这个ID');
    process.exit(1);
  }
  const realUserId = row.user_id || '';
  console.log('找到账号:', row.name, '| userId:', realUserId, '\n');

  const push = new PushService(fakeWss);
  const gm = new GameManager(db, push);

  console.log('[1] 初始化...');
  await gm.init();

  console.log('[2] 连接账号...');
  await gm.connect(tokenId, realUserId);
  await sleep(3000);
  const status = gm.getConnectionStatus(tokenId);
  console.log('    连接状态:', status);
  if (status !== 'connected') { console.error('❌ 连接失败'); process.exit(1); }

  console.log('\n[3] 发送 fight_calcleveltime {} ...');
  let battleTime;
  try {
    const calcResp = await gm.sendMessageWithPromise(tokenId, 'fight_calcleveltime', {}, 8000);
    console.log('    原始响应:', JSON.stringify(calcResp));
    battleTime = pick(calcResp, 'battleTime');
    console.log('    => battleTime =', battleTime);
  } catch (e) { console.error('❌ calcleveltime 失败:', e.message); process.exit(1); }

  if (battleTime == null) { console.error('❌ 没拿到 battleTime，看上面响应字段名'); process.exit(1); }
  let waitSec = battleTime < 0 ? 5 : battleTime;
  if (waitSec > 120) waitSec = 120;

  console.log(`\n[4] 等待 ${waitSec} 秒...`);
  await sleep(waitSec * 1000);

  console.log('\n[5] 发送 fight_level {} ...');
  try {
    const levelResp = await gm.sendMessageWithPromise(tokenId, 'fight_level', {}, 8000);
    console.log('    原始响应:', JSON.stringify(levelResp));
    const success = pick(levelResp, 'success');
    const nextTime = pick(levelResp, 'nextTime');
    const currLevel = pick(levelResp, 'currLevel');
    console.log('    => success=', success, '| nextTime=', nextTime, '| currLevel=', currLevel);
    console.log('\n=== 结果 ===');
    if (success === true || success === 1) console.log('✅✅✅ 推关成功！纯协议后端推关可行！当前关:', currLevel);
    else console.log('⚠️ level返回了但success不为真，把上面原始响应发回分析');
  } catch (e) { console.error('❌ level 失败:', e.message); }

  gm.disconnect(tokenId);
  await sleep(500);
  process.exit(0);
}

function pick(resp, name) {
  if (!resp || typeof resp !== 'object') return undefined;
  if (resp[name] !== undefined) return resp[name];
  for (const k of ['body', '_rawData', 'rawData', 'decodedBody', 'data']) {
    if (resp[k] && resp[k][name] !== undefined) return resp[k][name];
  }
  if (typeof resp.getData === 'function') { try { const d = resp.getData(); if (d && d[name] !== undefined) return d[name]; } catch {} }
  return undefined;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
main().catch(e=>{console.error('异常:',e);process.exit(1);});
