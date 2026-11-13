<template>
  <div class="home-page">
    <!-- 导航栏 -->
    <nav class="home-navbar">
      <div class="home-container">
        <div class="home-nav-content">
          <div class="home-nav-brand">
            <img
              src="/icons/xiaoyugan.png"
              alt="XYZW"
              class="home-brand-logo"
            />
            <span class="home-brand-text">XYZW 游戏管理系统</span>
          </div>

          <div class="home-mobile-menu-button">
            <n-button
              text
              aria-label="打开导航菜单"
              :aria-expanded="isMobileMenuOpen"
              @click="isMobileMenuOpen = true"
            >
              <n-icon>
                <Menu />
              </n-icon>
            </n-button>
          </div>

          <div class="home-nav-actions">
            <template v-if="!authStore.isAuthenticated">
              <n-button
                text
                type="primary"
                size="large"
                @click="router.push('/tokens')"
                >管理账号</n-button
              >
              <n-button
                type="primary"
                size="large"
                @click="router.push('/admin/dashboard')"
                >进入控制台</n-button
              >
            </template>
            <template v-else>
              <n-button
                type="primary"
                size="large"
                @click="router.push('/admin/dashboard')"
              >
                进入控制台
              </n-button>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <n-drawer
      v-model:show="isMobileMenuOpen"
      placement="left"
      style="width: 260px"
    >
      <div class="home-drawer-menu">
        <router-link
          to="/"
          class="home-drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Ribbon />
          </n-icon>
          <span>首页</span>
        </router-link>
        <router-link
          to="/admin/dashboard"
          class="home-drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Settings />
          </n-icon>
          <span>控制台</span>
        </router-link>
        <router-link
          to="/admin/game-features"
          class="home-drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Cube />
          </n-icon>
          <span>游戏功能</span>
        </router-link>
        <router-link
          to="/tokens"
          class="home-drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <PersonCircle />
          </n-icon>
          <span>Token管理</span>
        </router-link>
        <router-link
          to="/changelog"
          class="home-drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Ribbon />
          </n-icon>
          <span>更新日志</span>
        </router-link>
        <div class="home-drawer-actions">
          <n-button
            type="primary"
            block
            @click="
              router.push('/tokens');
              isMobileMenuOpen = false;
            "
            >管理账号</n-button
          >
          <n-button
            type="primary"
            block
            @click="
              router.push('/admin/dashboard');
              isMobileMenuOpen = false;
            "
            >进入控制台</n-button
          >
        </div>
      </div>
    </n-drawer>

    <!-- 主要内容 -->
    <main class="home-main-content">
      <!-- 英雄区域 -->
      <section class="home-hero-section">
        <div class="home-container">
          <div class="home-hero-content">
            <div class="home-hero-text">
              <h1 class="home-hero-title">账号与日常任务，集中管理</h1>
              <p class="home-hero-subtitle">
                管理多个游戏账号，安排日常任务，查看角色状态。
              </p>
              <div class="home-hero-actions">
                <n-button
                  type="primary"
                  size="large"
                  class="home-hero-button"
                  @click="router.push('/tokens')"
                >
                  管理账号
                </n-button>
                <n-button
                  text
                  type="primary"
                  size="large"
                  class="home-hero-button"
                  @click="scrollToFeatures"
                >
                  查看功能
                </n-button>
              </div>
            </div>

            <div class="home-hero-visual">
              <div class="home-feature-cards">
                <div
                  v-for="card in featureCards"
                  :key="card.id"
                  class="home-feature-card"
                >
                  <div class="home-card-icon">
                    <component :is="card.icon" />
                  </div>
                  <div class="home-card-content">
                    <h3>{{ card.title }}</h3>
                    <p>{{ card.description }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 功能特性 -->
      <section ref="featuresSection" class="home-features-section">
        <div class="home-container">
          <div class="home-section-header">
            <h2 class="home-section-title">核心功能</h2>
            <p class="home-section-subtitle">
              整理账号、执行任务，按需要配置自己的工作流程。
            </p>
          </div>

          <div class="home-features-grid">
            <div
              v-for="feature in features"
              :key="feature.id"
              class="home-feature-item"
            >
              <div class="home-feature-icon">
                <component :is="feature.icon" />
              </div>
              <h3 class="home-feature-title">
                {{ feature.title }}
              </h3>
              <p class="home-feature-description">
                {{ feature.description }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 统计数据 -->
      <section class="home-stats-section">
        <div class="home-container">
          <div class="home-stats-grid">
            <div v-for="stat in stats" :key="stat.id" class="home-stat-item">
              <div class="home-stat-number">
                {{ stat.number }}
              </div>
              <div class="home-stat-label">
                {{ stat.label }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 页脚 -->
    <footer class="home-footer">
      <div class="home-container">
        <div class="home-footer-content">
          <div class="home-footer-brand">
            <img
              src="/icons/xiaoyugan.png"
              alt="XYZW"
              class="home-footer-logo"
            />
            <span class="home-footer-text">XYZW 游戏管理系统</span>
          </div>
          <div class="home-footer-links">
            <router-link to="/changelog" class="home-footer-link">
              更新日志
            </router-link>
            <a
              href="/tokens"
              class="home-footer-link"
              @click="navigateFooter($event, '/tokens')"
              >账号管理</a
            >
            <a
              href="/admin/dashboard"
              class="home-footer-link"
              @click="navigateFooter($event, '/admin/dashboard')"
              >控制台</a
            >
            <a
              href="/admin/game-features"
              class="home-footer-link"
              @click="navigateFooter($event, '/admin/game-features')"
              >游戏功能</a
            >
            <a
              href="/admin/backup"
              class="home-footer-link"
              @click="navigateFooter($event, '/admin/backup')"
              >配置备份</a
            >
          </div>
        </div>
        <div class="home-footer-bottom">
          <p>
            &copy; {{ new Date().getFullYear() }} XYZW. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { Cube, Menu, PersonCircle, Ribbon, Settings } from "@vicons/ionicons5";
import { markRaw, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();
const featuresSection = ref(null);
const isMobileMenuOpen = ref(false);

// 功能卡片数据
const featureCards = ref([
  {
    id: 1,
    icon: markRaw(PersonCircle),
    title: "角色管理",
    description: "统一管理游戏角色",
  },
  {
    id: 2,
    icon: markRaw(Cube),
    title: "任务系统",
    description: "自动化日常任务",
  },
  {
    id: 3,
    icon: markRaw(Ribbon),
    title: "数据统计",
    description: "全面的数据分析",
  },
]);

// 功能特性数据
const features = ref([
  {
    id: 1,
    icon: markRaw(PersonCircle),
    title: "角色管理",
    description: "轻松管理多个游戏角色，统一查看角色信息、等级进度和装备状态",
  },
  {
    id: 2,
    icon: markRaw(Cube),
    title: "任务自动化",
    description: "智能日常任务系统，自动完成重复性任务，节省您的宝贵时间",
  },
  {
    id: 3,
    icon: markRaw(Ribbon),
    title: "数据分析",
    description: "详细的数据统计和分析报告，帮助您更好地了解游戏进度",
  },
  {
    id: 4,
    icon: markRaw(Settings),
    title: "个性化设置",
    description: "灵活的配置选项，根据您的需求定制最适合的管理方案",
  },
]);

// 统计数据
const stats = ref([
  { id: 1, number: "多账号管理", label: "统一整理账号与分组" },
  { id: 2, number: "批量日常", label: "按配置执行日常任务" },
  { id: 3, number: "定时任务", label: "按计划安排任务执行" },
  { id: 4, number: "本地备份", label: "导入导出本地配置" },
]);

// 滚动到功能区域
const scrollToFeatures = () => {
  if (featuresSection.value) {
    featuresSection.value.scrollIntoView({
      behavior:
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.classList.contains("reduce-motion")
          ? "instant"
          : "smooth",
    });
  }
};

const navigateFooter = (event, path) => {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  router.push(path);
};

onMounted(() => {
  // 初始化认证状态
  authStore.initAuth();
});
</script>

<style scoped lang="scss">
.home-page {
  --home-header-height: 64px;
  min-height: 100dvh;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: var(--font-family-base);
  font-size: 14px;
  line-height: 1.6;
}
.home-container {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px;
  box-sizing: border-box;
}
.home-navbar {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--z-fixed);
  height: var(--home-header-height);
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
}
.home-navbar > .home-container {
  height: 100%;
}
.home-nav-content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.home-nav-brand,
.home-footer-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.home-brand-logo {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  object-fit: contain;
}
.home-brand-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.home-nav-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.home-nav-actions :deep(.n-button) {
  height: 40px;
  font-size: 14px;
}
.home-mobile-menu-button {
  display: none;
}
.home-main-content {
  padding-top: var(--home-header-height);
}
.home-hero-section {
  padding: 48px 0;
}
.home-hero-content {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 48px;
  align-items: center;
}
.home-hero-text,
.home-hero-visual {
  min-width: 0;
}
.home-hero-title {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.6;
  color: var(--text-primary);
}
.home-hero-subtitle {
  margin: 0 0 24px;
  font-size: 16px;
  color: var(--text-secondary);
}
.home-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.home-hero-button {
  min-height: 44px;
  padding: 0 20px;
  font-size: 14px;
}
.home-feature-cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.home-feature-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-primary);
  box-shadow: var(--shadow-light);
}
.home-card-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  color: var(--primary-color);
}
.home-card-icon :deep(svg),
.home-feature-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.home-card-content {
  min-width: 0;
}
.home-card-content h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}
.home-card-content p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}
.home-features-section {
  padding: 40px 0;
  background: var(--bg-primary);
  scroll-margin-top: calc(var(--home-header-height) + 24px);
}
.home-section-header {
  text-align: left;
  margin-bottom: 24px;
}
.home-section-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
}
.home-section-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}
.home-features-grid,
.home-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
}
.home-feature-item {
  min-width: 0;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-secondary);
}
.home-feature-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 16px;
  color: var(--primary-color);
}
.home-feature-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}
.home-feature-description {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.home-stats-section {
  padding: 32px 0;
}
.home-stat-item {
  min-width: 0;
}
.home-stat-number {
  margin-bottom: 4px;
  font-size: 16px;
  font-weight: 600;
}
.home-stat-label {
  font-size: 14px;
  color: var(--text-secondary);
}
.home-footer {
  padding: 24px 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-top: 1px solid var(--border-light);
}
.home-footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px 24px;
  margin-bottom: 16px;
}
.home-footer-logo {
  display: block;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  object-fit: contain;
}
.home-footer-text {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}
.home-footer-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.home-footer-link {
  font-size: 14px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 300ms ease;
}
.home-footer-link:hover {
  color: var(--primary-color);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.home-footer-bottom {
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-secondary);
}
.home-footer-bottom p {
  margin: 0;
}
.home-drawer-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}
.home-drawer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 12px;
  color: var(--text-primary);
  text-decoration: none;
}
.home-drawer-item.router-link-exact-active {
  background: var(--primary-color-light);
  color: var(--primary-color);
}
.home-drawer-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 1023px) {
  .home-hero-content {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .home-features-grid,
  .home-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 639px) {
  .home-page {
    --home-header-height: 52px;
  }
  .home-container {
    padding: 0 16px;
  }
  .home-brand-text {
    font-size: 14px;
  }
  .home-nav-actions {
    display: none;
  }
  .home-mobile-menu-button {
    display: inline-flex;
    flex: 0 0 44px;
  }
  .home-mobile-menu-button :deep(.n-button) {
    width: 44px;
    height: 44px;
  }
  .home-hero-section {
    padding: 32px 0;
  }
  .home-features-section {
    padding: 32px 0;
  }
  .home-features-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .home-stats-grid {
    gap: 16px;
  }
  .home-stats-section {
    padding: 24px 0;
  }
  .home-footer-content {
    align-items: flex-start;
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-footer-link {
    transition: none;
  }
}
.reduce-motion .home-footer-link {
  transition: none;
}
</style>
