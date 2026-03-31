<template>
  <div class="chunk-load-error">
    <n-result
      status="error"
      title="页面加载失败"
      description="可能是由于应用更新导致，请刷新页面重试"
    >
      <template #icon>
        <n-icon size="80" :depth="3">
          <Refresh />
        </n-icon>
      </template>
      <template #footer>
        <n-space>
          <n-button type="primary" @click="handleRefresh">
            <template #icon>
              <n-icon><RefreshOutline /></n-icon>
            </template>
            刷新页面
          </n-button>
          <n-button @click="handleGoHome">
            返回首页
          </n-button>
        </n-space>
      </template>
    </n-result>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { RefreshOutline, Refresh } from '@vicons/ionicons5'

const router = useRouter()

const handleRefresh = () => {
  // 清除缓存并刷新
  window.location.reload(true)
}

const handleGoHome = () => {
  router.push('/')
}
</script>

<style scoped lang="scss">
.chunk-load-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}
</style>
