export const GAME_STARTUP_TIMING_KEY = 'android-game-startup-timings-v1';

const limits = 40;
const phases = new Set(['bin', 'iframe', 'scripts', 'version', 'assets', 'decode', 'launcher', 'switches', 'login', 'interactive', 'resume']);
const outcomes = new Set(['ready', 'failed']);
const launches = new Set(['first', 'relaunch', 'resume', 'switch']);

export function recordGameStartupTiming({ kind, status, timings, scriptCount = 0 }, storage = globalThis.localStorage) {
  if (!launches.has(kind) || !outcomes.has(status)) return;
  const durations = Object.fromEntries(Object.entries(timings || {}).filter(([key, value]) => (
    phases.has(key) && Number.isFinite(value) && value >= 0 && value <= 10 * 60 * 1000
  )).map(([key, value]) => [key, Math.round(value)]));
  try {
    let previous;
    try { previous = JSON.parse(storage.getItem(GAME_STARTUP_TIMING_KEY) || '[]'); } catch { previous = []; }
    const entries = Array.isArray(previous) ? previous.slice(-(limits - 1)) : [];
    entries.push({ kind, status, timings: durations, scriptCount: Number.isSafeInteger(scriptCount) && scriptCount >= 0 ? scriptCount : 0 });
    storage.setItem(GAME_STARTUP_TIMING_KEY, JSON.stringify(entries));
  } catch { /* Disabled/quota-exhausted storage must not interfere with game startup. */ }
}
