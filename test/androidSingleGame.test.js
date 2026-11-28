import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { isAndroidGameMessage } from '../src/utils/androidGameBridge.js';
import { formatIOSGameDiagnostic, GAME_STARTUP_TIMING_KEY, recordGameStartupTiming } from '../src/utils/gameStartupTimings.js';

const bootstrap = readFileSync(new URL('../public/game/android-single.js', import.meta.url), 'utf8');
const scriptsRuntime = readFileSync(new URL('../public/game/android-game-scripts.js', import.meta.url), 'utf8');
const appOrigin = 'https://localhost';
const origin = 'https://appassets.androidplatform.net';
const session = '00000000-0000-4000-8000-000000000001';
const envelope = { channel: 'xyzw-android-game', version: 1, session };

function storage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

function fixture({ unsafe = false, ios = false, interactive = true } = {}) {
  const sent = [];
  const listeners = new Map();
  const nodes = [];
  const persistent = storage();
  class Xhr extends EventTarget { open() {} send() {} abort() {} }
  class BrowserSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
  }
  const root = {
    location: new URL(`/xyzw-game/android-single.html?session=${session}`, origin),
    parent: { postMessage(data, destination) { sent.push({ data, destination }); } },
    ...(unsafe ? { CapacitorCookiesAndroidInterface: {} } : {}),
    document: {
      getElementById() { return { style: {} }; },
      createElement: tag => ({ tag }),
      head: { appendChild(node) { nodes.push(node); queueMicrotask(() => node.onload?.()); } },
    },
    localStorage: persistent,
    XMLHttpRequest: Xhr,
    WebSocket: BrowserSocket,
    fetch: async () => new Response('from-browser'),
    addEventListener(type, listener) { listeners.set(type, listener); },
    boot: async ({ autoFullscreen, onReady }) => {
      root.autoFullscreen = autoFullscreen;
      onReady();
    },
    cc: {
      director: { getScene: () => ({ getChildByName: () => ({ _components: [{ _stateMachine: { _current: { stateId: interactive ? 'GameRunning' : 'Login' } } }] }) }) },
      js: { getClassName: () => 'Game' },
    },
  };
  if (ios) {
    root.location = new URL(`xyzw-game://runtime/android-single.html?session=${session}`);
    root.parent = root;
    root.webkit = { messageHandlers: {
      gameRuntime: { postMessage(data) { sent.push({ data }); } },
      ...(unsafe ? { bridge: {} } : {}),
    } };
  }
  const context = vm.createContext({ window: root, URL, URLSearchParams, Request, Response, DOMException, performance,
    setTimeout() {}, setInterval() {}, clearTimeout() {}, clearInterval() {},
    atob, btoa, Promise, Uint8Array, ArrayBuffer, AbortController, Blob, Event, EventTarget, MessageEvent, CloseEvent, TextDecoder,
    ProgressEvent: Event });
  vm.runInContext(scriptsRuntime, context);
  vm.runInContext(bootstrap, context);
  function message(data, sender = root.parent, senderOrigin = appOrigin) {
    listeners.get('message')?.({ data, source: sender, origin: senderOrigin });
  }
  return { sent, nodes, persistent, root, message };
}

const drain = () => new Promise(resolve => setImmediate(resolve));

test('isolated game accepts only the current parent and holds the selected BIN in memory', async () => {
  const { message, sent, nodes, root, persistent } = fixture();
  const initialize = { ...envelope, type: 'initialize', binId: 'test-account', binHex: '706c0102', scripts: [
    { id: 'ok', name: 'Valid', code: 'GM_setValue("count", GM_getValue("count", 0) + 1); unsafeWindow.testCount = GM_getValue("count");' },
    { id: 'broken', name: 'Invalid', code: 'const =' },
    { id: 'external', name: 'External', code: '// ==UserScript==\n// @require https://example.org/script.js\n// ==/UserScript==\nunsafeWindow.extra = true;' },
  ] };
  message(initialize, root.parent, 'https://elsewhere.test');
  message(initialize, {});
  message({ ...initialize, session: 'wrong' });
  assert.equal(nodes.length, 0);
  assert.equal(sent[0].destination, appOrigin);

  message(initialize);
  message(initialize);
  await drain();
  assert.equal(root.localStorage.getItem('bin_data_test-account'), '706c0102');
  assert.equal(persistent.getItem('bin_data_test-account'), null);
  assert.equal(root.testCount, 1);
  assert.equal(root.extra, undefined);
  assert.equal(root.autoFullscreen, false);
  assert.equal(nodes.some(node => node.src === 'xh.js'), false);
  assert.deepEqual(sent.filter(item => item.data.type === 'script-result').map(({ data }) => [data.id, data.status]), [
    ['ok', 'loaded'], ['broken', 'failed'], ['external', 'unsupported'],
  ]);
  assert.equal(sent.filter(item => item.data.type === 'ready').length, 1);
});

