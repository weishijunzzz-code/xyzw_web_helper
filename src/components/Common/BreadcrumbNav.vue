<template>
  <nav class="breadcrumb-nav" v-if="showBreadcrumb">
    <n-breadcrumb>
      <n-breadcrumb-item @click="router.push('/admin/dashboard')">
        <n-icon :component="HomeOutline" />
        <span class="breadcrumb-text">首页</span>
      </n-breadcrumb-item>
      <n-breadcrumb-item
        v-for="(item, index) in breadcrumbItems"
        :key="index"
        :clickable="item.clickable !== false"
        @click="item.clickable !== false && item.path && router.push(item.path)"
      >
        <n-icon v-if="item.icon" :component="item.icon" />
        <span class="breadcrumb-text">{{ item.title }}</span>
      </n-breadcrumb-item>
    </n-breadcrumb>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HomeOutline, Cube, TimerOutline, Layers, Person, Settings, Mail, LockOpen } from '@vicons/ionicons5'

const route = useRoute()
const router = useRouter()

interface BreadcrumbItem {
  title: string
  path?: string
  icon?: any
  clickable?: boolean
}

// 路由映射表
const routeMap: Record<string, BreadcrumbItem> = {
  'Dashboard': { title: '控制台', icon: HomeOutline },
  'GameFeatures': { title: '游戏功能', icon: Cube },
  'TokenImport': { title: 'Token管理', icon: Person },
  'BatchDailyTasks': { title: '批量日常', icon: Layers },
  'TaskScheduler': { title: '定时任务', icon: TimerOutline },
  'MessageTest': { title: '消息测试', icon: Mail },
  'LegionWar': { title: '实时盐场', icon: LockOpen },
  'Profile': { title: '个人设置', icon: Settings },
  'DailyTasks': { title: '日常任务', icon: Layers },
}

// 是否显示面包屑
const showBreadcrumb = computed(() => {
  // 首页不显示面包屑
  return route.name !== 'Dashboard' && route.name !== 'Home'
})

// 生成面包屑项
const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = []
  const currentRoute = routeMap[route.name as string]
  
  if (currentRoute) {
    items.push({
      ...currentRoute,
      path: route.path,
      clickable: false // 当前页面不可点击
    })
  }
  
  return items
})
</script>

<style scoped lang="scss">
.breadcrumb-nav {
  padding: 12px 24px;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border-light);
  
  :deep(.n-breadcrumb) {
    font-size: 14px;
  }
  
  :deep(.n-breadcrumb-item) {
    cursor: pointer;
    transition: color 0.2s ease;
    
    &:hover {
      color: var(--color-primary);
    }
    
    &:last-child {
      color: var(--color-text-secondary);
      cursor: default;
      
      &:hover {
        color: var(--color-text-secondary);
      }
    }
  }
  
  .breadcrumb-text {
    margin-left: 4px;
  }
}

// 深色主题适配
.dark .breadcrumb-nav {
  background: var(--color-bg-primary);
  border-bottom-color: var(--color-border-dark);
}

// 移动端适配
@media (max-width: 768px) {
  .breadcrumb-nav {
    padding: 8px 16px;
    font-size: 12px;
    
    :deep(.n-breadcrumb) {
      font-size: 12px;
    }
  }
}
</style>
