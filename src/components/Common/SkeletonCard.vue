<template>
  <div class="skeleton-card" :class="{ 'skeleton-active': active, [`skeleton-${variant}`]: true }">
    <!-- 头部骨架 -->
    <div v-if="showHeader" class="skeleton-header">
      <div class="skeleton-avatar-wrapper" v-if="showAvatar">
        <div class="skeleton-avatar"></div>
        <div v-if="showStatus" class="skeleton-status"></div>
      </div>
      <div class="skeleton-title-wrapper">
        <div class="skeleton-badge" v-if="showBadge"></div>
        <div class="skeleton-title" :style="{ width: titleWidth }"></div>
        <div class="skeleton-subtitle" v-if="showSubtitle" :style="{ width: subtitleWidth }"></div>
        <div class="skeleton-meta" v-if="showMeta">
          <div class="skeleton-meta-item" v-for="i in metaCount" :key="i"></div>
        </div>
      </div>
    </div>
    
    <!-- 内容区域 -->
    <div class="skeleton-content" :class="{ 'skeleton-grid': layout === 'grid' }">
      <template v-if="layout === 'default'">
        <div 
          v-for="i in rows" 
          :key="i" 
          class="skeleton-row"
          :class="{ 'skeleton-row-short': i === rows && shortLastRow }"
          :style="{ width: getRowWidth(i), height: `${rowHeight}px` }"
        ></div>
      </template>
      
      <template v-else-if="layout === 'grid'">
        <div 
          v-for="i in gridItems" 
          :key="i" 
          class="skeleton-grid-item"
        >
          <div class="skeleton-grid-icon"></div>
          <div class="skeleton-grid-text"></div>
        </div>
      </template>
      
      <template v-else-if="layout === 'chart'">
        <div class="skeleton-chart">
          <div class="skeleton-chart-bars">
            <div 
              v-for="i in 5" 
              :key="i" 
              class="skeleton-chart-bar"
              :style="{ height: `${20 + Math.random() * 60}%` }"
            ></div>
          </div>
        </div>
      </template>
    </div>
    
    <!-- 操作按钮区域 -->
    <div v-if="showActions" class="skeleton-actions" :class="{ 'skeleton-actions-center': centerActions }">
      <div 
        v-for="i in actionCount" 
        :key="i" 
        class="skeleton-button"
        :class="{ 'skeleton-button-primary': i === 1 && hasPrimaryAction }"
        :style="{ width: `${80 + Math.random() * 40}px` }"
      ></div>
    </div>
    
    <!-- 底部区域 -->
    <div v-if="showFooter" class="skeleton-footer">
      <div class="skeleton-footer-left">
        <div class="skeleton-footer-item"></div>
      </div>
      <div class="skeleton-footer-right">
        <div class="skeleton-footer-item short"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  // 基础配置
  rows: {
    type: Number,
    default: 3
  },
  rowHeight: {
    type: Number,
    default: 16
  },
  active: {
    type: Boolean,
    default: true
  },
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'card', 'list', 'stat'].includes(value)
  },
  
  // 头部配置
  showHeader: {
    type: Boolean,
    default: true
  },
  showAvatar: {
    type: Boolean,
    default: false
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showBadge: {
    type: Boolean,
    default: false
  },
  showSubtitle: {
    type: Boolean,
    default: false
  },
  showMeta: {
    type: Boolean,
    default: false
  },
  metaCount: {
    type: Number,
    default: 2
  },
  titleWidth: {
    type: String,
    default: '60%'
  },
  subtitleWidth: {
    type: String,
    default: '40%'
  },
  
  // 内容布局
  layout: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'grid', 'chart'].includes(value)
  },
  gridItems: {
    type: Number,
    default: 4
  },
  shortLastRow: {
    type: Boolean,
    default: true
  },
  
  // 操作区域
  showActions: {
    type: Boolean,
    default: false
  },
  actionCount: {
    type: Number,
    default: 2
  },
  hasPrimaryAction: {
    type: Boolean,
    default: true
  },
  centerActions: {
    type: Boolean,
    default: false
  },
  
  // 底部
  showFooter: {
    type: Boolean,
    default: false
  }
});

const getRowWidth = (index) => {
  // 随机宽度，让骨架屏看起来更自然
  const widths = ['100%', '95%', '90%', '85%', '80%', '75%', '60%'];
  return widths[(index - 1) % widths.length];
};
</script>

<style scoped lang="scss">
// 基础变量
$skeleton-bg: var(--bg-tertiary);
$skeleton-shine: var(--bg-secondary);