test('a leaked native interface prevents even the initial credential handshake', () => {
  const { sent } = fixture({ unsafe: true });
  assert.deepEqual(sent.map(item => [item.data.type, item.data.code]), [['failed', 'unsafe-game-origin']]);
});

test('only the fixed JSON startup endpoints use the native HTTP channel', async () => {
  const { root, message, sent } = fixture();
  message({ ...envelope, type: 'initialize', binId: 'fixture', binHex: '00', scripts: [] });
  await drain();
  assert.equal(await (await root.fetch('https://example.org/', { method: 'POST' })).text(), 'from-browser');
  assert.equal(await (await root.fetch('https://xxz-xyzw.hortorgames.com/login/authuser', { method: 'POST' })).text(), 'from-browser');

  const response = root.fetch('https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=0.36.0-android', { method: 'POST', body: '' });
  await drain();
  const request = sent.find(item => item.data.type === 'http-request');
  assert.equal(request.data.endpoint, 'manifest');
  const reply = { ...envelope, type: 'http-response', requestId: request.data.requestId,
    response: { status: 200, contentType: 'application/json', dataBase64: 'eyJvayI6dHJ1ZX0=' } };
  message(reply, {});
  message(reply);
  assert.deepEqual(await (await response).json(), { ok: true });
});

test('parent verifies game origin, instance and nonce before accepting any data', () => {
  const source = {};
  const valid = { origin, source, data: { ...envelope, type: 'hello' } };
  assert.equal(isAndroidGameMessage(valid, source, session), true);
  assert.equal(isAndroidGameMessage(valid, {}, session), false);
  assert.equal(isAndroidGameMessage(valid, source, 'other'), false);
  assert.equal(isAndroidGameMessage({ ...valid, origin: 'https://localhost' }, source, session), false);
});

test('persistent timings retain only bounded numeric stages and no account fields', () => {
  const local = storage();
  for (let index = 0; index < 42; index += 1) {
    recordGameStartupTiming({ kind: 'first', status: 'ready', scriptCount: 1,
      timings: { version: index + 0.1, account: 'ignored', resume: -1 } }, local);
  }
  const entries = JSON.parse(local.getItem(GAME_STARTUP_TIMING_KEY));
  assert.equal(entries.length, 40);
  assert.deepEqual(entries[0], { kind: 'first', status: 'ready', scriptCount: 1, timings: { version: 2 } });
});

test('iOS game has its own bootstrap channel and stages only its selected account', async () => {
  const { root, sent, message, nodes, persistent } = fixture({ ios: true });
  const receive = root.__xyzwReceiveGameRuntime;
  const initialize = { ...envelope, type: 'initialize', binId: 'ios-test', binHex: '01020304', scripts: [
    { id: 'ios-script', name: 'iOS fixture', code: 'GM_setValue("available", true); unsafeWindow.gameScriptLoaded = GM_getValue("available");' },
  ] };
  message(initialize);
  receive({ ...initialize, session: 'expired' });
  assert.equal(nodes.length, 0);
  receive(initialize);
  receive(initialize);
  await drain();
  assert.equal(root.localStorage.getItem('bin_data_ios-test'), '01020304');
  assert.equal(persistent.getItem('bin_data_ios-test'), null);
  assert.equal(root.gameScriptLoaded, true);
  assert.equal(root.webkit.messageHandlers.bridge, undefined);
  assert.equal(sent.filter(item => item.data.type === 'ready').length, 1);
  const leaked = fixture({ ios: true, unsafe: true });
  assert.equal(leaked.sent[0].data.code, 'unsafe-game-origin');
});

