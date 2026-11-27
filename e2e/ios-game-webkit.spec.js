import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const bootstrap = readFileSync(new URL('../public/game/android-single.js', import.meta.url), 'utf8');
const scriptsRuntime = readFileSync(new URL('../public/game/android-game-scripts.js', import.meta.url), 'utf8');
const inviteRuntime = readFileSync(new URL('../public/game/native-team-invite.js', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../public/game/cocos2d-js-min.a5841.js', import.meta.url), 'utf8');

test('the iOS login bootstrap delivers real browser XHR and WebSocket events', async ({ page }) => {
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Game login fixture</title>' })
    : route.abort());
  await page.goto('https://game-startup-fixture.test');
  await page.evaluate(() => {
    const messages = [];
    const machine = { current: { stateId: 'GameLogin' } };
    const location = new URL('xyzw-game://runtime/android-single.html?session=00000000000000000000000000000001');
    const runtime = window.gameFixture = {
      location,
      localStorage: window.localStorage,
      XMLHttpRequest,
      WebSocket,
      fetch: window.fetch.bind(window),
      document: {
        getElementById: () => ({ style: {} }),
        createElement: () => ({}),
        head: { appendChild: element => queueMicrotask(element.onload) },
      },
      cc: { sys: { entityNode1: { getComponent: () => ({ stateMachine: machine }) } } },
      createLocalGameScriptRunner: () => () => {},
      boot: ({ onReady }) => onReady(),
      webkit: { messageHandlers: { gameRuntime: { postMessage(data) {
        messages.push(data);
        const { channel, version, session } = data;
        const reply = body => queueMicrotask(() => runtime.__xyzwReceiveGameRuntime({ channel, version, session, ...body }));
        if (data.type === 'hello') reply({ type: 'initialize', binId: 'fixture', binHex: '0102' });
        if (data.type === 'http-request') reply({ type: 'http-response', requestId: data.requestId,
          response: { status: 200, contentType: 'application/octet-stream', dataBase64: 'AwL/AQ==' } });
        if (data.type === 'socket-open') reply({ type: 'socket-event', event: 'open', socketId: data.socketId });
        if (data.type === 'socket-send') reply({ type: 'socket-event', event: 'message', socketId: data.socketId, data: 'BAU=' });
      } } } },
      machine,
      messages,
    };
    runtime.parent = runtime;
  });
  await page.addScriptTag({ content: bootstrap.replace(/\}\)\(window\);\s*$/, '})(window.gameFixture);') });
  await expect.poll(() => page.evaluate(() => window.gameFixture.messages.some(item => item.phase === 'launcher'))).toBe(true);
  const result = await page.evaluate(async () => {
    const runtime = window.gameFixture;
    const xhr = new runtime.XMLHttpRequest();
    xhr.open('POST', 'https://xxz-xyzw.hortorgames.com/login/authuser?_seq=7&_hint=test%2Bclient&_lang=zh-CN');
    xhr.responseType = 'arraybuffer';
    const loaded = new Promise(resolve => xhr.addEventListener('load', resolve, { once: true }));
    xhr.send(Uint8Array.of(1, 2));
    await loaded;
    const socket = new runtime.WebSocket('wss://xxz-xyzw.hortorgames.com/agent?p=fixture&e=x');
    socket.binaryType = 'arraybuffer';
    const opened = new Promise(resolve => { socket.onopen = resolve; });
    await opened;
    const received = new Promise(resolve => socket.addEventListener('message', event => resolve(event.data), { once: true }));
    socket.send(Uint8Array.of(3, 4));
    const bytes = [...new Uint8Array(await received)];
    const auth = runtime.messages.find(item => item.type === 'http-request');
    const gameWasRunning = runtime.messages.some(item => item.type === 'ready');
    runtime.machine.current.stateId = 'GameRunning';
    return { request: [auth.seq, auth.language, auth.hint, auth.bodyBase64], status: xhr.status,
      response: [...new Uint8Array(xhr.response)], bytes, gameWasRunning };
  });
  expect(result).toEqual({ request: ['7', 'zh-CN', 'test+client', 'AQI='], status: 200,
    response: [3, 2, 255, 1], bytes: [4, 5], gameWasRunning: false });
  await expect.poll(() => page.evaluate(() => window.gameFixture.messages.some(item => item.type === 'ready'))).toBe(true);
});

