(function bootstrapAndroidSingle(root) {
  'use strict';

  const gameOrigin = 'https://appassets.androidplatform.net';
  const appOrigin = 'https://localhost';
  const channel = 'xyzw-android-game';
  const session = new URLSearchParams(root.location.search).get('session');
  const ios = root.parent === root && root.location.protocol === 'xyzw-game:'
    && root.location.hostname === 'runtime' && root.location.pathname === '/android-single.html'
    && root.webkit?.messageHandlers?.gameRuntime;
  if (!ios && (root.location.origin !== gameOrigin || root.parent === root)) return;
  if (!/^[a-z\d-]{16,100}$/i.test(session || '')) return;

  const doc = root.document;
  const splash = doc.getElementById('splash');
  const openedAt = performance.now();
  const pending = new Map();
  const gameSockets = new Map();
  let requestSequence = 0;
  let socketSequence = 0;
  let initialized = false;
  let settled = false;
  let launchTimer;

  const send = (type, fields = {}) => {
    const message = { channel, version: 1, session, type, ...fields };
    if (ios) ios.postMessage(message);
    else root.parent.postMessage(message, appOrigin);
  };
  const progress = (phase, start) => send('progress', { phase, durationMs: Math.round(performance.now() - start) });
  function fail(code, status) {
    if (settled) return;
    settled = true;
    clearTimeout(launchTimer);
    splash.style.display = 'block';
    splash.style.backgroundImage = 'none';
    splash.textContent = '游戏启动失败';
    send('failed', { code, ...(Number.isInteger(status) ? { status } : {}) });
  }

  if (root.androidBridge || root.CapacitorCookiesAndroidInterface || root.webkit?.messageHandlers?.bridge || root.Capacitor?.isNativePlatform?.()) {
    fail('unsafe-game-origin');
    return;
  }

  function stageCredential(binId, binHex) {
    if (!/^[\w-]{1,128}$/.test(binId || '') || typeof binHex !== 'string' ||
        !binHex.length || binHex.length > 4 * 1024 * 1024 || binHex.length % 2 || /[^a-f\d]/i.test(binHex)) {
      throw new Error('invalid-bin');
    }
    const binKey = `bin_data_${binId}`;
    const memory = new Map([
      [binKey, binHex],
      ['current_bin_id', binId],
      ['bin_file_list', JSON.stringify([{ id: binId, name: '当前账号' }])],
    ]);
    const sensitive = key => key.startsWith('bin_data_') || ['current_bin_id', 'bin_file_list', 'actual_login_bin_id'].includes(key);
    const storage = root.localStorage;
    const keys = () => [...Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter(key => key !== null && !sensitive(key)), ...memory.keys()];
    const handler = {
      get length() { return keys().length; },
      key(index) { return keys()[index] ?? null; },
      getItem(key) { return sensitive(String(key)) ? memory.get(String(key)) ?? null : storage.getItem(key); },
      setItem(key, value) {
        if (sensitive(String(key))) memory.set(String(key), String(value));
        else storage.setItem(key, value);
      },
      removeItem(key) {
        if (sensitive(String(key))) memory.delete(String(key));
        else storage.removeItem(key);
      },
      clear() { memory.clear(); storage.clear(); },
    };
    Object.defineProperty(root, 'localStorage', { configurable: true, value: new Proxy(handler, {
      get(target, key) { return typeof key !== 'string' || key in target ? target[key] : handler.getItem(key) ?? undefined; },
      set(target, key, value) {
        if (typeof key !== 'string' || key in target) return false;
        handler.setItem(key, value);
        return true;
      },
      ownKeys: keys,
      getOwnPropertyDescriptor(_target, key) {
        if (typeof key === 'string' && handler.getItem(key) !== null) return { enumerable: true, configurable: true };
      },
      deleteProperty(_target, key) {
        if (typeof key === 'string') handler.removeItem(key);
        return true;
      },
    }) });
  }

  const endpoints = new Map([
    ['https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=0.36.0-android', ['manifest', 'version']],
    ['https://comb-platform.hortorgames.com/comb-custom-switch-server/api/v1/switch/multi/status', ['switch-status', 'switches']],
  ]);

  function requestNative(endpoint, body, signal, extra = {}) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
      const requestId = String(++requestSequence);
      const cancel = () => finish(new DOMException('Cancelled', 'AbortError'));
      const timeout = setTimeout(() => finish(new Error('request-timeout')), 18000);
      const finish = (error, value) => {
        pending.delete(requestId);
        signal.removeEventListener('abort', cancel);
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(value);
      };
      pending.set(requestId, finish);
      signal.addEventListener('abort', cancel, { once: true });
      send('http-request', { requestId, endpoint, body, ...extra });
    });
  }

  function installRequests() {
    const webFetch = root.fetch.bind(root);
    root.fetch = async (input, options) => {
      const url = new URL(input?.url ?? input, root.location.href);
      if ((options?.method ?? input?.method ?? 'GET').toUpperCase() !== 'POST') {
        return webFetch(input, options);
      }
      if (ios && isAuthenticationURL(url)) {
        const start = performance.now();
        const request = new Request(input, options);
        progress('login', start);
        try {
          const { status, contentType, data } = await iosAuthentication(await request.arrayBuffer(), url, request.signal);
          reportAuthentication(status, data, start);
          return new Response(data.length ? data : null, { status, headers: { 'Content-Type': contentType } });
        } catch (error) {
          if (!request.signal.aborted) fail('game-auth-network');
          throw error;
        }
      }
      if (!endpoints.has(url.href)) return webFetch(input, options);
      const request = new Request(input, options);
      const [endpoint, phase] = endpoints.get(url.href);
      const start = performance.now();
      try {
        const { status, contentType, dataBase64 } = await requestNative(endpoint, await request.text(), request.signal);
        const data = Uint8Array.from(atob(dataBase64), char => char.charCodeAt(0));
        return new Response(data.length ? data : null, { status, headers: { 'Content-Type': contentType } });
      } finally { progress(phase, start); }
    };

    // Binary game POSTs use the browser's own XHR body and response handling.
    const xhrPrototype = root.XMLHttpRequest.prototype;
    const originalOpen = xhrPrototype.open;
    const originalSend = xhrPrototype.send;
    const originalAbort = xhrPrototype.abort;
    const authentication = new WeakMap();
    const iosRequests = new WeakMap();
    if (ios) {
      xhrPrototype.abort = function () {
        const controller = iosRequests.get(this);
        if (!controller) return originalAbort.call(this);
        iosRequests.delete(this);
        controller.abort();
        this.dispatchEvent(new Event('abort'));
        this.dispatchEvent(new Event('loadend'));
      };
    }
    xhrPrototype.open = function (method, url, ...options) {
      if (iosRequests.has(this)) this.abort();
      if (ios) {
        for (const name of ['readyState', 'status', 'statusText', 'response', 'responseText', 'getResponseHeader', 'getAllResponseHeaders']) {
          if (Object.prototype.hasOwnProperty.call(this, name)) delete this[name];
        }
      }
      const target = new URL(url, root.location.href);
      if (String(method).toUpperCase() === 'POST' && isAuthenticationURL(target)) {
        authentication.set(this, { url: target, async: options[0] !== false });
      } else authentication.delete(this);
      return originalOpen.call(this, method, url, ...options);
    };
    xhrPrototype.send = function (...args) {
      const auth = authentication.get(this);
      if (auth) {
        const start = performance.now();
        if (ios && auth.async) {
          progress('login', start);
          const controller = new AbortController();
          iosRequests.set(this, controller);
          sendIOSAuthentication(this, args[0], auth.url, controller.signal, start).finally(() => {
            if (iosRequests.get(this) === controller) iosRequests.delete(this);
          });
          return;
        }
        this.addEventListener('loadend', () => progress('login', start), { once: true });
      }
      return originalSend.apply(this, args);
    };
  }

  function isAuthenticationURL(url) {
    return url.origin === 'https://xxz-xyzw.hortorgames.com' && url.pathname === '/login/authuser';
  }

  function reportAuthentication(status, data, start) {
    if (status !== 200 || !data.byteLength) fail('game-auth-rejected', status);
    else progress('auth-response', start);
  }

  async function iosAuthentication(body, url, signal) {
    const seq = url.searchParams.get('_seq');
    const language = url.searchParams.get('_lang');
    const hint = url.searchParams.get('_hint');
    const keys = [...url.searchParams.keys()];
    const invalidHint = hint !== null && (hint.length > 128 || [...hint].some(character => {
      const code = character.codePointAt(0);
      return code < 32 || code === 127;
    }));
    if (url.search && (!seq || !/^\d{1,12}$/.test(seq)
        || new Set(keys).size !== keys.length || keys.some(key => !['_seq', '_lang', '_hint'].includes(key))
        || (language !== null && !/^[a-z][\w-]{0,31}$/i.test(language)) || invalidHint)) {
      fail('game-auth-request');
      throw new Error('invalid-auth-query');
    }
    const bytes = new Uint8Array(body);
    if (bytes.length > 2 * 1024 * 1024) throw new Error('request-too-large');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const { status, contentType, dataBase64 } = await requestNative('authuser', '', signal, {
      bodyBase64: btoa(binary), seq, language, hint,
    });
    return { status, contentType, data: Uint8Array.from(atob(dataBase64), char => char.charCodeAt(0)) };
  }

  async function sendIOSAuthentication(xhr, body, url, signal, start) {
    const set = (name, value) => Object.defineProperty(xhr, name, { configurable: true, value });
    try {
      const { status, contentType, data } = await iosAuthentication(await new Blob([body ?? '']).arrayBuffer(), url, signal);
      if (signal.aborted) return;
      reportAuthentication(status, data, start);
      const responseType = xhr.responseType;
      const text = responseType === '' || responseType === 'text' ? new TextDecoder().decode(data) : null;
      set('status', status);
      set('response', responseType === 'arraybuffer' ? data.buffer : responseType === 'blob'
        ? new Blob([data], { type: contentType }) : responseType === 'json' ? parseJSON(data) : text);
      if (text !== null) set('responseText', text);
      set('getResponseHeader', name => String(name).toLowerCase() === 'content-type' ? contentType : null);
      set('getAllResponseHeaders', () => `content-type: ${contentType}\r\n`);
      set('readyState', 4);
      xhr.dispatchEvent(new Event('readystatechange'));
      xhr.dispatchEvent(new Event('load'));
    } catch {
      if (signal.aborted) return;
      fail('game-auth-network');
      set('readyState', 4);
      xhr.dispatchEvent(new Event('readystatechange'));
      xhr.dispatchEvent(new Event('error'));
    }
    xhr.dispatchEvent(new Event('loadend'));
  }

  function parseJSON(data) {
    try { return JSON.parse(new TextDecoder().decode(data)); } catch { return null; }
  }

  function installIOSGameSocket() {
    const BrowserSocket = root.WebSocket;
    if (!ios || typeof BrowserSocket !== 'function') return;

    class GameSocket extends EventTarget {
      constructor(url) {
        super();
        this.url = url.href;
        this.readyState = 0;
        this.binaryType = 'blob';
        this.bufferedAmount = 0;
        this.extensions = '';
        this.protocol = '';
        this.id = String(++socketSequence);
        this.queue = Promise.resolve();
        this.startedAt = performance.now();
        gameSockets.set(this.id, this);
        progress('game-socket', this.startedAt);
        send('socket-open', { socketId: this.id, url: this.url });
      }

      send(payload) {
        if (this.readyState === 0) throw new DOMException('Socket is connecting', 'InvalidStateError');
        if (this.readyState !== 1) return;
        const size = typeof payload === 'string' ? new Blob([payload]).size : payload?.byteLength ?? payload?.size ?? 0;
        this.bufferedAmount += size;
        this.queue = this.queue.then(async () => {
          const data = typeof payload === 'string' ? { text: payload } : { data: encodeSocketFrame(
            payload instanceof Blob ? await payload.arrayBuffer() : payload,
          ) };
          if (this.readyState === 1) send('socket-send', { socketId: this.id, ...data });
        }).catch(() => this.close()).finally(() => { this.bufferedAmount -= size; });
      }

      close() {
        if (this.readyState > 1) return;
        this.readyState = 2;
        send('socket-close', { socketId: this.id });
      }

      emit(event) {
        this.dispatchEvent(event);
        this[`on${event.type}`]?.(event);
      }

      receive(data) {
        if (data.event === 'open' && this.readyState === 0) {
          this.readyState = 1;
          progress('game-socket-open', this.startedAt);
          this.emit(new Event('open'));
        } else if (data.event === 'message' && this.readyState === 1) {
          const bytes = typeof data.text === 'string' ? null : Uint8Array.from(atob(data.data), char => char.charCodeAt(0));
          this.emit(new MessageEvent('message', { data: bytes ? (this.binaryType === 'arraybuffer' ? bytes.buffer : new Blob([bytes])) : data.text }));
        } else if (data.event === 'close') {
          const wasConnecting = this.readyState === 0;
          this.readyState = 3;
          gameSockets.delete(this.id);
          const code = Number.isInteger(data.code) ? data.code : 1006;
          if (code !== 1000) this.emit(new Event('error'));
          this.emit(new CloseEvent('close', { code, reason: data.reason || '', wasClean: code === 1000 }));
          if (wasConnecting && !gameSockets.size) fail('game-socket-failed', code);
        }
      }
    }

    root.WebSocket = new Proxy(BrowserSocket, {
      construct(target, args, newTarget) {
        const url = new URL(args[0], root.location.href);
        const protocols = args[1];
        if (url.origin === 'wss://xxz-xyzw.hortorgames.com' && url.pathname === '/agent'
            && !url.username && !url.password && !url.hash && (protocols == null || Array.isArray(protocols) && !protocols.length)) {
          return new GameSocket(url);
        }
        return Reflect.construct(target, args, newTarget);
      },
      get(target, key, receiver) {
        if (key === Symbol.hasInstance) return socket => socket instanceof GameSocket || socket instanceof target;
        return Reflect.get(target, key, receiver);
      },
    });
    for (const name of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) GameSocket.prototype[name] = BrowserSocket[name];
  }

  function encodeSocketFrame(data) {
    const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
    let text = '';
    for (let index = 0; index < bytes.length; index += 8192) {
      text += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return btoa(text);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      doc.head.appendChild(script);
    });
  }

  function adaptGameCanvas() {
    const cc = root.cc;
    if (!cc?.Canvas || !cc.view || !cc.ResolutionPolicy) return;

    const view = cc.view;
    let adapted;
    function fitPortrait() {
      const canvas = cc.Canvas.instance;
      if (!canvas) return;
      const design = canvas.designResolution;
      const frame = view.getFrameSize();
      const needsFit = frame.height > frame.width && design?.width > 0 && design.height > 0
        && frame.height > frame.width * design.height / design.width + 1;

      if (adapted?.canvas !== canvas) adapted = undefined;
      if (!needsFit) {
        if (adapted) {
          view.setDesignResolutionSize(design.width, design.height, adapted.policy);
          adapted = undefined;
        }
        return;
      }

      adapted ??= { canvas, policy: view.getResolutionPolicy() };
      view.setDesignResolutionSize(design.width, design.height, cc.ResolutionPolicy.FIXED_WIDTH);
    }

    // Cocos recalculates its frame and input bounds on browser resize before this callback.
    root.addEventListener('resize', fitPortrait);
    cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, fitPortrait);
    fitPortrait();
  }

  function waitForInteractive(start, runScripts, assetTime) {
    if (settled) return;
    const cc = root.cc;
    const entity = cc?.sys?.entityNode1 || cc?.director?.getScene()?.getChildByName('Global Entity');
    const game = entity?.getComponent?.('Game') || entity?._components
      ?.find(component => cc.js.getClassName(component) === 'Game');
    const state = game?.stateMachine?.current ?? game?._stateMachine?._current;
    if (state?.stateId !== 'GameRunning') {
      launchTimer = setTimeout(() => waitForInteractive(start, runScripts, assetTime), 200);
      return;
    }
    progress('interactive', start);
    send('progress', { phase: 'assets', durationMs: Math.round(assetTime.download) });
    send('progress', { phase: 'decode', durationMs: Math.round(assetTime.decode) });
    runScripts('document-idle');
    settled = true;
    send('ready');
  }

  async function start({ binId, binHex, scripts }) {
    stageCredential(binId, binHex);
    installRequests();
    installIOSGameSocket();
    progress('iframe', openedAt);
    const entries = Array.isArray(scripts) ? scripts.filter(script => typeof script?.id === 'string' &&
      typeof script.code === 'string' && typeof script.name === 'string') : [];
    const runScripts = root.createLocalGameScriptRunner(entries, binId, (id, status, code) => send('script-result', { id, status, code }));
    let scriptStart = performance.now();
    runScripts('document-start');
    const earlyScriptsMs = performance.now() - scriptStart;
    const assetTime = { download: 0, decode: 0 };
    root.__xyzwAssetTiming = (phase, duration) => { if (!settled) assetTime[phase] += duration; };
    const runtime = [
      'embedded-hud.js', 'patch.decrypted_readable.js', 'src/settings.da7ef.js', 'game-defines.a175e.js',
      'main.2a00e.js', 'cocos2d-js-min.a5841.js', 'sh1.js', 'diagnose_require.js',
    ];
    for (const src of runtime) await loadScript(src);
    if (root.__vmTraceConfig) root.__vmTraceConfig.enabled = false;
    scriptStart = performance.now();
    runScripts('document-end');
    send('progress', { phase: 'scripts', durationMs: Math.round(earlyScriptsMs + performance.now() - scriptStart) });
    root.HtmlIsLoaded = true;
    await root.boot({
      autoFullscreen: false,
      onReady() {
        adaptGameCanvas();
        splash.style.display = 'none';
        progress('launcher', openedAt);
        waitForInteractive(openedAt, runScripts, assetTime);
      },
      onFailure: () => fail('resource-load-failed'),
    });
  }

  const hello = () => send('hello');
  function receive(data) {
    if (data?.channel !== channel || data.version !== 1 || data.session !== session) return;
    if (data.type === 'http-response') {
      const finish = pending.get(data.requestId);
      if (finish) finish(data.response ? null : new Error('network-request-failed'), data.response);
    }
    if (data.type === 'socket-event') gameSockets.get(data.socketId)?.receive(data);
    if (data.type !== 'initialize' || initialized || settled) return;
    initialized = true;
    clearInterval(handshakeTimer);
    clearTimeout(handshakeDeadline);
    start(data).catch(() => fail('game-initialization-failed'));
  }
  if (ios) root.__xyzwReceiveGameRuntime = receive;
  else root.addEventListener('message', event => {
    if (event.source === root.parent && event.origin === appOrigin) receive(event.data);
  });
  const handshakeTimer = setInterval(hello, 500);
  const handshakeDeadline = setTimeout(() => {
    clearInterval(handshakeTimer);
    fail('game-handshake-timeout');
  }, 12000);
  hello();
})(window);
