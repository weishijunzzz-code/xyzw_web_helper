<template>
  <div v-if="visible" class="context-menu" :style="menuStyle" @click.stop>
    <div class="menu-content">
      <div
        v-for="(item, index) in items"
        :key="index"
        class="menu-item"
        :class="{
          'is-divider': item.divider,
          'is-disabled': item.disabled,
          'is-danger': item.danger
        }"
        @click="handleClick(item)"
        @mouseenter="hoveredIndex = index"
      >
        <template v-if="!item.divider">
          <n-icon v-if="item.icon" size="16" class="menu-icon">
            <component :is="item.icon" />
          </n-icon>
          <span class="menu-label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  x: {
    type: Number,
    default: 0
  },
  y: {
    type: Number,
    default: 0
  },
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select', 'close'])

const hoveredIndex = ref(-1)

const menuStyle = computed(() => {
  return {
    left: `${props.x}px`,
    top: `${props.y}px`
  }
})

const handleClick = (item) => {
  if (item.disabled || item.divider) return
  emit('select', item)
  emit('close')
}

const handleClickOutside = (e) => {
  if (!e.target.closest('.context-menu')) {
    emit('close')
  }
}

const handleEscape = (e) => {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEscape)
})
</script>

<style scoped lang="scss">
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-primary);
  border-radius: var(--border-radius-medium);
  box-shadow: var(--shadow-heavy);
  min-width: 160px;
  padding: var(--spacing-xs) 0;
  animation: menuAppear 0.15s ease;
}

@keyframes menuAppear {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-sm);
  color: var(--text-primary);

  &:hover:not(.is-disabled):not(.is-divider) {
    background: var(--primary-color-light);
  }

  &.is-divider {
    height: 1px;
    background: var(--border-light);
    margin: var(--spacing-xs) var(--spacing-md);
    padding: 0;
    cursor: default;
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.is-danger {
    color: var(--error-color);

    &:hover {
      background: var(--error-color-light, rgba(239, 68, 68, 0.1));
    }
  }
}

.menu-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.menu-label {
  flex: 1;
}

.menu-shortcut {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-left: var(--spacing-md);
}
</style>
