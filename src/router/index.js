import { createRouter, createWebHistory } from "vue-router";
import * as autoRoutes from "vue-router/auto-routes";
import { useTokenStore } from "@/stores/tokenStore";
import { isNowInLegionWarTime } from "@/utils/clubBattleUtils";

// 安全的动态导入包装器，处理 chunk 加载失败
const safeImport = (importFn) => {
  return () => importFn().catch((error) => {
    console.error('Chunk load error:', error)
    // 如果是 chunk 加载错误，显示错误页面
    if (error.message?.includes('Failed to fetch dynamically imported module')) {
      return import('@/components/Error/ChunkLoadError.vue')
    }
    throw error
  })
}

const generatedRoutes = autoRoutes.routes ?? [];

const my_routes = [
  {
    path: "/",
    name: "Home",
    component: safeImport(() => import("@/views/Home.vue")),
    meta: {
      title: "首页",
      requiresToken: false,
    },
  },
  {
    path: "/game",
    name: "GamePlayer",
    component: () => import("@/views/GamePlayer.vue"),
    meta: {
      title: "游戏",
      requiresToken: true,
    },
    props: (route) => ({
      bin_id: route.query.bin_id,
    }),
  },
  {
    path: "/multi-game",
    name: "GameMultiPlayer",
    component: () => import("@/views/GameMultiPlayer.vue"),
    meta: {
      title: "批量游戏",
      requiresToken: true,
    },
  },
  {
    name: 'DefaultLayout',
    path: '/admin',
    component: safeImport(() => import('@/layout/DefaultLayout.vue')),
    children: [
      // Token 管理纳入控制台骨架（绝对子路径，URL 仍为 /tokens）
      {
        path: '/tokens',
        name: 'TokenImport',
        component: safeImport(() => import('@/views/TokenImport/TokenImport.vue')),
        meta: {
          title: 'Token管理',
          requiresToken: false
        },
        props: route => ({
          token: route.query.token,
          name: route.query.name,
          server: route.query.server,
          wsUrl: route.query.wsUrl,
          api: route.query.api,
          auto: route.query.auto === 'true'
        })
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: safeImport(() => import('@/views/Dashboard.vue')),
        meta: {
          title: "控制台",
          requiresToken: true,
        },
      },
      {
        path: 'game-features',
        name: 'GameFeatures',
        component: safeImport(() => import('@/views/GameFeatures.vue')),
        meta: {
          title: "游戏功能",
          requiresToken: true,
        },
      },
      {
        path: 'message-test',
        name: 'MessageTest',
        component: safeImport(() => import('@/components/Test/MessageTester.vue')),
        meta: {
          title: "消息测试",
          requiresToken: true,
        },
      },
      {
        path: 'legion-war',
        name: 'LegionWar',
        component: safeImport(() => import('@/views/LegionWar.vue')),
        meta: {
          title: "实时盐场",
          requiresToken: true,
        },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: safeImport(() => import('@/views/Profile.vue')),
        meta: {
          title: "个人设置",
          requiresToken: true,
        },
      },
      {
        path: 'daily-tasks',
        name: 'DailyTasks',
        component: safeImport(() => import('@/views/DailyTasks.vue')),
        meta: {
          title: "日常任务",
          requiresToken: true,
        },
      },
      {
        path: 'batch-daily-tasks',
        name: 'BatchDailyTasks',
        component: safeImport(() => import('@/views/BatchDailyTasks.vue')),
        meta: {
          title: "批量日常",
          requiresToken: true,
        },
      },
      {
        path: 'task-scheduler',
        name: 'TaskScheduler',
        component: safeImport(() => import('@/views/TaskScheduler/index.vue')),
        meta: {
          title: '定时任务监控',
          requiresToken: true
        }
      },
      {
        path: 'PushingLevels',
        name: 'PushingLevels',
        component: safeImport(() => import('@/views/PushingLevels.vue')),
        meta: {
          title: "主线推关",
          requiresToken: true,
        },
      },
      {
        path: 'cloud-tasks',
        name: 'CloudTasks',
        component: safeImport(() => import('@/views/CloudTasks.vue')),
        meta: {
          title: '云端任务',
          requiresCloudAuth: true
        }
      },
      // 增加自动路由引用
      ...generatedRoutes,
    ],
  },
  {
    path: '/websocket-test',
    name: 'WebSocketTest',
    component: safeImport(() => import('@/components/Test/WebSocketTester.vue')),
    meta: {
      title: "WebSocket测试",
      requiresToken: true,
    },
  },
  // 移动端路由配置 - 使用MobileAdapter包装PC端组件
  {
    path: '/mobile',
    component: safeImport(() => import('@/layout/MobileLayout.vue')),
    redirect: '/mobile/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'MobileDashboard',
        component: safeImport(() => import('@/views/Dashboard.vue')),
        meta: {
          title: '首页',
          requiresToken: true
        }
      },
      {
        path: 'tokens',
        name: 'MobileTokens',
        component: safeImport(() => import('@/views/mobile/MobileTokens.vue')),
        meta: {
          title: 'Token管理',
          requiresToken: false
        }
      },
      {
        path: 'game-features',
        name: 'MobileGameFeatures',
        component: safeImport(() => import('@/views/mobile/MobileGameFeatures.vue')),
        meta: {
          title: '游戏功能',
          requiresToken: true
        }
      },
      {
        path: 'daily-tasks',
        name: 'MobileDailyTasks',
        component: safeImport(() => import('@/views/DailyTasks.vue')),
        meta: {
          title: '日常任务',
          requiresToken: true
        }
      },
      {
        path: 'batch-daily-tasks',
        name: 'MobileBatchDailyTasks',
        component: safeImport(() => import('@/views/mobile/features/MobileBatchDailyTasks.vue')),
        meta: {
          title: '批量日常',
          requiresToken: true
        }
      },
      {
        path: 'task-scheduler',
        name: 'MobileTaskScheduler',
        component: safeImport(() => import('@/views/TaskScheduler/index.vue')),
        meta: {
          title: '定时任务',
          requiresToken: true
        }
      },
      {
        path: 'pushing-levels',
        name: 'MobilePushingLevels',
        component: safeImport(() => import('@/views/mobile/features/MobilePushingLevels.vue')),
        meta: {
          title: '主线推关',
          requiresToken: true
        }
      },
      {
        path: 'legion-war',
        name: 'MobileLegionWar',
        component: safeImport(() => import('@/views/LegionWar.vue')),
        meta: {
          title: '实时盐场',
          requiresToken: true
        }
      },
      {
        // 云端任务已并入定时任务页的分段切换（?tab=cloud），旧路径重定向兜底
        path: 'cloud-tasks',
        name: 'MobileCloudTasks',
        redirect: (to) => ({
          path: '/mobile/task-scheduler',
          query: { ...to.query, tab: 'cloud' }
        })
      },
      {
        path: 'profile',
        name: 'MobileProfile',
        component: safeImport(() => import('@/views/Profile.vue')),
        meta: {
          title: '个人设置',
          requiresToken: true
        }
      }
    ]
  },
  // 兼容旧路由，重定向到新的token管理页面
  {
    path: "/login",
    redirect: "/tokens",
  },
  {
    path: "/register",
    redirect: "/tokens",
  },
  {
    path: "/game-roles",
    redirect: "/tokens",
  },
  // 增加自动路由引用
  ...generatedRoutes,
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("@/views/NotFound.vue"),
    meta: {
      title: "页面不存在",
    },
  },
];

