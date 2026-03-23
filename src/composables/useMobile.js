import { ref, onMounted, onUnmounted, computed } from "vue";

// 全局响应式移动端状态
const isMobile = ref(false);
const isTablet = ref(false);
const windowWidth = ref(0);

// 检查当前设备类型
const checkDeviceType = () => {
  if (typeof window === "undefined") return;
  
  windowWidth.value = window.innerWidth;
  isMobile.value = window.innerWidth <= 768;
  isTablet.value = window.innerWidth > 768 && window.innerWidth <= 1024;
};

// 移动端管理逻辑
export function useMobile() {
  let resizeObserver = null;
  let mutationObserver = null;

  // 初始化
  const initMobile = () => {
    checkDeviceType();
    setupResizeListener();
    setupDOMObserver();
  };

  // 监听窗口大小变化
  const setupResizeListener = () => {
    if (typeof window === "undefined") return;
    
    // 使用 ResizeObserver 监听 body 大小变化
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        checkDeviceType();
      });
      resizeObserver.observe(document.body);
    } else {
      // 降级方案：使用 resize 事件
      window.addEventListener("resize", checkDeviceType);
    }
  };

  // 设置DOM变化监听器
  const setupDOMObserver = () => {
    if (typeof window === "undefined") return;
    
    mutationObserver = new MutationObserver(() => {
      checkDeviceType();
    });

    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  };

  // 清理监听器
  const cleanup = () => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    window.removeEventListener("resize", checkDeviceType);
  };

  // 计算属性：是否显示移动端布局
  const isMobileLayout = computed(() => isMobile.value);
  
  // 计算属性：是否显示桌面端布局
  const isDesktopLayout = computed(() => !isMobile.value);

  // 组件挂载时初始化
  onMounted(() => {
    initMobile();
  });

  // 组件卸载时清理
  onUnmounted(() => {
    cleanup();
  });

  return {
    isMobile,
    isTablet,
    isMobileLayout,
    isDesktopLayout,
    windowWidth,
    initMobile,
    cleanup,
  };
}

// 全局状态版本（用于非组件场景）
export function useMobileGlobal() {
  return {
    isMobile,
    isTablet,
    isMobileLayout: computed(() => isMobile.value),
    isDesktopLayout: computed(() => !isMobile.value),
    windowWidth,
  };
}

export default useMobile;