test('native game fits a tall portrait and runs the floating UI after the role enters the game', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}</style><canvas id="GameCanvas"></canvas><div id="splash"></div>' })
    : route.abort());
  await page.goto('https://game-surface-fixture.test');
  await page.addScriptTag({ content: engine });
  await page.addScriptTag({ content: scriptsRuntime });
  await page.evaluate(() => {
    const { cc, createLocalGameScriptRunner } = window;
    const messages = [];
    const machine = { current: { stateId: 'Login' } };
    const entries = [
      { id: 'early', name: 'Early', runAt: 'document-start', code: 'unsafeWindow.earlyScriptRan = unsafeWindow.cc.Canvas.instance == null' },
      { id: 'unsupported', name: 'External dependency', code: '// ==UserScript==\n// @require https://example.invalid/script.js\n// ==/UserScript==' },
      { id: 'broken', name: 'Broken', code: 'return Promise.reject(new ReferenceError("Missing interface"))' },
      { id: 'floating', name: 'Floating button', runAt: 'document-idle', code: `
        if (window.gameFixture.machine.current.stateId !== 'GameRunning') throw new Error('Game is not ready');
        const button = document.createElement('button');
        button.textContent = '打开测试浮层';
        button.style.cssText = 'position:fixed;right:12px;top:50%;width:104px;height:44px';
        button.onclick = () => { button.textContent = '浮层已打开'; };
        document.body.append(button);
      ` },
    ];
    const runtime = window.gameFixture = {
      location: new URL('xyzw-game://runtime/android-single.html?session=00000000000000000000000000000001'),
      localStorage: window.localStorage,
      XMLHttpRequest,
      WebSocket,
      fetch: window.fetch.bind(window),
      addEventListener: window.addEventListener.bind(window),
      document: {
        getElementById: id => document.getElementById(id),
        createElement: () => ({}),
        head: { appendChild: element => queueMicrotask(element.onload) },
      },
      cc,
      createLocalGameScriptRunner,
      boot: ({ onReady }) => cc.game.run({ id: 'GameCanvas', renderMode: 2, showFPS: false }, () => {
        cc.view.resizeWithBrowserSize(true);
        const scene = new cc.Scene('Fixture');
        const node = new cc.Node('Canvas');
        scene.addChild(node);
        const canvas = node.addComponent(cc.Canvas);
        canvas.designResolution = cc.size(720, 1280);
        canvas.fitHeight = true;
        canvas.fitWidth = true;
        cc.director.runSceneImmediate(scene);
        cc.sys.entityNode1 = { getComponent: () => ({ stateMachine: machine }) };
        onReady();
      }),
      webkit: { messageHandlers: { gameRuntime: { postMessage(data) {
        messages.push(data);
        const { channel, version, session } = data;
        if (data.type === 'hello') queueMicrotask(() => runtime.__xyzwReceiveGameRuntime({
          channel, version, session, type: 'initialize', binId: 'fixture', binHex: '0102', scripts: entries,
        }));
      } } } },
      machine,
      messages,
    };
    runtime.parent = runtime;
  });
  await page.addScriptTag({ content: bootstrap.replace(/\}\)\(window\);\s*$/, '})(window.gameFixture);') });
  await expect.poll(() => page.evaluate(() => window.gameFixture.messages.some(item => item.phase === 'launcher'))).toBe(true);
  expect(await page.evaluate(() => window.earlyScriptRan)).toBe(true);
  const canvas = page.locator('#GameCanvas');
  const dimensions = async () => {
    const { x, y, width, height } = await canvas.boundingBox();
    return [x, y, width, height];
  };
  await expect.poll(dimensions).toEqual([0, 0, 360, 640]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(dimensions).toEqual([0, 0, 390, 844]);
  await expect(page.getByRole('button', { name: '打开测试浮层' })).toHaveCount(0);
  await page.evaluate(() => { window.gameFixture.machine.current.stateId = 'GameRunning'; });
  await page.getByRole('button', { name: '打开测试浮层' }).click();
  await expect(page.getByRole('button', { name: '浮层已打开' })).toBeVisible();
  const results = await page.evaluate(() => Object.fromEntries(window.gameFixture.messages
    .filter(item => item.type === 'script-result').map(item => [item.id, item.code || item.status])));
  expect(results).toEqual({ early: 'loaded', floating: 'loaded', broken: 'script-reference-error', unsupported: 'external-script-dependency' });
  await page.setViewportSize({ width: 360, height: 640 });
  await expect.poll(dimensions).toEqual([0, 0, 360, 640]);
  await expect(page.getByRole('button', { name: '浮层已打开' })).toHaveCount(1);
});

