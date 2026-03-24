<template>
  <div class="theme-settings">
    <n-popover trigger="click" placement="bottom" :show-arrow="false">
      <template #trigger>
        <n-button circle size="medium" class="theme-toggle-btn">
          <template #icon>
            <n-icon v-if="currentTheme === 'dark'">
              <Moon />
            </n-icon>
            <n-icon v-else-if="currentTheme === 'light'">
              <Sunny />
            </n-icon>
            <n-icon v-else>
              <DesktopOutline />
            </n-icon>
          </template>
        </n-button>
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
              <n-icon v-if="currentTheme === theme.value" class="check-icon">
                <Checkmark />
              </n-icon>
            </div>
          </div>
        </div>

        <!-- 强调色选择 -->
        <div class="theme-section">
          <label class="section-label">强调色</label>
          <div class="color-options">
            <div
              v-for="color in accentColors"
              :key="color.value"
              class="color-option"
              :class="{ active: accentColor === color.value }"
              :style="{ background: color.color }"
              @click="setAccentColor(color.value)"
              :title="color.label"
            >
              <n-icon v-if="accentColor === color.value">
                <Checkmark />
              </n-icon>
            </div>
          </div>
        </div>

        <!-- 字体大小 -->
        <div class="theme-section">
          <label class="section-label">字体大小</label>
          <div class="font-size-slider">
            <span class="size-label small">A</span>
            <n-slider
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
            <n-switch v-model:value="isCompact" @update:value="toggleCompact" />
          </div>
        </div>

        <!-- 动画效果 -->
        <div class="theme-section">
          <div class="compact-toggle">
            <span>动画效果</span>
            <n-switch v-model:value="animationsEnabled" @update:value="toggleAnimations" />
          </div>
        </div>
      </div>
    </n-popover>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Moon, Sunny, DesktopOutline, Checkmark } from '@vicons/ionicons5';
import { NButton, NIcon, NPopover, NSwitch, NSlider } from 'naive-ui';
import { useTheme } from '@/composables/useTheme';

const { isDark, setDarkTheme, setLightTheme, getCurrentTheme } = useTheme();

// 主题选项
const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

// 强调色选项
const accentColors = [
  { value: 'blue', label: '蓝色', color: '#3b82f6' },
  { value: 'purple', label: '紫色', color: '#8b5cf6' },
  { value: 'green', label: '绿色', color: '#10b981' },
  { value: 'orange', label: '橙色', color: '#f59e0b' },
  { value: 'pink', label: '粉色', color: '#ec4899' },
  { value: 'red', label: '红色', color: '#ef4444' },
];

// 当前主题
const currentTheme = ref('system');
const accentColor = ref('blue');
const fontSizeScale = ref(1);
const isCompact = ref(false);
const animationsEnabled = ref(true);

// 从 localStorage 加载设置
onMounted(() => {
  const savedTheme = localStorage.getItem('theme-mode') || 'system';
  currentTheme.value = savedTheme;

  const savedAccent = localStorage.getItem('theme-accent') || 'blue';
  accentColor.value = savedAccent;
  applyAccentColor(savedAccent);

  const savedFontSize = parseFloat(localStorage.getItem('theme-font-size') || '1');
  fontSizeScale.value = savedFontSize;
  applyFontSize(savedFontSize);

  const savedCompact = localStorage.getItem('theme-compact') === 'true';
  isCompact.value = savedCompact;
  applyCompactMode(savedCompact);

  const savedAnimations = localStorage.getItem('theme-animations') !== 'false';
  animationsEnabled.value = savedAnimations;
  applyAnimations(savedAnimations);

  // 应用主题
  applyTheme(savedTheme);
});

// 设置主题
const setTheme = (theme) => {
  currentTheme.value = theme;
  localStorage.setItem('theme-mode', theme);
  applyTheme(theme);
};

// 应用主题
const applyTheme = (theme) => {
  if (theme === 'dark') {
    setDarkTheme();
  } else if (theme === 'light') {
    setLightTheme();
  } else {
    // 跟随系统
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      setDarkTheme();
    } else {
      setLightTheme();
    }
  }
};

// 设置强调色
const setAccentColor = (color) => {
  accentColor.value = color;
  localStorage.setItem('theme-accent', color);
  applyAccentColor(color);
};

// 应用强调色
const applyAccentColor = (color) => {
  const colorMap = {
    blue: { primary: '#3b82f6', primaryHover: '#2563eb' },
    purple: { primary: '#8b5cf6', primaryHover: '#7c3aed' },
    green: { primary: '#10b981', primaryHover: '#059669' },
    orange: { primary: '#f59e0b', primaryHover: '#d97706' },
    pink: { primary: '#ec4899', primaryHover: '#db2777' },
    red: { primary: '#ef4444', primaryHover: '#dc2626' },
  };

  const colors = colorMap[color];
  if (colors) {
    document.documentElement.style.setProperty('--color-primary-500', colors.primary);
    document.documentElement.style.setProperty('--color-primary-600', colors.primaryHover);
  }
};

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

// 应用紧凑模式
const applyCompactMode = (isCompact) => {
  if (isCompact) {
    document.documentElement.classList.add('compact-mode');
  } else {
    document.documentElement.classList.remove('compact-mode');
  }
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

// 监听系统主题变化
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentTheme.value === 'system') {
      if (e.matches) {
        setDarkTheme();
      } else {
        setLightTheme();
      }
    }
  });
}
</script>

<style scoped lang="scss">
.theme-settings {
  display: inline-flex;
}

.theme-toggle-btn {
  transition: all var(--duration-normal) var(--ease-out);

  &:hover {
    transform: scale(1.1) rotate(15deg);
  }
}

.theme-panel {
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
    border-color: var(--color-primary-500);
    background: var(--color-primary-50);
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
    color: var(--color-primary-500);
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

// 颜色选项
.color-options {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
  border: 2px solid transparent;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: var(--color-text-primary);
    transform: scale(1.15);
  }

  .n-icon {
    color: white;
    font-size: 16px;
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
      font-size: 18px;
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
