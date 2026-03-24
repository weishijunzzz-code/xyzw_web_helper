import { defineStore } from "pinia";
import { ref, computed } from "vue";

/**
 * 助手状态管理 Store
 * 用于管理所有助手的运行状态，实现互斥运行
 */
export const useHelperStore = defineStore("helper", () => {
  // 运行中的助手映射
  const runningHelpers = ref(new Map());

  // 助手名称映射
  const helperNames = {
    box: "宝箱",
    fish: "钓鱼",
    recruit: "招募",
  };

  // 计算属性：是否有助手在运行
  const hasRunningHelper = computed(() => runningHelpers.value.size > 0);

  // 计算属性：获取当前运行的助手ID
  const currentRunningHelperId = computed(() => {
    if (runningHelpers.value.size === 0) return null;
    return runningHelpers.value.keys().next().value;
  });

  // 计算属性：获取当前运行的助手名称
  const currentRunningHelperName = computed(() => {
    const id = currentRunningHelperId.value;
    return id ? helperNames[id] || id : null;
  });

  // 计算属性：所有助手状态
  const allHelpersStatus = computed(() => {
    return Object.keys(helperNames).map((id) => ({
      id,
      name: helperNames[id],
      isRunning: runningHelpers.value.has(id),
      ...runningHelpers.value.get(id),
    }));
  });

  /**
   * 注册助手（开始运行）
   * @param {string} helperId - 助手ID
   * @param {Object} info - 助手信息
   */
  const registerHelper = (helperId, info = {}) => {
    // 如果已经有其他助手在运行，返回 false
    if (runningHelpers.value.size > 0 && !runningHelpers.value.has(helperId)) {
      return false;
    }

    runningHelpers.value.set(helperId, {
      name: helperNames[helperId] || helperId,
      startTime: Date.now(),
      progress: null,
      ...info,
    });

    return true;
  };

  /**
   * 注销助手（停止运行）
   * @param {string} helperId - 助手ID
   */
  const unregisterHelper = (helperId) => {
    runningHelpers.value.delete(helperId);
  };

  /**
   * 更新助手进度
   * @param {string} helperId - 助手ID
   * @param {Object} progress - 进度信息
   */
  const updateHelperProgress = (helperId, progress) => {
    if (runningHelpers.value.has(helperId)) {
      const current = runningHelpers.value.get(helperId);
      runningHelpers.value.set(helperId, {
        ...current,
        progress,
        lastUpdateTime: Date.now(),
      });
    }
  };

  /**
   * 检查是否有其他助手在运行
   * @param {string} helperId - 当前助手ID
   * @returns {boolean}
   */
  const hasOtherRunningHelper = (helperId) => {
    if (runningHelpers.value.size === 0) return false;
    if (runningHelpers.value.size === 1 && runningHelpers.value.has(helperId)) {
      return false;
    }
    return true;
  };

  /**
   * 获取正在运行的助手名称
   * @returns {string|null}
   */
  const getRunningHelperName = () => {
    for (const [id, info] of runningHelpers.value) {
      return info.name || helperNames[id] || id;
    }
    return null;
  };

  /**
   * 获取助手的运行时长（秒）
   * @param {string} helperId - 助手ID
   * @returns {number}
   */
  const getRunningDuration = (helperId) => {
    const helper = runningHelpers.value.get(helperId);
    if (!helper || !helper.startTime) return 0;
    return Math.floor((Date.now() - helper.startTime) / 1000);
  };

  /**
   * 停止所有助手
   */
  const stopAllHelpers = () => {
    runningHelpers.value.clear();
  };

  /**
   * 检查指定助手是否在运行
   * @param {string} helperId - 助手ID
   * @returns {boolean}
   */
  const isHelperRunning = (helperId) => {
    return runningHelpers.value.has(helperId);
  };

  return {
    // 状态
    runningHelpers,
    helperNames,

    // 计算属性
    hasRunningHelper,
    currentRunningHelperId,
    currentRunningHelperName,
    allHelpersStatus,

    // 方法
    registerHelper,
    unregisterHelper,
    updateHelperProgress,
    hasOtherRunningHelper,
    getRunningHelperName,
    getRunningDuration,
    stopAllHelpers,
    isHelperRunning,
  };
});
