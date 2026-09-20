const LEVELS = { error: 0, warn: 1, info: 2, verbose: 3, debug: 4 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'];

function fmt(level, tag, msg, extra) {
  const ts = new Date().toISOString().slice(11, 23);
  const base = `[${ts}] [${level.toUpperCase()}] [${tag}] ${msg}`;
  if (extra !== undefined) {
    return base + ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra));
  }
  return base;
}

function createLogger(tag) {
  const log = (level, msg, extra) => {
    if (LEVELS[level] <= currentLevel) {
      const line = fmt(level, tag, msg, extra);
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    }
  };
  return {
    error: (msg, extra) => log('error', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    verbose: (msg, extra) => log('verbose', msg, extra),
    debug: (msg, extra) => log('debug', msg, extra),
    wsConnect: (id) => log('info', `WS connected: ${id}`),
    wsDisconnect: (id, reason) => log('info', `WS disconnected: ${id} ${reason || ''}`),
    wsError: (id, err) => log('error', `WS error: ${id}`, err),
    wsMessage: (id, cmd, isIncoming) => log('debug', `WS ${isIncoming ? '<<<' : '>>>'} ${id} ${cmd}`),
    connectionLock: (id, op, acquired) => log('debug', `Lock ${acquired ? 'acquired' : 'released'}: ${id} (${op})`),
    gameMessage: (id, cmd, hasBody) => log('debug', `Game msg: ${id} ${cmd} body=${hasBody}`),
  };
}

export const wsLogger = createLogger('ws');
export const gameLogger = createLogger('game');
export const tokenLogger = createLogger('token');
