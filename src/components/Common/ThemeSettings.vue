<template>
  <div class="theme-settings">
    <NPopover trigger="click" placement="bottom" :show-arrow="false">
      <template #trigger>
        <NButton circle size="medium" class="theme-toggle-btn" aria-label="主题设置">
          <template #icon>
            <NIcon v-if="currentTheme === 'dark'">
              <Moon />
            </NIcon>
            <NIcon v-else-if="currentTheme === 'light'">
              <Sunny />
            </NIcon>
            <NIcon v-else>
              <DesktopOutline />
            </NIcon>
          </template>
        </NButton>
      </template>

      <div class="theme-panel">
        <div class="panel-header">
          <h4>主题设置</h4>
        </div>

        <!-- 主题模式选择 -->
        <div class="theme-section">
          <label class="section-label">外观</label>
          <div class="theme-options">
            <div
              v-for="theme in themeOptions"
              :key="theme.value"
              class="theme-option"
              :class="{ active: currentTheme === theme.value }"
              @click="setTheme(theme.value)"
            >
              <div class="theme-preview" :class="theme.value">
                <div class="preview-header"></div>
                <div class="preview-content">
                  <div class="preview-sidebar"></div>
                  <div class="preview-main">
                    <div class="preview-card"></div>
                    <div class="preview-card"></div>
                  </div>
                </div>
              </div>
              <span class="theme-name">{{ theme.label }}</span>
              <NIcon v-if="currentTheme === theme.value" class="check-icon">
                <Checkmark />
              </NIcon>
            </div>
          </div>
        </div>

        <!-- 强调色选择 -->
        <div class="theme-section">
          <label class="section-label">强调色</label>
          <div class="color-options">
            <button
              v-for="color in accentOptions"
              :key="color.value"
              type="button"
              class="accent-swatch"
              :aria-label="color.label"
              :aria-pressed="accent === color.value"
              :style="{ '--swatch-color': color.color }"
              @click="setAccent(color.value)"
              :title="color.label"
            >{{ accent === color.value ? '✓' : '' }}</button>
          </div>
        </div>

        <!-- 字体大小 -->
        <div class="theme-section">
          <label class="section-label">字体大小</label>
          <div class="font-size-slider">
            <span class="size-label small">A</span>
            <NSlider
              v-model:value="fontSizeScale"
              :min="0.875"
              :max="1.25"
              :step="0.125"
              :marks="{ 0.875: '', 1: '', 1.125: '', 1.25: '' }"
              @update:value="updateFontSize"
            />
            <span class="size-label large">A</span>
          </div>
        </div>

        <!-- 紧凑模式 -->
        <div class="theme-section">
          <div class="compact-toggle">
            <span>紧凑模式</span>
            <NSwitch v-model:value="isCompact" @update:value="toggleCompact" />
          </div>
        </div>

        <!-- 动画效果 -->
        <div class="theme-section">
          <div class="compact-toggle">
            <span>动画效果</span>
            <NSwitch v-model:value="animationsEnabled" @update:value="toggleAnimations" />
          </div>
        </div>
      </div>
    </NPopover>
  </div>
</template>

<script setup>
import { Checkmark, DesktopOutline, Moon, Sunny } from '@vicons/ionicons5';
import { NButton, NIcon, NPopover, NSlider, NSwitch } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { useAccent } from '@/composables/useAccent';
import { applyCompactModeClass } from '@/composables/useCompactMode';
import { useTheme } from '@/composables/useTheme';

const { themeMode: currentTheme, setThemeMode: setTheme } = useTheme();
const { accent, accentOptions, setAccent } = useAccent();

// 主题选项
const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

const fontSizeScale = ref(1);
const isCompact = ref(false);
const animationsEnabled = ref(true);

// 从 localStorage 加载设置
onMounted(() => {
  const savedFontSize = Number.parseFloat(localStorage.getItem('theme-font-size') || '1');
  fontSizeScale.value = savedFontSize;
  applyFontSize(savedFontSize);

  const savedCompact = localStorage.getItem('theme-compact') === 'true';
  isCompact.value = savedCompact;
  applyCompactMode(savedCompact);

  const savedAnimations = localStorage.getItem('theme-animations') !== 'false';
  animationsEnabled.value = savedAnimations;
  applyAnimations(savedAnimations);

});

