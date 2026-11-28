export const GAME_STARTUP_TIMING_KEY = 'android-game-startup-timings-v1';

const limits = 40;
const phases = new Set(['bin', 'iframe', 'scripts', 'version', 'assets', 'bundles', 'decode', 'launcher', 'switches',
  'login', 'auth-response', 'auth-accepted', 'game-socket', 'game-socket-open', 'interactive', 'resume']);
const outcomes = new Set(['ready', 'failed']);
const launches = new Set(['first', 'relaunch', 'resume', 'switch']);

function safeDurations(timings) {
  return Object.fromEntries(Object.entries(timings || {}).filter(([key, value]) => (
    phases.has(key) && Number.isFinite(value) && value >= 0 && value <= 10 * 60 * 1000
  )).map(([key, value]) => [key, Math.round(value)]));
}

export function formatIOSGameDiagnostic(session, failure, allowedFailures) {
  const code = Object.prototype.hasOwnProperty.call(allowedFailures, failure?.code) ? failure.code : undefined;
  const result = {
    platform: 'ios',
    stage: phases.has(session.stage) ? session.stage : 'unknown',
    scripts: session.withoutScripts ? 'disabled' : 'configured',
    timingsMs: safeDurations(session.timings),
    ...(code ? { failure: code } : {}),
  };
  if (Number.isInteger(failure?.status) && failure.status >= 100 && failure.status <= 4999) result.status = failure.status;
  if (code === 'game-auth-sdk-rejected' && Number.isInteger(failure.authCode) && Math.abs(failure.authCode) <= 9999999) {
    result.authCode = failure.authCode;
  }
  if (Number.isInteger(session.socketStatus) && session.socketStatus >= 100 && session.socketStatus <= 4999) {
    result.socketStatus = session.socketStatus;
  }
  return JSON.stringify(result, null, 2);
}

export function recordGameStartupTiming({ kind, status, timings, scriptCount = 0 }, storage = globalThis.localStorage) {
  if (!launches.has(kind) || !outcomes.has(status)) return;
  const durations = safeDurations(timings);
  try {
    let previous;
    try { previous = JSON.parse(storage.getItem(GAME_STARTUP_TIMING_KEY) || '[]'); } catch { previous = []; }
    const entries = Array.isArray(previous) ? previous.slice(-(limits - 1)) : [];
    entries.push({ kind, status, timings: durations, scriptCount: Number.isSafeInteger(scriptCount) && scriptCount >= 0 ? scriptCount : 0 });
    storage.setItem(GAME_STARTUP_TIMING_KEY, JSON.stringify(entries));
  } catch { /* Disabled/quota-exhausted storage must not interfere with game startup. */ }
}
