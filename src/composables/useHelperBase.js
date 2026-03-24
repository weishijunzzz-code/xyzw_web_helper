import { ref, computed, reactive } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { useHelperStore } from "@/stores/helperStore";

/**
 * 通用助手基础组合式函数
 * @param {string} helperId - 助手唯一标识
 * @param {Object} options - 配置选项
 * @returns {Object} 助手状态和操作方法
 */
export function useHelperBase(helperId, options = {}) {
  const {
    batchSize = 10,
    defaultTarget = 0,
    targetStep = 10,
    requireToken = true,
  } = options;

  const tokenStore = useTokenStore();
  const helperStore = useHelperStore();
  const message = useMessage();

  // 模式：手动/自动
  const mode = ref("manual");

  // 手动模式配置
  const manualConfig = reactive({
    number: batchSize,
  });

  // 自动模式配置
  const autoConfig = reactive({
    targetValue: defaultTarget,
    completedValue: 0,
  });

  // 运行状态
  const state = reactive({
    isRunning: false,
    progressText: "",
    startTime: null,
    estimatedEndTime: null,
  });

  // 计算属性
  const remainingValue = computed(() => {
    return Math.max(0, autoConfig.targetValue - autoConfig.completedValue);
  });

  const progressPercentage = computed(() => {
    if (!autoConfig.targetValue || autoConfig.targetValue === 0) return 0;
    return Math.min(
      100,
      Math.round((autoConfig.completedValue / autoConfig.targetValue) * 100)
    );
  });

  const isCompleted = computed(() => {
    return autoConfig.completedValue >= autoConfig.targetValue;
  });

  const canStart = computed(() => {
    if (state.isRunning) return false;
    if (mode.value === "auto") {
      return autoConfig.targetValue > 0 && remainingValue.value > 0;
    }
    return true;
  });

  // 检查是否可以启动
  const checkCanStart = () => {
    if (requireToken && !tokenStore.selectedToken) {
      message.warning("请先选择Token");
      return false;
    }

    // 检查是否有其他助手在运行
    if (helperStore.hasOtherRunningHelper(helperId)) {
      const runningHelper = helperStore.getRunningHelperName();
      message.warning(`请先停止${runningHelper}助手`);
      return false;
    }

    if (mode.value === "auto" && (!autoConfig.targetValue || autoConfig.targetValue <= 0)) {
      message.warning("请设置目标值");
      return false;
    }

    return true;
  };

  // 开始运行
  const start = async (onStartCallback) => {
    if (!checkCanStart()) return false;

    state.isRunning = true;
    state.startTime = Date.now();
    autoConfig.completedValue = 0;
    state.progressText = "准备开始...";

    // 注册到全局状态
    helperStore.registerHelper(helperId, {
      name: options.name || helperId,
      startTime: state.startTime,
    });

    if (onStartCallback) {
      try {
        await onStartCallback();
      } catch (error) {
        console.error(`${helperId} 运行出错:`, error);
        message.error("运行出错: " + error.message);
        stop();
        return false;
      }
    }

    return true;
  };

  // 停止运行
  const stop = (onStopCallback) => {
    state.isRunning = false;
    state.progressText = isCompleted.value ? "已完成" : "已停止";
    
    // 从全局状态注销
    helperStore.unregisterHelper(helperId);

    if (onStopCallback) {
      onStopCallback();
    }
  };

  // 重置进度
  const reset = () => {
    autoConfig.completedValue = 0;
    state.progressText = "";
    state.startTime = null;
    state.estimatedEndTime = null;
    message.info("已重置进度");
  };

  // 更新进度
  const updateProgress = (completed, total, extraInfo = "") => {
    autoConfig.completedValue = completed;
    const remaining = Math.max(0, total - completed);
    
    let text = `已完成 ${completed} / 目标 ${total}`;
    if (remaining > 0) {
      text += ` (还需 ${remaining})`;
    }
    if (extraInfo) {
      text += ` ${extraInfo}`;
    }
    
    state.progressText = text;

    // 更新全局状态
    helperStore.updateHelperProgress(helperId, {
      completed,
      total,
      percentage: progressPercentage.value,
    });
  };

  // 批量处理逻辑
  const executeBatches = async (totalCount, executeFn, options = {}) => {
    const { batchSize = 10, onBatchComplete, delay = 1000 } = options;
    
    const batches = Math.floor(totalCount / batchSize);
    const remainder = totalCount % batchSize;
    let completed = 0;

    // 执行完整批次
    for (let i = 0; i < batches; i++) {
      if (!state.isRunning) break;

      await executeFn(batchSize);
      completed += batchSize;
      updateProgress(completed, totalCount);

      if (onBatchComplete) {
        await onBatchComplete(batchSize, completed);
      }
    }

    // 执行余数
    if (remainder > 0 && state.isRunning) {
      await executeFn(remainder);
      completed += remainder;
      updateProgress(completed, totalCount);

      if (onBatchComplete) {
        await onBatchComplete(remainder, completed);
      }
    }

    return completed;
  };

  // 获取运行时长（格式化）
  const getRunningDuration = () => {
    if (!state.startTime) return "00:00";
    const duration = Math.floor((Date.now() - state.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // 生成数量选项
  const generateNumberOptions = (values) => {
    return values.map((v) => ({ label: String(v), value: v }));
  };

  return {
    // 状态
    mode,
    manualConfig,
    autoConfig,
    state,
    
    // 计算属性
    remainingValue,
    progressPercentage,
    isCompleted,
    canStart,
    
    // 方法
    checkCanStart,
    start,
    stop,
    reset,
    updateProgress,
    executeBatches,
    getRunningDuration,
    generateNumberOptions,
    
    // 原始 store（供组件直接使用）
    tokenStore,
    helperStore,
    message,
  };
}
