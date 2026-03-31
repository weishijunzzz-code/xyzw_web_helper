import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useCountdown(targetTime: Date | string | undefined) {
  const remaining = ref(0);
  let rafId: number | null = null;
  let lastUpdate = 0;

  const formatted = computed(() => {
    if (!targetTime) return '未设置';
    
    const seconds = Math.floor(remaining.value / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (remaining.value <= 0) {
      return '即将执行';
    }
    
    if (days > 0) {
      return `${days}天${hours % 24}小时后`;
    } else if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟后`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒后`;
    } else {
      return `${seconds}秒后`;
    }
  });

  const detailed = computed(() => {
    if (!targetTime) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    
    const seconds = Math.floor(remaining.value / 1000);
    return {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60
    };
  });

  const isOverdue = computed(() => remaining.value <= 0);

  const updateCountdown = () => {
    if (!targetTime) {
      remaining.value = 0;
      return;
    }
    const target = new Date(targetTime).getTime();
    const now = Date.now();
    remaining.value = Math.max(0, target - now);
  };

  // 使用 requestAnimationFrame 优化性能，每秒更新一次
  const tick = (timestamp: number) => {
    // 每秒更新一次（1000ms）
    if (timestamp - lastUpdate >= 1000) {
      updateCountdown();
      lastUpdate = timestamp;
    }
    rafId = requestAnimationFrame(tick);
  };

  onMounted(() => {
    updateCountdown();
    rafId = requestAnimationFrame(tick);
  });

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  return { 
    remaining, 
    formatted, 
    detailed,
    isOverdue,
    updateCountdown 
  };
}

// 格式化下次执行时间
export function formatNextRunTime(targetTime: Date | string | undefined): string {
  if (!targetTime) return '未设置';
  
  const target = new Date(targetTime);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  
  // 如果是今天
  if (target.toDateString() === now.toDateString()) {
    const timeStr = target.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    if (diff <= 0) {
      return `今天 ${timeStr}`;
    }
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `今天 ${timeStr} (${hours}小时${minutes % 60}分钟后)`;
    } else {
      return `今天 ${timeStr} (${minutes}分钟后)`;
    }
  }
  
  // 如果是明天
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target.toDateString() === tomorrow.toDateString()) {
    return `明天 ${target.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`;
  }
  
  // 其他日期
  return target.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
