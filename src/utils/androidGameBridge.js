import { registerPlugin } from '@capacitor/core';

export const ANDROID_GAME_ORIGIN = 'https://appassets.androidplatform.net';
export const ANDROID_GAME_CHANNEL = 'xyzw-android-game';
export const ANDROID_GAME_VERSION = 1;

const assets = registerPlugin('GameAssets');
const frameRequests = new WeakMap();
const requestIdPattern = /^[1-9]\d{0,5}$/;
const jsonBodyLimit = 64 * 1024;

export function isAndroidGameMessage(event, source, session) {
  const data = event.data;
  return Boolean(source && session && event.source === source && event.origin === ANDROID_GAME_ORIGIN &&
    data?.channel === ANDROID_GAME_CHANNEL && data.version === ANDROID_GAME_VERSION && data.session === session);
}

function encodeBody(body) {
  const bytes = new TextEncoder().encode(body);
  if (bytes.length > jsonBodyLimit) throw new Error('request-too-large');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function officialRequest(endpoint, body) {
  if (typeof body !== 'string' || body.length > jsonBodyLimit) return null;
  if (endpoint === 'manifest' && body === '') {
    return {
      endpoint, query: { platform: 'hortor', version: '0.36.0-android' },
      contentType: 'application/json', bodyBase64: '',
    };
  }
  if (endpoint !== 'switch-status') return null;

  const value = JSON.parse(body);
  if (!value || typeof value !== 'object') return null;
  return { endpoint, contentType: 'application/json', bodyBase64: encodeBody(body) };
}

export function handleAndroidGameRequest(event, { source, session, isCurrent = () => true }) {
  if (event.data?.type !== 'http-request' || !isAndroidGameMessage(event, source, session)) return false;
  const { requestId, endpoint, body } = event.data;
  if (typeof requestId !== 'string' || !requestIdPattern.test(requestId)) return true;

  let requests = frameRequests.get(source);
  if (requests?.session !== session) {
    requests = { session, pending: new Set() };
    frameRequests.set(source, requests);
  }
  if (requests.pending.has(requestId)) return true;

  function reply(result) {
    if (!isCurrent() || frameRequests.get(source) !== requests) return;
    source.postMessage({
      channel: ANDROID_GAME_CHANNEL, version: ANDROID_GAME_VERSION, session,
      type: 'http-response', requestId, ...result,
    }, ANDROID_GAME_ORIGIN);
  }

  let request;
  try { request = officialRequest(endpoint, body); } catch { /* Invalid IPC payload. */ }
  if (!request || requests.pending.size >= 4) {
    reply({ code: 'unsupported-request' });
    return true;
  }
  requests.pending.add(requestId);
  assets.request(request)
    .then(result => reply({ response: result }))
    .catch(() => reply({ code: 'network-request-failed' }))
    .finally(() => requests.pending.delete(requestId));
  return true;
}