test('iOS binary login preserves body and response bytes over the fixed game channel', async () => {
  const { root, sent } = fixture({ ios: true });
  const receive = root.__xyzwReceiveGameRuntime;
  receive({ ...envelope, type: 'initialize', binId: 'ios-test', binHex: '000102ff' });
  await drain();
  const authURL = 'https://xxz-xyzw.hortorgames.com/login/authuser?_seq=1';
  const original = new Uint8Array([0, 1, 2, 255]);
  const xhr = new root.XMLHttpRequest();
  xhr.open('POST', authURL);
  xhr.responseType = 'arraybuffer';
  const loaded = new Promise(resolve => xhr.addEventListener('loadend', resolve, { once: true }));
  xhr.send(original);
  await drain();
  const request = sent.find(item => item.data.type === 'http-request').data;
  assert.equal(request.endpoint, 'authuser');
  assert.equal(request.seq, '1');
  assert.equal(request.bodyBase64, 'AAEC/w==');
  receive({ ...envelope, type: 'http-response', requestId: request.requestId,
    response: { status: 200, dataBase64: 'AwL/AQ==', contentType: 'application/octet-stream' } });
  await loaded;
  assert.equal(xhr.status, 200);
  assert.deepEqual([...new Uint8Array(xhr.response)], [3, 2, 255, 1]);
  await assert.rejects(root.fetch(`${authURL}&rogue=1`, { method: 'POST', body: 'invalid' }), /invalid-auth-query/);
  assert.equal(sent.filter(item => item.data.type === 'http-request').length, 1);
});

test('iOS game startup reports an authentication HTTP rejection with its status', async () => {
  const { root, sent } = fixture({ ios: true, interactive: false });
  const receive = root.__xyzwReceiveGameRuntime;
  receive({ ...envelope, type: 'initialize', binId: 'ios-test', binHex: '000102ff' });
  await drain();
  const response = root.fetch('https://xxz-xyzw.hortorgames.com/login/authuser?_seq=1', { method: 'POST', body: 'fixture' });
  await drain();
  const request = sent.find(item => item.data.type === 'http-request').data;
  receive({ ...envelope, type: 'http-response', requestId: request.requestId,
    response: { status: 429, dataBase64: '', contentType: 'application/octet-stream' } });
  assert.equal((await response).status, 429);
  assert.deepEqual(sent.filter(item => item.data.type === 'failed').map(({ data }) => [data.code, data.status]), [
    ['game-auth-rejected', 429],
  ]);
});

test('iOS role authentication forwards the game SDK language and hint query fields', async () => {
  const { root, sent } = fixture({ ios: true, interactive: false });
  const receive = root.__xyzwReceiveGameRuntime;
  receive({ ...envelope, type: 'initialize', binId: 'ios-test', binHex: '000102ff' });
  await drain();
  const url = 'https://xxz-xyzw.hortorgames.com/login/authuser?_seq=7&_hint=sdk%2Bmobile&_lang=zh-CN';
  const response = root.fetch(url, { method: 'POST', body: 'fixture' });
  await drain();
  const request = sent.find(item => item.data.type === 'http-request').data;
  assert.deepEqual([request.seq, request.language, request.hint], ['7', 'zh-CN', 'sdk+mobile']);
  receive({ ...envelope, type: 'http-response', requestId: request.requestId,
    response: { status: 200, dataBase64: 'AQI=', contentType: 'application/octet-stream' } });
  assert.deepEqual([...new Uint8Array(await (await response).arrayBuffer())], [1, 2]);
  await assert.rejects(root.fetch(`${url}&_lang=duplicate`, { method: 'POST', body: 'fixture' }), /invalid-auth-query/);
  assert.equal(sent.find(item => item.data.type === 'failed').data.code, 'game-auth-request');
  assert.equal(sent.filter(item => item.data.type === 'http-request').length, 1);
});

test('iOS reads the running state from the persistent engine entity during scene changes', async () => {
  const { root, sent } = fixture({ ios: true, interactive: false });
  root.cc.director.getScene = () => null;
  root.cc.sys = { entityNode1: {
    getComponent: name => name === 'Game' ? { stateMachine: { current: { stateId: 'GameRunning' } } } : null,
  } };
  root.__xyzwReceiveGameRuntime({ ...envelope, type: 'initialize', binId: 'ios-test', binHex: '000102ff' });
  await drain();
  const launcher = sent.findIndex(({ data }) => data.phase === 'launcher');
  const ready = sent.findIndex(({ data }) => data.type === 'ready');
  assert.ok(launcher >= 0 && launcher < ready);
});