test('team copy settles on success, failure and timeout, and a failed invite releases only its own mask', async ({ page }) => {
  await page.route('https://team-invite-fixture.test/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><button id="underlying">Play</button><div id="unrelated"></div><div id="splash"></div>',
  }));
  await page.goto('https://team-invite-fixture.test/');
  await page.addScriptTag({ content: inviteRuntime });
  await page.evaluate(() => {
    const results = [];
    const messages = [];
    const platform = { setClipboardData: ({ data }) => results.push(`original:${data}`) };
    class Dialog {
      onAwake() {
        this.mask = document.createElement('div');
        this.mask.style.cssText = 'position:fixed;inset:0';
        this.mask.id = 'invite-mask';
        document.body.append(this.mask);
      }
      async onShown() { if (this.broken) throw new Error('missing invite view'); }
      close() { return false; }
      hide() { this.mask.remove(); }
    }
    window.__require = name => name === 'PlatformManager' ? { PlatformManager: { instance: platform } } : { TeamUpShareChatDialog: Dialog };
    const runtime = window.gameFixture = {
      location: new URL('xyzw-game://runtime/android-single.html?session=00000000000000000000000000000001'),
      localStorage: window.localStorage, XMLHttpRequest, WebSocket, fetch: window.fetch.bind(window),
      document: { getElementById: id => document.getElementById(id), createElement: () => ({}),
        head: { appendChild: element => queueMicrotask(element.onload) } },
      cc: { sys: { entityNode1: { getComponent: () => ({ stateMachine: { current: { stateId: 'GameRunning' } } }) } } },
      boot: ({ onReady }) => onReady(), createLocalGameScriptRunner: () => () => {},
      installNativeTeamInvite: window.installNativeTeamInvite, results, messages,
      copy(id) { platform.setClipboardData({ data: id, success: () => results.push('success'),
        fail: () => results.push('fail'), complete: () => results.push('complete') }); },
      open(broken) { const dialog = runtime.dialog ??= new Dialog(); dialog.broken = broken; dialog.onAwake(); return dialog.onShown(); },
      webkit: { messageHandlers: { gameRuntime: { postMessage(data) {
        messages.push(data);
        const { channel, version, session, requestId, roomId } = data;
        const reply = response => queueMicrotask(() => runtime.__xyzwReceiveGameRuntime({ channel, version, session, ...response }));
        if (data.type === 'hello') reply({ type: 'initialize', binId: 'fixture', binHex: '0102' });
        if (data.type === 'team-copy-request' && roomId !== '90003') reply({ type: 'team-copy-response', requestId, ok: roomId === '90001' });
      } } } },
    };
    runtime.parent = runtime;
    document.querySelector('#underlying').onclick = () => { document.body.dataset.inputRestored = 'true'; };
  });
  await page.addScriptTag({ content: bootstrap.replace(/\}\)\(window\);\s*$/, '})(window.gameFixture);') });
  await expect.poll(() => page.evaluate(() => window.gameFixture.messages.some(message => message.type === 'ready'))).toBe(true);
  const results = () => page.evaluate(() => window.gameFixture.results);
  await page.evaluate(() => window.gameFixture.copy('90001'));
  await expect.poll(results).toEqual(['success', 'complete']);
  await page.evaluate(() => window.gameFixture.copy('90002'));
  await expect.poll(results).toEqual(['success', 'complete', 'fail', 'complete']);
  await page.evaluate(() => window.gameFixture.copy('90003'));
  await expect.poll(results, { timeout: 4500 }).toEqual(['success', 'complete', 'fail', 'complete', 'fail', 'complete']);
  await page.evaluate(() => window.gameFixture.copy('90001'));
  await expect.poll(results).toEqual(['success', 'complete', 'fail', 'complete', 'fail', 'complete', 'success', 'complete']);
  await page.evaluate(() => window.gameFixture.copy('other content'));
  expect((await results()).at(-1)).toBe('original:other content');

  await page.evaluate(() => window.gameFixture.open(false));
  await expect(page.locator('#invite-mask')).toBeVisible();
  await page.evaluate(() => window.gameFixture.dialog.hide());
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.gameFixture.open(true));
    await expect(page.locator('#invite-mask')).toHaveCount(0);
  }
  await expect(page.locator('#unrelated')).toHaveCount(1);
  await page.locator('#underlying').click();
  await expect(page.locator('body')).toHaveAttribute('data-input-restored', 'true');
  expect(await page.evaluate(() => window.gameFixture.messages.filter(item => item.type === 'team-invite-failed').length)).toBe(2);
});
