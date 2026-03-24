import { ref } from 'vue';
import { useMessage } from 'naive-ui';

/**
 * 全局错误处理
 */
export function useErrorHandler() {
  const message = useMessage();
  const errorLog = ref([]);

  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {Object} options - 配置选项
   * @param {string} options.context - 错误上下文
   * @param {boolean} options.showMessage - 是否显示消息提示
   * @param {string} options.defaultMessage - 默认错误消息
   * @param {Function} options.onRetry - 重试回调
   */
  const handleError = (error, options = {}) => {
    const {
      context = '',
      showMessage = true,
      defaultMessage = '操作失败',
      onRetry = null,
    } = options;

    // 提取错误消息
    let errorMessage = defaultMessage;
    if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    // 记录错误日志
    const logEntry = {
      id: Date.now(),
      message: errorMessage,
      context,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
    };
    errorLog.value.unshift(logEntry);

    // 限制日志数量
    if (errorLog.value.length > 50) {
      errorLog.value = errorLog.value.slice(0, 50);
    }

    // 显示错误消息
    if (showMessage) {
      const content = context ? `${context}: ${errorMessage}` : errorMessage;
      message.error(content, {
        duration: 5000,
        closable: true,
      });
    }

    // 控制台输出
    console.error(`[ErrorHandler] ${context}:`, error);

    return logEntry;
  };

  /**
   * 处理API错误
   */
  const handleApiError = (error, options = {}) => {
    const { context = 'API请求' } = options;

    let message = '请求失败';
    let shouldRetry = false;

    if (error?.response) {
      // HTTP错误
      const status = error.response.status;
      switch (status) {
        case 401:
          message = '登录已过期，请重新登录';
          break;
        case 403:
          message = '没有权限执行此操作';
          break;
        case 404:
          message = '请求的资源不存在';
          break;
        case 429:
          message = '请求过于频繁，请稍后再试';
          shouldRetry = true;
          break;
        case 500:
        case 502:
        case 503:
          message = '服务器繁忙，请稍后再试';
          shouldRetry = true;
          break;
        default:
          message = `请求失败 (${status})`;
      }
    } else if (error?.request) {
      // 网络错误
      message = '网络连接失败，请检查网络';
      shouldRetry = true;
    }

    return handleError(error, {
      ...options,
      context,
      defaultMessage: message,
      shouldRetry,
    });
  };

  /**
   * 处理WebSocket错误
   */
  const handleWebSocketError = (error, options = {}) => {
    const { context = 'WebSocket' } = options;

    let message = '连接失败';
    if (error?.code === 1006) {
      message = '连接异常断开';
    } else if (error?.code === 1008) {
      message = 'Token已过期';
    }

    return handleError(error, {
      ...options,
      context,
      defaultMessage: message,
    });
  };

  /**
   * 处理业务逻辑错误
   */
  const handleBusinessError = (errorCode, options = {}) => {
    const errorMessages = {
      'TOKEN_EXPIRED': 'Token已过期，请重新导入',
      'TOKEN_INVALID': 'Token无效，请检查格式',
      'RATE_LIMIT': '操作过于频繁，请稍后再试',
      'INSUFFICIENT_RESOURCES': '资源不足，无法执行操作',
      'TASK_ALREADY_RUNNING': '任务正在执行中，请等待完成',
      'NETWORK_ERROR': '网络错误，请检查连接',
      'TIMEOUT': '操作超时，请重试',
    };

    const message = errorMessages[errorCode] || '操作失败';

    return handleError(new Error(message), {
      ...options,
      defaultMessage: message,
    });
  };

  /**
   * 显示成功消息
   */
  const showSuccess = (content, options = {}) => {
    message.success(content, {
      duration: 3000,
      ...options,
    });
  };

  /**
   * 显示警告消息
   */
  const showWarning = (content, options = {}) => {
    message.warning(content, {
      duration: 4000,
      ...options,
    });
  };

  /**
   * 显示信息消息
   */
  const showInfo = (content, options = {}) => {
    message.info(content, {
      duration: 3000,
      ...options,
    });
  };

  /**
   * 确认对话框
   */
  const confirm = (options = {}) => {
    const {
      title = '确认',
      content = '确定要执行此操作吗？',
      positiveText = '确定',
      negativeText = '取消',
      type = 'warning',
    } = options;

    return new Promise((resolve) => {
      const { dialog } = window.$naive || {};
      if (!dialog) {
        resolve(confirm(content));
        return;
      }

      dialog[type]({
        title,
        content,
        positiveText,
        negativeText,
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false),
      });
    });
  };

  /**
   * 清空错误日志
   */
  const clearErrorLog = () => {
    errorLog.value = [];
  };

  return {
    errorLog,
    handleError,
    handleApiError,
    handleWebSocketError,
    handleBusinessError,
    showSuccess,
    showWarning,
    showInfo,
    confirm,
    clearErrorLog,
  };
}

/**
 * 全局错误处理器（应用级别）
 */
export function setupGlobalErrorHandler(app) {
  // Vue 错误处理
  app.config.errorHandler = (err, vm, info) => {
    console.error('[Vue Error]', err, info);
    // 可以在这里上报到错误监控服务
  };

  // 未处理的 Promise 错误
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason);
    event.preventDefault();
  });

  // 全局 JS 错误
  window.addEventListener('error', (event) => {
    console.error('[Global Error]', event.error);
    event.preventDefault();
  });
}
