/**
 * 统一的日志管理工具
 * 支持开发/生产环境不同的日志级别
 */

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
}

// 当前日志级别，生产环境默认为 WARN
const currentLevel = import.meta.env?.PROD ? LogLevel.WARN : LogLevel.DEBUG

// 日志前缀
const PREFIX = '[XYZW]'

// 日志样式
const styles = {
  debug: 'color: #6b7280; font-weight: normal;',
  info: 'color: #3b82f6; font-weight: normal;',
  warn: 'color: #f59e0b; font-weight: bold;',
  error: 'color: #ef4444; font-weight: bold;'
}

/**
 * 日志记录器
 */
export const logger = {
  /**
   * 调试日志
   * @param {...any} args
   */
  debug(...args) {
    if (currentLevel <= LogLevel.DEBUG) {
      console.log(`%c${PREFIX} [DEBUG]`, styles.debug, ...args)
    }
  },

  /**
   * 信息日志
   * @param {...any} args
   */
  info(...args) {
    if (currentLevel <= LogLevel.INFO) {
      console.log(`%c${PREFIX} [INFO]`, styles.info, ...args)
    }
  },

  /**
   * 警告日志
   * @param {...any} args
   */
  warn(...args) {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(`%c${PREFIX} [WARN]`, styles.warn, ...args)
    }
  },

  /**
   * 错误日志
   * @param {...any} args
   */
  error(...args) {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(`%c${PREFIX} [ERROR]`, styles.error, ...args)
    }
  },

  /**
   * 分组日志
   * @param {string} label
   * @param {Function} fn
   */
  group(label, fn) {
    if (currentLevel <= LogLevel.DEBUG) {
      console.group(`${PREFIX} ${label}`)
      try {
        fn()
      } finally {
        console.groupEnd()
      }
    }
  },

  /**
   * 性能计时
   * @param {string} label
   * @returns {Function} 结束计时函数
   */
  time(label) {
    if (currentLevel <= LogLevel.DEBUG) {
      console.time(`${PREFIX} ${label}`)
      return () => console.timeEnd(`${PREFIX} ${label}`)
    }
    return () => {}
  },

  /**
   * 表格输出
   * @param {Array|Object} data
   * @param {Array<string>} columns
   */
  table(data, columns) {
    if (currentLevel <= LogLevel.DEBUG) {
      console.table(data, columns)
    }
  }
}

/**
 * 创建带模块名的日志记录器
 * @param {string} moduleName
 * @returns {Object}
 */
export function createLogger(moduleName) {
  const modulePrefix = `${PREFIX} [${moduleName}]`
  
  return {
    debug: (...args) => currentLevel <= LogLevel.DEBUG && console.log(`%c${modulePrefix} [DEBUG]`, styles.debug, ...args),
    info: (...args) => currentLevel <= LogLevel.INFO && console.log(`%c${modulePrefix} [INFO]`, styles.info, ...args),
    warn: (...args) => currentLevel <= LogLevel.WARN && console.warn(`%c${modulePrefix} [WARN]`, styles.warn, ...args),
    error: (...args) => currentLevel <= LogLevel.ERROR && console.error(`%c${modulePrefix} [ERROR]`, styles.error, ...args),
  }
}

// WebSocket 专用日志记录器
export const wsLogger = {
  debug: (...args) => currentLevel <= LogLevel.DEBUG && console.log(`%c${PREFIX} [WS] [DEBUG]`, styles.debug, ...args),
  info: (...args) => currentLevel <= LogLevel.INFO && console.log(`%c${PREFIX} [WS] [INFO]`, styles.info, ...args),
  warn: (...args) => currentLevel <= LogLevel.WARN && console.warn(`%c${PREFIX} [WS] [WARN]`, styles.warn, ...args),
  error: (...args) => currentLevel <= LogLevel.ERROR && console.error(`%c${PREFIX} [WS] [ERROR]`, styles.error, ...args),
  verbose: (...args) => currentLevel <= LogLevel.DEBUG && console.log(`%c${PREFIX} [WS] [VERBOSE]`, styles.debug, ...args),
  wsMessage: (tokenId, cmd, isResponse) => {
    if (currentLevel <= LogLevel.DEBUG) {
      const arrow = isResponse ? '◀' : '▶'
      console.log(`%c${PREFIX} [WS] [${tokenId}] ${arrow} ${cmd}`, styles.info)
    }
  },
  wsConnect: (tokenId) => {
    if (currentLevel <= LogLevel.INFO) {
      console.log(`%c${PREFIX} [WS] [${tokenId}] 🔌 WebSocket连接成功`, styles.info)
    }
  },
  wsDisconnect: (tokenId, reason) => {
    if (currentLevel <= LogLevel.INFO) {
      console.log(`%c${PREFIX} [WS] [${tokenId}] 🔌 WebSocket断开连接: ${reason}`, styles.warn)
    }
  },
  wsError: (tokenId, error) => {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(`%c${PREFIX} [WS] [${tokenId}] ❌ WebSocket错误:`, styles.error, error)
    }
  },
  connectionLock: (tokenId, operation, isLocking) => {
    if (currentLevel <= LogLevel.DEBUG) {
      const action = isLocking ? '获取' : '释放'
      console.log(`%c${PREFIX} [WS] [LOCK] ${action}锁: ${tokenId} (${operation})`, styles.debug)
    }
  }
}

// 游戏逻辑专用日志记录器
export const gameLogger = {
  debug: (...args) => currentLevel <= LogLevel.DEBUG && console.log(`%c${PREFIX} [GAME] [DEBUG]`, styles.debug, ...args),
  info: (...args) => currentLevel <= LogLevel.INFO && console.log(`%c${PREFIX} [GAME] [INFO]`, styles.info, ...args),
  warn: (...args) => currentLevel <= LogLevel.WARN && console.warn(`%c${PREFIX} [GAME] [WARN]`, styles.warn, ...args),
  error: (...args) => currentLevel <= LogLevel.ERROR && console.error(`%c${PREFIX} [GAME] [ERROR]`, styles.error, ...args),
  verbose: (...args) => currentLevel <= LogLevel.DEBUG && console.log(`%c${PREFIX} [GAME] [VERBOSE]`, styles.debug, ...args),
  gameMessage: (tokenId, cmd, hasBody) => {
    if (currentLevel <= LogLevel.DEBUG) {
      const arrow = hasBody ? '◀' : '▶'
      console.log(`%c${PREFIX} [GAME] [${tokenId}] ${arrow} ${cmd}`, styles.info)
    }
  }
}

// Token 专用日志记录器
export const tokenLogger = {
  debug: (...args) => currentLevel <= LogLevel.DEBUG && console.log(`%c${PREFIX} [TOKEN] [DEBUG]`, styles.debug, ...args),
  info: (...args) => currentLevel <= LogLevel.INFO && console.log(`%c${PREFIX} [TOKEN] [INFO]`, styles.info, ...args),
  warn: (...args) => currentLevel <= LogLevel.WARN && console.warn(`%c${PREFIX} [TOKEN] [WARN]`, styles.warn, ...args),
  error: (...args) => currentLevel <= LogLevel.ERROR && console.error(`%c${PREFIX} [TOKEN] [ERROR]`, styles.error, ...args),
  verbose: (...args) => currentLevel <= LogLevel.DEBUG && console.log(`%c${PREFIX} [TOKEN] [VERBOSE]`, styles.debug, ...args)
}

export default logger
