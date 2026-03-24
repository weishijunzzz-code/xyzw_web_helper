import { ref, h, render, reactive } from 'vue';
import BatchProgress from '@/components/Common/BatchProgress.vue';

/**
 * 批量任务进度管理 - 修复版
 * 使用全局单例模式确保进度状态正确更新
 */

// 全局状态，确保只有一个进度实例
const globalProgressState = reactive({
  visible: false,
  title: '批量处理中',
  total: 0,
  current: 0,
  successCount: 0,
  errorCount: 0,
  currentItem: '',
  startTime: 0,
  errorList: [],
});

let container = null;
let isRendered = false;

export function useBatchProgress() {
  // 渲染进度组件
  const renderProgress = () => {
    if (isRendered) return;
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'batch-progress-container';
    }

    const vnode = h(BatchProgress, {
      visible: globalProgressState.visible,
      title: globalProgressState.title,
      total: globalProgressState.total,
      current: globalProgressState.current,
      successCount: globalProgressState.successCount,
      errorCount: globalProgressState.errorCount,
      currentItem: globalProgressState.currentItem,
      startTime: globalProgressState.startTime,
      errorList: globalProgressState.errorList,
      onCancel: handleCancel,
      onClose: handleClose,
    });

    render(vnode, container);
    
    if (!document.body.contains(container)) {
      document.body.appendChild(container);
    }
    
    isRendered = true;
  };

  // 开始批量任务
  const start = (options = {}) => {
    // 重置所有状态
    globalProgressState.visible = true;
    globalProgressState.title = options.title || '批量处理中';
    globalProgressState.total = options.total || 0;
    globalProgressState.current = 0;
    globalProgressState.successCount = 0;
    globalProgressState.errorCount = 0;
    globalProgressState.currentItem = '';
    globalProgressState.startTime = Date.now();
    globalProgressState.errorList = [];

    renderProgress();
  };

  // 更新进度 - 使用队列避免冲突
  const update = (itemName) => {
    globalProgressState.current++;
    globalProgressState.currentItem = itemName;
  };

  // 标记成功
  const success = () => {
    globalProgressState.successCount++;
  };

  // 标记失败
  const fail = (itemName, errorMessage) => {
    globalProgressState.errorCount++;
    globalProgressState.errorList.push({ name: itemName, message: errorMessage });
  };

  // 完成
  const complete = () => {
    globalProgressState.current = globalProgressState.total;
    globalProgressState.currentItem = '';
  };

  // 关闭
  const close = () => {
    globalProgressState.visible = false;
    
    // 延迟清理DOM
    setTimeout(() => {
      if (container && document.body.contains(container)) {
        render(null, container);
        document.body.removeChild(container);
        container = null;
        isRendered = false;
      }
      // 重置状态
      globalProgressState.errorList = [];
    }, 300);
  };

  // 处理取消
  let onCancelCallback = null;
  let onCloseCallback = null;

  const handleCancel = () => {
    close();
    onCancelCallback?.();
  };

  const handleClose = () => {
    close();
    onCloseCallback?.();
  };

  const onCancel = (callback) => {
    onCancelCallback = callback;
  };

  const onClose = (callback) => {
    onCloseCallback = callback;
  };

  return {
    state: globalProgressState,
    start,
    update,
    success,
    fail,
    complete,
    close,
    onCancel,
    onClose,
  };
}

/**
 * 批量任务执行器 - 封装常用批量操作模式
 */
export async function executeBatch(items, executeFn, options = {}) {
  const progress = useBatchProgress();

  const {
    title = '批量处理',
    continueOnError = true,
    delay = 0,
  } = options;

  progress.start({
    title,
    total: items.length,
  });

  const results = {
    success: [],
    fail: [],
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemName = typeof item === 'string' ? item : item.name || item.id || `项目 ${i + 1}`;

    progress.update(itemName);

    try {
      await executeFn(item, i);
      progress.success();
      results.success.push(item);
    } catch (error) {
      progress.fail(itemName, error.message);
      results.fail.push({ item, error });

      if (!continueOnError) {
        break;
      }
    }

    // 延迟处理
    if (delay > 0 && i < items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  progress.complete();

  return new Promise((resolve) => {
    progress.onClose(() => {
      resolve(results);
    });
  });
}
