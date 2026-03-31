<template>
  <n-drawer
    :show="show"
    placement="right"
    :width="320"
    :mask-closable="true"
    @update:show="$emit('update:show', $event)"
  >
    <n-drawer-content title="执行日志" closable>
      <div class="mobile-logs-content" ref="logsContainer">
        <div v-if="logs.length === 0" class="logs-empty">
          <n-empty description="暂无执行日志" size="small">
            <template #icon>
              <n-icon :component="DocumentTextOutline" />
            </template>
          </n-empty>
        </div>
        <template v-else>
          <div 
            v-for="(log, index) in logs" 
            :key="index"
            class="log-item"
            :class="log.type"
          >
            <span class="log-time">{{ log.time }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
        </template>
      </div>
      <template #footer>
        <n-space justify="space-between" align="center" style="width: 100%">
          <n-text depth="3" size="small">
            共 {{ logs.length }} 条日志
          </n-text>
          <n-button 
            v-if="logs.length > 0" 
            size="small" 
            @click="$emit('clear')"
          >
            清空日志
          </n-button>
        </n-space>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { DocumentTextOutline } from '@vicons/ionicons5';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  logs: {
    type: Array,
    default: () => []
  }
});

defineEmits(['update:show', 'clear']);

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
.mobile-logs-content {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  
  .log-item {
    display: flex;
    gap: 12px;
    padding: 8px 0;
    font-size: 13px;
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
}

.logs-empty {
  padding: 40px 0;
}
</style>