// 动画关键帧
@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes skeleton-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@keyframes skeleton-wave {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

// 基础骨架元素样式
%skeleton-base {
  background: $skeleton-bg;
  border-radius: var(--border-radius-small);
  position: relative;
  overflow: hidden;
}

%skeleton-shine {
  background: linear-gradient(
    90deg,
    $skeleton-bg 0%,
    $skeleton-shine 50%,
    $skeleton-bg 100%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

// 卡片容器
.skeleton-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-light);
  transition: all 0.3s ease;
}

// 头部区域
.skeleton-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.skeleton-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.skeleton-avatar {
  @extend %skeleton-base;
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.skeleton-status {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: $skeleton-bg;
  border: 2px solid var(--bg-primary);
}

.skeleton-title-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.skeleton-badge {
  @extend %skeleton-base;
  width: 60px;
  height: 20px;
  border-radius: var(--border-radius-small);
  margin-bottom: var(--spacing-xs);
}

.skeleton-title {
  @extend %skeleton-base;
  height: 20px;
  border-radius: var(--border-radius-small);
}

.skeleton-subtitle {
  @extend %skeleton-base;
  height: 14px;
  border-radius: var(--border-radius-small);
}

.skeleton-meta {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xs);
}

.skeleton-meta-item {
  @extend %skeleton-base;
  width: 50px;
  height: 16px;
  border-radius: var(--border-radius-small);
}

// 内容区域
.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.skeleton-row {
  @extend %skeleton-base;
  border-radius: var(--border-radius-small);
  
  &.skeleton-row-short {
    width: 60% !important;
  }
}

// 网格布局
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: var(--spacing-md);
}

.skeleton-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--bg-secondary);
  border-radius: var(--border-radius-medium);
}

.skeleton-grid-icon {
  @extend %skeleton-base;
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.skeleton-grid-text {
  @extend %skeleton-base;
  width: 60px;
  height: 14px;
}

// 图表布局
.skeleton-chart {
  height: 120px;
  padding: var(--spacing-md) 0;
}

.skeleton-chart-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 100%;
  gap: var(--spacing-md);
}

.skeleton-chart-bar {
  @extend %skeleton-base;
  flex: 1;
  max-width: 40px;
  border-radius: var(--border-radius-small) var(--border-radius-small) 0 0;
  min-height: 20px;
}

// 操作按钮区域
.skeleton-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
  
  &.skeleton-actions-center {
    justify-content: center;
  }
}

.skeleton-button {
  @extend %skeleton-base;
  height: 36px;
  border-radius: var(--border-radius-medium);
  
  &.skeleton-button-primary {
    background: var(--primary-color);
    opacity: 0.3;
  }
}

// 底部区域
.skeleton-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}

.skeleton-footer-item {
  @extend %skeleton-base;
  width: 80px;
  height: 14px;
  
  &.short {
    width: 50px;
  }
}

// 激活状态的微光动画
.skeleton-active {
  .skeleton-avatar,
  .skeleton-status,
  .skeleton-badge,
  .skeleton-title,
  .skeleton-subtitle,
  .skeleton-meta-item,
  .skeleton-row,
  .skeleton-grid-icon,
  .skeleton-grid-text,
  .skeleton-chart-bar,
  .skeleton-button:not(.skeleton-button-primary),
  .skeleton-footer-item {
    @extend %skeleton-shine;
  }
}

// 变体样式
.skeleton-card {
  &.skeleton-list {
    .skeleton-header {
      margin-bottom: var(--spacing-md);
    }
    
    .skeleton-row {
      height: 20px;
    }
  }
  
  &.skeleton-stat {
    text-align: center;
    
    .skeleton-header {
      flex-direction: column;
      align-items: center;
    }
    
    .skeleton-avatar {
      width: 64px;
      height: 64px;
    }
    
    .skeleton-title {
      width: 80px;
      height: 32px;
      margin: 0 auto;
    }
  }
}

// 深色模式适配
.dark,
[data-theme="dark"] {
  .skeleton-card {
    background: var(--bg-secondary);
  }
  
  .skeleton-grid-item {
    background: var(--bg-tertiary);
  }
  
  .skeleton-footer {
    border-color: var(--border-color);
  }
}

// 移动端适配
@media (max-width: 768px) {
  .skeleton-card {
    padding: var(--spacing-md);
  }
  
  .skeleton-avatar {
    width: 40px;
    height: 40px;
  }
  
  .skeleton-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .skeleton-actions {
    flex-wrap: wrap;
  }
}
</style>
