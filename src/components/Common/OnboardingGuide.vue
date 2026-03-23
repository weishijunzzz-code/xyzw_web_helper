  <template>
  <div v-if="showGuide" class="onboarding-guide">
    <!-- 遮罩层 -->
    <div class="guide-overlay" @click="skipGuide"></div>

    <!-- 高亮区域 -->
    <div
      v-if="currentStep"
      class="guide-highlight"
      :style="highlightStyle"
    >
      <div class="highlight-box"></div>
    </div>

    <!-- 提示卡片 -->
    <div
      v-if="currentStep"
      class="guide-card"
      :style="cardStyle"
    >
      <div class="card-header">
        <span class="step-indicator">{{ currentStepIndex + 1 }} / {{ steps.length }}</span>
        <button class="skip-btn" @click="skipGuide">跳过</button>
      </div>

      <div class="card-content">
        <h3 class="step-title">{{ currentStep.title }}</h3>
        <p class="step-description">{{ currentStep.description }}</p>

        <div v-if="currentStep.image" class="step-image">
          <img :src="currentStep.image" :alt="currentStep.title" />
        </div>
      </div>

      <div class="card-footer">
        <n-button
          v-if="currentStepIndex > 0"
          text
          @click="prevStep"
        >
          上一步
        </n-button>

        <div class="step-dots">
          <span
            v-for="(step, index) in steps"
            :key="index"
            class="dot"
            :class="{ active: index === currentStepIndex }"
          ></span>
        </div>

        <n-button
          type="primary"
          @click="nextStep"
        >
          {{ isLastStep ? '完成' : '下一步' }}
        </n-button>
      </div>
    </div>

    <!-- 欢迎弹窗（第一步） -->
    <n-modal
      v-if="currentStepIndex === 0 && showGuide"
      :show="true"
      preset="card"
      style="width: 400px"
      :closable="false"
      class="welcome-modal"
    >
      <div class="welcome-content">
        <div class="welcome-icon">
          <n-icon size="64" color="#667eea">
            <Rocket />
          </n-icon>
        </div>
        <h2 class="welcome-title">欢迎使用 XYZW 助手</h2>
        <p class="welcome-text">
          让我们花一分钟时间，快速了解主要功能和使用方法。
        </p>
        <n-button type="primary" size="large" block @click="startTour">
          开始引导
        </n-button>
        <n-button text block @click="skipGuide" style="margin-top: 12px;">
          跳过，我自己探索
        </n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { Rocket } from '@vicons/ionicons5'

const props = defineProps({
  steps: {
    type: Array,
    default: () => [
      {
        target: '.nav-menu',
        title: '导航菜单',
        description: '这里是主要功能入口，包括控制台、游戏功能、Token管理等。',
        position: 'bottom'
      },
      {
        target: '.token-selector',
        title: 'Token 选择器',
        description: '点击这里可以快速切换不同的游戏账号，查看在线状态。',
        position: 'bottom'
      },
      {
        target: '.theme-toggle',
        title: '主题切换',
        description: '支持浅色和深色模式，根据您的喜好自由切换。',
        position: 'bottom'
      },
      {
        target: '.game-features',
        title: '游戏功能',
        description: '宝箱助手、钓鱼助手、梦境助手等自动化功能都在这里。',
        position: 'right'
      }
    ]
  },
  storageKey: {
    type: String,
    default: 'xyzw_onboarding_completed'
  }
})

const emit = defineEmits(['complete', 'skip'])

const showGuide = ref(false)
const currentStepIndex = ref(0)
const highlightRect = ref(null)

// 是否显示欢迎弹窗
const showWelcome = computed(() => currentStepIndex.value === 0)

// 当前步骤
const currentStep = computed(() => props.steps[currentStepIndex.value])

// 是否是最后一步
const isLastStep = computed(() => currentStepIndex.value === props.steps.length - 1)

// 高亮区域样式
const highlightStyle = computed(() => {
  if (!highlightRect.value) return {}
  return {
    top: `${highlightRect.value.top - 8}px`,
    left: `${highlightRect.value.left - 8}px`,
    width: `${highlightRect.value.width + 16}px`,
    height: `${highlightRect.value.height + 16}px`
  }
})

