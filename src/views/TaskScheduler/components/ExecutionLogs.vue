<template>
  <div v-if="logs.length > 0" class="execution-logs">
    <div class="logs-header">
      <h3 class="logs-title">执行日志</h3>
      <n-button size="small" @click="$emit('clear')">清空</n-button>
    </div>
    <div class="logs-content" ref="logsContainer">
      <div 
        v-for="(log, index) in logs" 
        :key="index"
        class="log-item"
        :class="log.type"
      >
        <span class="log-time">{{ log.time }}</span>
        <span class="log-message">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  logs: {
    type: Array,
    default: () => []
  }
});

defineEmits(['clear']);

const logsContainer = ref(null);

// 滚动日志到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    }
  });
};

// 监听日志变化，自动滚动
watch(() => props.logs.length, () => {
  scrollToBottom();
}, { flush: 'post' });

// 暴露方法给父组件
defineExpose({
  scrollToBottom
});
</script>

<style scoped lang="scss">
.execution-logs {
  margin-top: 24px;
  background: var(--bg-primary, white);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-light);
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.logs-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  margin: 0;
}

.logs-content {
  max-height: 300px;
  overflow-y: auto;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  padding: 12px;
}

.log-item {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  
  &:last-child {
    border-bottom: none;
  }
  
  .log-time {
    color: var(--text-secondary, #6b7280);
    font-family: monospace;
    flex-shrink: 0;
  }
  
  .log-message {
    flex: 1;
  }
  
  &.info .log-message {
    color: var(--text-primary, #374151);
  }
  
  &.success .log-message {
    color: #10b981;
  }
  
  &.error .log-message {
    color: #ef4444;
  }
  
  &.warning .log-message {
    color: #f59e0b;
  }
}

[data-theme="dark"] {
  .execution-logs {
    background: var(--bg-primary, #1f2937);
    box-shadow: var(--shadow-light);
  }
  
  .logs-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .logs-content {
    background: var(--bg-secondary, #374151);
  }
  
  .log-item {
    border-color: var(--border-light, #4b5563);
    
    &.info .log-message {
      color: var(--text-primary, #e5e7eb);
    }
  }
}
</style>