test('iOS game uses a session-scoped native socket for the official game endpoint', async () => {
  const { root, sent } = fixture({ ios: true, interactive: false });
  const receive = root.__xyzwReceiveGameRuntime;
  receive({ ...envelope, type: 'initialize', binId: 'ios-test', binHex: '000102ff' });
  await drain();
  new root.WebSocket('wss://xxz-xyzw.hortorgames.com/agent?p=mock');
  const first = sent.find(item => item.data.type === 'socket-open').data;
  receive({ ...envelope, type: 'socket-event', socketId: first.socketId, event: 'close', code: 1006 });
  assert.equal(sent.find(item => item.data.type === 'socket-handshake-failed').data.status, 1006);
  assert.equal(sent.some(item => item.data.type === 'failed'), false);
  const socket = new root.WebSocket('wss://xxz-xyzw.hortorgames.com/agent?p=mock');
  const request = sent.findLast(item => item.data.type === 'socket-open').data;
  const event = { ...envelope, type: 'socket-event', socketId: request.socketId };
  assert.ok(socket instanceof root.WebSocket);
  assert.equal(socket.readyState, root.WebSocket.CONNECTING);
  receive({ ...event, event: 'open', session: 'other-session' });
  assert.equal(socket.readyState, root.WebSocket.CONNECTING);
  receive({ ...event, event: 'open' });
  assert.equal(socket.readyState, root.WebSocket.OPEN);
  assert.equal(sent.find(item => item.data.phase === 'game-socket-open').data.type, 'progress');
  assert.equal(sent.some(item => item.data.type === 'ready'), false);
  socket.binaryType = 'arraybuffer';
  let bytes;
  socket.onmessage = ({ data }) => { bytes = [...new Uint8Array(data)]; };
  receive({ ...event, event: 'message', data: 'AQID' });
  assert.deepEqual(bytes, [1, 2, 3]);
  socket.send(Uint8Array.of(8, 9));
  await drain();
  assert.equal(sent.find(item => item.data.type === 'socket-send').data.data, 'CAk=');
  socket.close();
  receive({ ...event, event: 'close', code: 1000 });
  assert.equal(socket.readyState, root.WebSocket.CLOSED);
  assert.equal(sent.filter(item => item.data.type === 'socket-close').length, 1);
  const fallback = new root.WebSocket('wss://other.example.test/agent?p=mock');
  assert.equal(fallback.readyState, undefined);
  assert.equal(sent.filter(item => item.data.type === 'socket-open').length, 2);
});

test('shareable iOS startup diagnostics contain only known stages, times and bounded codes', () => {
  const diagnostic = formatIOSGameDiagnostic({
    accountName: 'private account', binHex: 'private bin', stage: 'auth-response', socketStatus: 1006,
    timings: { login: 10.3, 'auth-response': 521, 'auth-accepted': 634, 'private address': 100 },
  }, {
    code: 'game-auth-sdk-rejected', authCode: -10001, status: 90000, message: 'private response',
  }, { 'game-auth-sdk-rejected': true });
  assert.deepEqual(JSON.parse(diagnostic), {
    platform: 'ios', stage: 'auth-response', scripts: 'configured',
    timingsMs: { login: 10, 'auth-response': 521, 'auth-accepted': 634 },
    failure: 'game-auth-sdk-rejected', authCode: -10001, socketStatus: 1006,
  });
});

test('iOS drops a cancelled or previous-window XHR reply when reusing the request', async () => {
  const { root, sent } = fixture({ ios: true, interactive: false });
  const receive = root.__xyzwReceiveGameRuntime;
  receive({ ...envelope, type: 'initialize', binId: 'ios-test', binHex: '01' });
  await drain();
  const xhr = new root.XMLHttpRequest();
  const url = 'https://xxz-xyzw.hortorgames.com/login/authuser?_seq=1';
  let loaded = 0;
  xhr.addEventListener('load', () => loaded++);
  xhr.open('POST', url);
  xhr.send(Uint8Array.of(1));
  await drain();
  const first = sent.find(item => item.data.type === 'http-request').data.requestId;
  xhr.open('POST', url);
  xhr.send(Uint8Array.of(2));
  await drain();
  const second = sent.findLast(item => item.data.type === 'http-request').data.requestId;
  const reply = { ...envelope, type: 'http-response',
    response: { status: 200, contentType: 'application/octet-stream', dataBase64: 'Ag==' } };
  receive({ ...reply, requestId: first });
  receive({ ...reply, requestId: second, session: 'previous-window' });
  await drain();
  assert.equal(loaded, 0);
  receive({ ...reply, requestId: second });
  await drain();
  assert.equal(loaded, 1);
});

test('iOS observes a browser-managed official socket without forwarding it over the native bridge', async () => {
  const { root, sent } = fixture({ ios: true, interactive: false });
  root.__xyzwReceiveGameRuntime({ ...envelope, type: 'initialize', binId: 'ios-test', binHex: '01' });
  await drain();
  const socket = new root.WebSocket('wss://region.hortorgames.com/agent?p=mock');
  socket.dispatchEvent(new Event('open'));
  assert.deepEqual(sent.map(({ data }) => data.phase).filter(phase => phase?.startsWith('game-socket')),
    ['game-socket', 'game-socket-open']);
  assert.equal(sent.some(({ data }) => data.type === 'socket-open'), false);
});