// 更新字体大小
const updateFontSize = (value) => {
  localStorage.setItem('theme-font-size', value.toString());
  applyFontSize(value);
};

// 应用字体大小
const applyFontSize = (scale) => {
  document.documentElement.style.setProperty('--font-size-scale', scale);
  document.documentElement.style.fontSize = `${16 * scale}px`;
};

// 切换紧凑模式
const toggleCompact = (value) => {
  isCompact.value = value;
  localStorage.setItem('theme-compact', value.toString());
  applyCompactMode(value);
};

// 应用紧凑模式：交给共享裁决
// （移动端 ≤768px 会自动启用，不受本偏好关闭的影响）
const applyCompactMode = () => {
  applyCompactModeClass();
};

// 切换动画
const toggleAnimations = (value) => {
  animationsEnabled.value = value;
  localStorage.setItem('theme-animations', value.toString());
  applyAnimations(value);
};

// 应用动画设置
const applyAnimations = (enabled) => {
  if (enabled) {
    document.documentElement.classList.remove('reduce-motion');
  } else {
    document.documentElement.classList.add('reduce-motion');
  }
};

</script>

<style scoped lang="scss">
.theme-settings {
  display: inline-flex;
}

.theme-toggle-btn {
  transition: all var(--duration-normal) var(--ease-out);

  &:hover {
    transform: translateY(-1px);
  }
}

.theme-panel {
  .color-options { gap: 6px; }
  width: 280px;
  padding: var(--space-4);

  .panel-header {
    margin-bottom: var(--space-4);

    h4 {
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }
  }
}

.theme-section {
  margin-bottom: var(--space-5);

  &:last-child {
    margin-bottom: 0;
  }

  .section-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }
}

// 主题选项
.theme-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.theme-option {
  position: relative;
  cursor: pointer;
  border-radius: var(--radius-lg);
  padding: var(--space-2);
  border: 2px solid transparent;
  transition: all var(--duration-fast) var(--ease-out);

  &:hover {
    background: var(--color-bg-secondary);
  }

  &.active {
    border-color: var(--primary-color);
    background: var(--primary-color-light);
  }

  .theme-name {
    display: block;
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin-top: var(--space-2);
  }

  .check-icon {
    position: absolute;
    top: 4px;
    right: 4px;
    color: var(--primary-color);
    font-size: 12px;
  }
}

// 主题预览
.theme-preview {
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border-default);

  .preview-header {
    height: 20%;
    background: var(--color-bg-tertiary);
  }

  .preview-content {
    display: flex;
    height: 80%;

    .preview-sidebar {
      width: 25%;
      background: var(--color-bg-secondary);
    }

    .preview-main {
      flex: 1;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .preview-card {
        flex: 1;
        background: var(--color-bg-tertiary);
        border-radius: 2px;
      }
    }
  }

  // 浅色主题预览
  &.light {
    background: #ffffff;

    .preview-header {
      background: #f3f4f6;
    }

    .preview-sidebar {
      background: #f9fafb;
    }

    .preview-card {
      background: #f3f4f6;
    }
  }

  // 深色主题预览
  &.dark {
    background: #1f2937;

    .preview-header {
      background: #111827;
    }

    .preview-sidebar {
      background: #374151;
    }

    .preview-card {
      background: #374151;
    }
  }

  // 跟随系统预览（渐变）
  &.system {
    background: linear-gradient(135deg, #ffffff 50%, #1f2937 50%);

    .preview-header {
      background: linear-gradient(135deg, #f3f4f6 50%, #111827 50%);
    }

    .preview-sidebar {
      background: linear-gradient(135deg, #f9fafb 50%, #374151 50%);
    }

    .preview-card {
      background: linear-gradient(135deg, #f3f4f6 50%, #374151 50%);
    }
  }
}

// 字体大小滑块
.font-size-slider {
  display: flex;
  align-items: center;
  gap: var(--space-3);

  .size-label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);

    &.small {
      font-size: 12px;
    }

    &.large {
      font-size: 16px;
    }
  }

  .n-slider {
    flex: 1;
  }
}

// 紧凑模式切换
.compact-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;

  span {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }
}
</style>
