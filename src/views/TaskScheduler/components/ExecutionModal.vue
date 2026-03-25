<template>
  <n-modal
    :show="show"
    preset="card"
    title="任务执行中"
    style="width: 90%; max-width: 500px"
    :closable="false"
    :mask-closable="false"
    @update:show="$emit('update:show', $event)"
  >
    <div class="execution-progress">
      <n-progress 
        type="line" 
        :percentage="progress" 
        :indicator-placement="'inside'"
        :status="progress === 100 ? 'success' : 'processing'"
      />
      <p class="progress-text">{{ statusText }}</p>
      
      <div v-if="results.length > 0" class="execution-results">
        <n-divider />
        <h4>执行结果</h4>
        <div class="results-list">
          <div 
            v-for="result in results" 
            :key="result.tokenId"
            class="result-item"
            :class="result.success ? 'success' : 'error'"
          >
            <n-icon :component="result.success ? CheckmarkCircleOutline : CloseCircleOutline" />
            <span class="result-name">{{ result.tokenName }}</span>
            <span class="result-message">{{ result.message }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <template #footer>
      <n-space justify="end">
        <n-button 
          :disabled="isExecuting" 
          @click="$emit('close')"
        >
          {{ isExecuting ? '执行中...' : '关闭' }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup>
import { CheckmarkCircleOutline, CloseCircleOutline } from '@vicons/ionicons5';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  progress: {
    type: Number,
    default: 0
  },
  statusText: {
    type: String,
    default: '准备执行...'
  },
  results: {
    type: Array,
    default: () => []
  },
  isExecuting: {
    type: Boolean,
    default: false
  }
});

defineEmits(['update:show', 'close']);
</script>

<style scoped lang="scss">
.execution-progress {
  padding: 20px 0;
}

.progress-text {
  text-align: center;
  margin-top: 16px;
  color: var(--text-secondary, #6b7280);
}

.execution-results {
  margin-top: 20px;
  
  h4 {
    margin-bottom: 12px;
    font-size: 14px;
    color: var(--text-primary, #374151);
  }
}

.results-list {
  max-height: 200px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  
  &.success {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
  }
  
  &.error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  
  .result-name {
    font-weight: 500;
    min-width: 100px;
  }
  
  .result-message {
    font-size: 13px;
    opacity: 0.8;
  }
}

[data-theme="dark"] {
  .execution-results h4 {
    color: var(--text-primary, #e5e7eb);
  }
  
  .progress-text {
    color: var(--text-secondary, #9ca3af);
  }
}
</style>