// Cloudflare Pages 部署支持
// 使用根路径，适配任何部署域名
const router = createRouter({
  history: createWebHistory(),
  routes: my_routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

// 路由过渡动画配置
router.afterEach((to, from) => {
  // 根据路由深度决定过渡方向
  const toDepth = to.path.split('/').length
  const fromDepth = from.path.split('/').length

  if (toDepth > fromDepth) {
    to.meta.transition = 'slide-left'
  } else if (toDepth < fromDepth) {
    to.meta.transition = 'slide-right'
  } else {
    to.meta.transition = 'fade-slide'
  }
})



// 检测是否为移动端设备
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// PC端路由到移动端路由的映射
const pcToMobileRouteMap = {
  'Dashboard': '/mobile/dashboard',
  'GameFeatures': '/mobile/game-features',
  'DailyTasks': '/mobile/daily-tasks',
  'BatchDailyTasks': '/mobile/batch-daily-tasks',
  'TaskScheduler': '/mobile/task-scheduler',
  'PushingLevels': '/mobile/pushing-levels',
  'LegionWar': '/mobile/legion-war',
  'CloudTasks': '/mobile/cloud-tasks',
  'Profile': '/mobile/profile',
  'TokenImport': '/mobile/tokens'
}

// 导航守卫
router.beforeEach((to, from, next) => {
  const tokenStore = useTokenStore();

  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - XYZW 游戏管理系统` : 'XYZW 游戏管理系统'

  // 移动端路由检查
  if (to.path.startsWith('/mobile')) {
    // 移动端盐场时间检查
    if (to.name === 'MobileLegionWar' && !isNowInLegionWarTime()) {
      next('/mobile/dashboard')
      return
    }
    // 移动端Token检查
    if (to.meta.requiresToken && !tokenStore.hasTokens) {
      next('/mobile/tokens')
      return
    }
    next()
    return
  }

  // 移动端设备访问PC端路由时，自动重定向到移动端对应路由
  if (isMobileDevice() && to.path.startsWith('/admin')) {
    const mobileRoute = pcToMobileRouteMap[to.name]
    if (mobileRoute) {
      next(mobileRoute)
      return
    }
  }

  // PC端盐场时间检查
  if (to.name === "LegionWar" && !isNowInLegionWarTime()) {
    next('/admin/dashboard')
    return
  }

  // 检查是否需要Token
  if (to.meta.requiresToken && !tokenStore.hasTokens) {
    next('/tokens')
  } else if (to.path === '/' && tokenStore.hasTokens) {
    // 首页重定向逻辑 - 根据设备类型跳转
    if (isMobileDevice()) {
      next('/mobile/dashboard')
    } else {
      if (tokenStore.selectedToken) {
        next('/admin/dashboard')
      } else {
        next('/tokens')
      }
    }
  } else {
    next();
  }
});

export default router;