// 提示卡片位置
const cardStyle = computed(() => {
  if (!highlightRect.value || !currentStep.value) return {}

  const rect = highlightRect.value
  const position = currentStep.value.position || 'bottom'
  const cardWidth = 320
  const cardHeight = 200

  let top, left

  switch (position) {
    case 'top':
      top = rect.top - cardHeight - 16
      left = rect.left + (rect.width - cardWidth) / 2
      break
    case 'bottom':
      top = rect.bottom + 16
      left = rect.left + (rect.width - cardWidth) / 2
      break
    case 'left':
      top = rect.top + (rect.height - cardHeight) / 2
      left = rect.left - cardWidth - 16
      break
    case 'right':
      top = rect.top + (rect.height - cardHeight) / 2
      left = rect.right + 16
      break
    default:
      top = rect.bottom + 16
      left = rect.left
  }

  // 边界检查
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  if (left < 16) left = 16
  if (left + cardWidth > viewportWidth - 16) left = viewportWidth - cardWidth - 16
  if (top < 16) top = 16
  if (top + cardHeight > viewportHeight - 16) top = viewportHeight - cardHeight - 16

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${cardWidth}px`
  }
})

// 更新高亮区域
const updateHighlight = async () => {
  if (!currentStep.value?.target) {
    highlightRect.value = null
    return
  }

  await nextTick()

  const element = document.querySelector(currentStep.value.target)
  if (element) {
    highlightRect.value = element.getBoundingClientRect()

    // 滚动到元素
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    })
  }
}

// 开始引导
const startTour = () => {
  currentStepIndex.value = 1
  updateHighlight()
}

// 下一步
const nextStep = () => {
  if (isLastStep.value) {
    completeGuide()
  } else {
    currentStepIndex.value++
    updateHighlight()
  }
}

// 上一步
const prevStep = () => {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
    updateHighlight()
  }
}

// 跳过引导
const skipGuide = () => {
  showGuide.value = false
  localStorage.setItem(props.storageKey, 'skipped')
  emit('skip')
}

// 完成引导
const completeGuide = () => {
  showGuide.value = false
  localStorage.setItem(props.storageKey, 'completed')
  emit('complete')
}

// 检查是否需要显示引导
onMounted(() => {
  const status = localStorage.getItem(props.storageKey)
  if (!status || status === 'skipped') {
    // 延迟显示，等待页面渲染完成
    setTimeout(() => {
      showGuide.value = true
    }, 1000)
  }
})

// 暴露方法
defineExpose({
  start: () => {
    showGuide.value = true
    currentStepIndex.value = 0
  },
  restart: () => {
    localStorage.removeItem(props.storageKey)
    showGuide.value = true
    currentStepIndex.value = 0
  }
})
</script>

<style scoped lang="scss">
.onboarding-guide {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  pointer-events: none;
}

.guide-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: auto;
}

.guide-highlight {
  position: absolute;
  border-radius: var(--border-radius-large);
  pointer-events: none;
  z-index: 1;

  .highlight-box {
    width: 100%;
    height: 100%;
    border-radius: var(--border-radius-large);
    box-shadow: 0 0 0 4px var(--primary-color), 0 0 20px rgba(102, 126, 234, 0.5);
    animation: pulse 2s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 4px var(--primary-color), 0 0 20px rgba(102, 126, 234, 0.5);
  }
  50% {
    box-shadow: 0 0 0 4px var(--primary-color), 0 0 40px rgba(102, 126, 234, 0.8);
  }
}

.guide-card {
  position: absolute;
  background: var(--bg-primary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-heavy);
  pointer-events: auto;
  z-index: 2;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);

    .step-indicator {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      font-weight: var(--font-weight-medium);
    }

    .skip-btn {
      background: none;
      border: none;
      color: var(--text-tertiary);
      font-size: var(--font-size-sm);
      cursor: pointer;
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--border-radius-small);
      transition: all var(--transition-fast);

      &:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
      }
    }
  }

  .card-content {
    .step-title {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
      margin: 0 0 var(--spacing-sm);
    }

    .step-description {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      line-height: 1.6;
      margin: 0;
    }

    .step-image {
      margin-top: var(--spacing-md);
      border-radius: var(--border-radius-medium);
      overflow: hidden;

      img {
        width: 100%;
        height: auto;
        display: block;
      }
    }
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--spacing-lg);

    .step-dots {
      display: flex;
      gap: var(--spacing-xs);

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--border-light);
        transition: all var(--transition-fast);

        &.active {
          background: var(--primary-color);
          transform: scale(1.2);
        }
      }
    }
  }
}

.welcome-modal {
  :deep(.n-card__content) {
    padding: var(--spacing-xl);
  }
}

.welcome-content {
  text-align: center;

  .welcome-icon {
    margin-bottom: var(--spacing-lg);
  }

  .welcome-title {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-sm);
  }

  .welcome-text {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xl);
    line-height: 1.6;
  }
}
</style>
