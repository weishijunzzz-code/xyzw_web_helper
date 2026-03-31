<template>
  <div class="statistic-cards">
    <div class="stat-card total">
      <div class="stat-icon">
        <n-icon :component="ListOutline" />
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总任务数</div>
      </div>
    </div>
    
    <div class="stat-card active">
      <div class="stat-icon">
        <n-icon :component="CheckmarkCircleOutline" />
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ stats.active }}</div>
        <div class="stat-label">激活任务</div>
      </div>
    </div>
    
    <div class="stat-card success">
      <div class="stat-icon">
        <n-icon :component="TrendingUpOutline" />
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ stats.todaySuccess }}</div>
        <div class="stat-label">今日成功</div>
      </div>
    </div>
    
    <div class="stat-card failed" :class="{ 'has-error': stats.todayFailed > 0 }">
      <div class="stat-icon">
        <n-icon :component="AlertCircleOutline" />
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ stats.todayFailed }}</div>
        <div class="stat-label">今日失败</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { 
  ListOutline, 
  CheckmarkCircleOutline, 
  TrendingUpOutline, 
  AlertCircleOutline
} from '@vicons/ionicons5';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  }
});

const stats = computed(() => ({
  total: props.tasks.length,
  active: props.tasks.filter(t => t.status === 'running').length,
  todaySuccess: props.tasks.reduce((sum, t) => sum + (t.runCount?.todaySuccess || 0), 0),
  todayFailed: props.tasks.reduce((sum, t) => sum + (t.runCount?.todayFailed || 0), 0)
}));
</script>

<style scoped lang="scss">
.statistic-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  
  // 平板端：2x2网格
  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }
  
  // 移动端：保持2x2网格，更紧凑
  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: var(--bg-primary, white);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s, box-shadow 0.2s;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }
  
  &.total { border-left: 4px solid #3b82f6; }
  &.active { border-left: 4px solid #10b981; }
  &.success { border-left: 4px solid #22c55e; }
  &.failed { border-left: 4px solid #ef4444; }
  
  &.has-error {
    animation: errorPulse 2s infinite;
  }
  
  // 移动端优化：更紧凑的布局
  @media (max-width: 640px) {
    padding: 12px;
    flex-direction: column;
    text-align: center;
    border-left: none;
    border-top: 4px solid;
    
    &.total { border-top-color: #3b82f6; }
    &.active { border-top-color: #10b981; }
    &.success { border-top-color: #22c55e; }
    &.failed { border-top-color: #ef4444; }
  }
}

.stat-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  margin-right: 16px;
  font-size: 24px;
  color: white;
  flex-shrink: 0;
  
  .total & { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .active & { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .success & { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
  .failed & { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  
  @media (max-width: 640px) {
    width: 36px;
    height: 36px;
    font-size: 18px;
    margin-right: 0;
    margin-bottom: 8px;
  }
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  line-height: 1;
  
  @media (max-width: 640px) {
    font-size: 22px;
  }
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
  margin-top: 4px;
  
  @media (max-width: 640px) {
    font-size: 12px;
    margin-top: 2px;
  }
}

@keyframes errorPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0);
  }
}

// 深色模式适配
[data-theme="dark"] {
  .stat-card {
    background: var(--bg-primary, #1f2937);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    
    &:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
  }
  
  .stat-value {
    color: var(--text-primary, #f9fafb);
  }
  
  .stat-label {
    color: var(--text-secondary, #9ca3af);
  }
}
</style>
