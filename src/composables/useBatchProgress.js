import { ref, h, render } from 'vue';
import BatchProgress from '@/components/Common/BatchProgress.vue';

/**
 * 批量任务进度管理
 */
export function useBatchProgress() {
  const progressRef = ref(null);
  const container = document.createElement('div');

  const state = ref({
    visible: false,
    title: '批量处理中',
    total: 0,
    current: 0,
    successCount: 0,
    errorCount: 0,
    currentItem: '',
    startTime: 0,
  });

  // 渲染进度组件
  const renderProgress = () => {
    const vnode = h(BatchProgress, {
      visible: state.value.visible,
      title: state.value.title,
      total: state.value.total,
      current: state.value.current,
      successCount: state.value.successCount,
      errorCount: state.value.errorCount,
      currentItem: state.value.currentItem,
      startTime: state.value.startTime,
      onCancel: handleCancel,
      onClose: handleClose,
    });

    render(vnode, container);
    document.body.appendChild(container);

    // 获取组件实例
    progressRef.value = vnode.component?.exposed;
  };

  // 开始批量任务
  const start = (options = {}) => {
    state.value = {
      visible: true,
      title: options.title || '批量处理中',
      total: options.total || 0,
      current: 0,
      successCount: 0,
      errorCount: 0,
      currentItem: '',
      startTime: Date.now(),
    };

    renderProgress();
  };

  // 更新进度
  const update = (itemName) => {
    state.value.current++;
    state.value.currentItem = itemName;
  };

  // 标记成功
  const success = () => {
    state.value.successCount++;
  };

  // 标记失败
  const fail = (itemName, errorMessage) => {
    state.value.errorCount++;
    progressRef.value?.addError(itemName, errorMessage);
  };

  // 完成
  const complete = () => {
    state.value.current = state.value.total;
  };

  // 关闭
  const close = () => {
    state.value.visible = false;
    setTimeout(() => {
      render(null, container);
      document.body.removeChild(container);
      progressRef.value?.reset();
    }, 300);
  };

  // 处理取消
  const handleCancel = () => {
    close();
    onCancelCallback?.();
  };

  // 处理关闭
  const handleClose = () => {
    close();
    onCloseCallback?.();
  };

  let onCancelCallback = null;
  let onCloseCallback = null;

  const onCancel = (callback) => {
    onCancelCallback = callback;
  };

  const onClose = (callback) => {
    onCloseCallback = callback;
  };

  return {
    state,
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
