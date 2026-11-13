<template>
  <div v-if="loadingStore.isGlobalLoading || loadingStore.hasActiveTasks" class="global-loading-overlay">
    <div class="global-loading-container">
      <!-- 加载动画 -->
      <div class="loading-animation">
        <div class="spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
        </div>
      </div>
      
      <!-- 加载信息 -->
      <div class="loading-info">
        <p class="loading-message">{{ displayMessage }}</p>
        <p v-if="loadingStore.activeTaskCount > 1" class="loading-tasks">
          进行中: {{ loadingStore.activeTaskCount }} 个任务
        </p>
      </div>
      
      <!-- 进度条 -->
      <div v-if="displayProgress !== undefined" class="loading-progress">
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: `${displayProgress}%` }"
          ></div>
        </div>
        <span class="progress-text">{{ displayProgress }}%</span>
      </div>
      
      <!-- 任务列表 -->
      <div v-if="loadingStore.activeTaskCount > 1" class="task-list">
        <div 
          v-for="[id, task] in loadingStore.loadingTasks" 
          :key="id"
          class="task-item"
        >
          <span class="task-name">{{ task.message }}</span>
          <span v-if="task.progress !== undefined" class="task-progress">
            {{ task.progress }}%
          </span>
          <div v-else class="task-dot"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLoadingStore } from '@/stores/loadingStore'

const loadingStore = useLoadingStore()

const displayMessage = computed(() => {
  if (loadingStore.currentTask) {
    return loadingStore.currentTask.message
  }
  return loadingStore.globalMessage
})

const displayProgress = computed(() => {
  if (loadingStore.overallProgress !== undefined) {
    return loadingStore.overallProgress
  }
  return loadingStore.globalProgress
})
</script>

<style scoped lang="scss">
.global-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: none;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 1050);
  animation: fadeIn 0.2s ease;
}

.global-loading-container {
  background: var(--bg-primary, #ffffff);
  border-radius: var(--border-radius-large, 12px);
  padding: var(--spacing-xl, 32px);
  min-width: 280px;
  max-width: 400px;
  box-shadow: var(--shadow-light);
  animation: slideUp 0.3s ease;
}

.loading-animation {
  display: flex;
  justify-content: center;
  margin-bottom: var(--spacing-lg, 24px);
}

.spinner {
  position: relative;
  width: 60px;
  height: 60px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: var(--primary-color);
  animation: spin 1s linear infinite;
}

.spinner-ring:nth-child(1) {
  animation-duration: 1s;
}

.spinner-ring:nth-child(2) {
  width: 75%;
  height: 75%;
  top: 12.5%;
  left: 12.5%;
  animation-duration: 0.8s;
  animation-direction: reverse;
  border-top-color: var(--secondary-color);
}

.spinner-ring:nth-child(3) {
  width: 50%;
  height: 50%;
  top: 25%;
  left: 25%;
  animation-duration: 0.6s;
  border-top-color: var(--primary-color-hover);
}

.loading-info {
  text-align: center;
  margin-bottom: var(--spacing-md, 16px);
}

.loading-message {
  font-size: var(--font-size-md, 16px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-primary, #333333);
  margin: 0 0 var(--spacing-xs, 4px);
}

.loading-tasks {
  font-size: var(--font-size-sm, 14px);
  color: var(--text-secondary, #666666);
  margin: 0;
}

.loading-progress {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  margin-bottom: var(--spacing-md, 16px);
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-tertiary, #f0f2f5);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--primary-color);
  min-width: 40px;
  text-align: right;
}

.task-list {
  border-top: 1px solid var(--border-light, #e5e7eb);
  padding-top: var(--spacing-md, 16px);
  max-height: 150px;
  overflow-y: auto;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs, 4px) 0;
  font-size: var(--font-size-sm, 14px);
}

.task-name {
  color: var(--text-secondary, #666666);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-progress {
  color: var(--primary-color);
  font-weight: var(--font-weight-medium, 500);
  font-size: var(--font-size-xs, 12px);
}

.task-dot {
  width: 6px;
  height: 6px;
  background: var(--primary-color);
  border-radius: 50%;
  animation: pulse 1.5s ease infinite;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

// 深色模式适配
:global(.dark) .global-loading-container,
:global([data-theme="dark"]) .global-loading-container {
  background: var(--bg-secondary, #374151);
}

:global(.dark) .loading-message,
:global([data-theme="dark"]) .loading-message {
  color: var(--text-primary, #ffffff);
}

:global(.dark) .loading-tasks,
:global([data-theme="dark"]) .loading-tasks,
:global(.dark) .task-name,
:global([data-theme="dark"]) .task-name {
  color: var(--text-secondary, #d1d5db);
}

:global(.dark) .progress-bar,
:global([data-theme="dark"]) .progress-bar {
  background: var(--bg-tertiary, #4b5563);
}

:global(.dark) .task-list,
:global([data-theme="dark"]) .task-list {
  border-color: var(--border-light, #4b5563);
}

// 移动端适配
@media (max-width: 768px) {
  .global-loading-container {
    margin: var(--spacing-md, 16px);
    padding: var(--spacing-lg, 24px);
    min-width: auto;
    width: calc(100% - var(--spacing-md, 16px) * 2);
  }
  
  .spinner {
    width: 48px;
    height: 48px;
  }
  
  .loading-message {
    font-size: var(--font-size-sm, 14px);
  }
}
</style>
