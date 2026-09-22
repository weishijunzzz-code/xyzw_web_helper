<template>
  <div class="mobile-game-features">
    <!-- 快速入口区 -->
    <div class="quick-entries">
      <div class="quick-entry-card" @click="goToPushingLevels">
        <div class="entry-icon">⚔️</div>
        <div class="entry-info">
          <div class="entry-title">主线推关</div>
          <div class="entry-desc">批量自动推图</div>
        </div>
        <n-icon size="18" class="entry-arrow"><ChevronForward /></n-icon>
      </div>
      <div class="quick-entry-card apex" @click="goToApex">
        <div class="entry-icon">🐉</div>
        <div class="entry-info">
          <div class="entry-title">逐鹿盐山</div>
          <div class="entry-desc">Apex 竞速挑战 · 竞猜助威</div>
        </div>
        <n-icon size="18" class="entry-arrow"><ChevronForward /></n-icon>
      </div>
    </div>

    <MobileAdapter :pc-component="GameFeatures" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import MobileAdapter from '@/components/MobileAdapter.vue'
import GameFeatures from '@/views/GameFeatures.vue'
import { ChevronForward } from '@vicons/ionicons5'

const router = useRouter()

const goToPushingLevels = () => {
  router.push('/mobile/pushing-levels')
}

// 逐鹿盐山：移动端首页（Dashboard 内 GameStatus 的逐鹿盐山标签页）
const goToApex = () => {
  router.push('/mobile/dashboard')
}
</script>

<style scoped lang="scss">
.mobile-game-features {
  display: flex;
  flex-direction: column;
}

.quick-entries {
  padding: 12px 16px;
  background: var(--bg-secondary);
}

.quick-entry-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  color: white;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
  }

  &.apex {
    background: linear-gradient(135deg, #f6b93b 0%, #e58e26 55%, #d63031 100%);
    box-shadow: 0 4px 12px rgba(230, 126, 34, 0.35);

    &:active {
      box-shadow: 0 2px 8px rgba(230, 126, 34, 0.25);
    }
  }
}

.entry-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.entry-info {
  flex: 1;
  min-width: 0;
}

.entry-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 2px;
}

.entry-desc {
  font-size: 12px;
  opacity: 0.85;
}

.entry-arrow {
  flex-shrink: 0;
  opacity: 0.8;
}
</style>
