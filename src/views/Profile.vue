<template>
  <div class="profile-page" :class="{ 'mobile-profile-page': isMobileProfile }">
    <div class="container">
      <div class="page-header">
        <h1>个人资料</h1>
        <p>管理您的账户信息和偏好设置</p>
      </div>

      <a-card v-if="showLocalGameScripts" class="profile-game-scripts">
        <div class="security-item">
          <div class="security-info">
            <h3>本地脚本</h3>
            <p>管理 APK 单开启动时加载的脚本</p>
          </div>
          <n-button secondary @click="openScriptLibrary">
            <template #icon><n-icon :component="SnowOutline" /></template>
            管理脚本
          </n-button>
        </div>
      </a-card>

      <h2>基本信息</h2>
      <a-card>
        <a-form :model="userInfo" :layout="formLayout">
          <a-form-item field="username" label="用户名">
            <a-input v-model="userInfo.username" readonly />
          </a-form-item>
          <a-form-item field="email" label="邮箱">
            <a-input v-model="userInfo.email" :input-attrs="{ inputmode: 'email', autocomplete: 'email' }" />
          </a-form-item>
          <a-form-item field="nickname" label="昵称">
            <a-input
              v-model="userInfo.nickname"
              :input-attrs="{ autocomplete: 'nickname' }"
              placeholder="请输入昵称"
            />
          </a-form-item>
          <a-form-item field="phone" label="手机">
            <a-input
              v-model="userInfo.phone"
              :input-attrs="{ inputmode: 'tel', autocomplete: 'tel' }"
              placeholder="请输入手机号"
            />
          </a-form-item>
        </a-form>

        <template #actions>
          <a-button type="primary" @click="saveProfile"> 保存更改 </a-button>
        </template>
      </a-card>

      <h2>密码修改</h2>
      <a-card>
        <a-form
          :model="passwordForm"
          ref="passwordFormRef"
          :layout="formLayout"
        >
          <a-form-item label="当前密码" field="currentPassword">
            <a-input
              v-model="passwordForm.currentPassword"
              type="password"
              :input-attrs="{ autocomplete: 'current-password' }"
              placeholder="请输入当前密码"
            />
          </a-form-item>
          <a-form-item label="新密码" field="newPassword">
            <a-input
              v-model="passwordForm.newPassword"
              type="password"
              :input-attrs="{ autocomplete: 'new-password' }"
              placeholder="请输入新密码"
            />
          </a-form-item>
          <a-form-item label="确认新密码" field="confirmPassword">
            <a-input
              v-model="passwordForm.confirmPassword"
              type="password"
              :input-attrs="{ autocomplete: 'new-password' }"
              placeholder="请再次输入新密码"
            />
          </a-form-item>
        </a-form>
        <template #actions>
          <a-button type="primary" @click="changePassword"> 修改密码 </a-button>
        </template>
      </a-card>

      <h2>系统偏好</h2>
      <a-card class="profile-preferences">
        <a-form :layout="formLayout">
          <a-form-item label="主题设置">
            <n-select
              :value="themeMode"
              :options="themeOptions"
              @update:value="updateTheme"
            />
            <template #extra> 选择您喜欢的界面主题 </template>
          </a-form-item>
          <a-form-item label="强调色">
            <div class="accent-swatches" role="group" aria-label="强调色">
              <button v-for="color in accentOptions" :key="color.value"
                type="button" class="accent-swatch" :aria-label="color.label"
                :aria-pressed="accent === color.value" :title="color.label"
                :style="{ '--swatch-color': color.color }"
                @click="setAccent(color.value)">{{ accent === color.value ? '✓' : '' }}</button>
            </div>
          </a-form-item>
          <a-form-item label="语言设置">
            <n-select
              v-model:value="preferences.language"
              :options="languageOptions"
            />
            <template #extra> 选择界面显示语言 </template>
          </a-form-item>
          <a-form-item label="通知设置">
            <n-switch v-model:value="preferences.notifications" />
            <template #extra> 接收任务完成通知 </template>
          </a-form-item>
          <a-form-item label="自动执行">
            <n-switch v-model:value="preferences.autoExecute" />
            <template #extra> 默认开启任务自动执行 </template>
          </a-form-item>
        </a-form>
      </a-card>

      <h2>Token管理</h2>
      <TokenManager />

      <h2>账户安全</h2>
      <a-card>
        <div class="security-items">
          <div class="security-item">
            <div class="security-info">
              <h3>两步验证</h3>
              <p>为您的账户添加额外的安全保护</p>
            </div>
            <n-button @click="setupTwoFactor"> 设置 </n-button>
          </div>

          <div class="security-item">
            <div class="security-info">
              <h3>登录历史</h3>
              <p>查看最近的登录记录</p>
            </div>
            <n-button @click="viewLoginHistory"> 查看 </n-button>
          </div>

          <div class="security-item">
            <div class="security-info">
              <h3>数据导出</h3>
              <p>导出全部账号 Token、BIN 登录凭据及所有本地配置</p>
            </div>
            <n-button :loading="exportingBackup" @click="exportData"> 导出 </n-button>
          </div>

          <div v-if="isMobileProfile" class="security-item">
            <div class="security-info">
              <h3>备份恢复</h3>
              <p>从备份文件合并或覆盖本地账号与配置</p>
            </div>
            <RouterLink class="settings-link" :to="{ name: 'MobileBackupRestore' }">打开</RouterLink>
          </div>

          <div class="security-item danger">
            <div class="security-info">
              <h3>删除账户</h3>
              <p>永久删除您的账户和所有数据</p>
            </div>
            <n-button type="error" @click="deleteAccount"> 删除 </n-button>
          </div>
        </div>
      </a-card>
    </div>
  </div>
</template>

<script setup>
import { SnowOutline } from "@vicons/ionicons5";
import { useDialog, useMessage } from "naive-ui";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { useAccent } from "@/composables/useAccent";
import { useLocalGameScripts } from "@/composables/useLocalGameScripts.js";
import { useTheme } from "@/composables/useTheme";
import { useAuthStore } from "@/stores/auth";
import { collectFullBackup, downloadBackupFile } from "@/utils/fullBackup";
import { isNativeGameApp } from "@/utils/runtimePlatform.js";

const { themeMode, setThemeMode } = useTheme();
const { accent, accentOptions, setAccent } = useAccent();
const route = useRoute();
const isMobileProfile = computed(() => route.name === "MobileProfile");
const showLocalGameScripts = isNativeGameApp();
const { open: openScriptLibrary } = useLocalGameScripts();
const formLayout = computed(() => isMobileProfile.value ? "vertical" : "horizontal");
const message = useMessage();
const dialog = useDialog();
const authStore = useAuthStore();
const passwordFormRef = ref(null);
const exportingBackup = ref(false);

// 用户信息
const userInfo = reactive({
  username: "",
  email: "",
  nickname: "",
  phone: "",
  avatar: "",
});

// 密码表单
const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

// 系统偏好
const preferences = reactive({
  language: "zh-CN",
  notifications: true,
  autoExecute: false,
});

// 密码验证规则

// 选项数据
const themeOptions = [
  { label: "跟随系统", value: "system" },
  { label: "浅色主题", value: "light" },
  { label: "深色主题", value: "dark" },
];

const languageOptions = [
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
];

// 方法
const saveProfile = async () => {
  try {
    // 这里应该调用API保存用户信息
    message.success("个人信息保存成功");
  } catch (error) {
    message.error("保存失败，请稍后重试");
  }
};

const changePassword = async () => {
  if (!passwordFormRef.value) return;

  try {
    await passwordFormRef.value.validate();

    // 这里应该调用API修改密码
    message.success("密码修改成功");

    // 清空表单
    Object.keys(passwordForm).forEach((key) => {
      passwordForm[key] = "";
    });
  } catch (error) {
    // 验证失败
  }
};

const updateTheme = setThemeMode;

const setupTwoFactor = () => {
  message.info("两步验证设置功能开发中...");
};

const viewLoginHistory = () => {
  message.info("登录历史查看功能开发中...");
};

// Export a full backup (localStorage config + IndexedDB incl. BIN credentials).
const exportData = async () => {
  if (exportingBackup.value) return;
  exportingBackup.value = true;
  try {
    const backup = await collectFullBackup();
    const accountCount =
      backup.indexedDB?.xyzw_token_db?.gameTokens?.length ?? 0;
    const binCount = backup.indexedDB?.xyzw?.tokens?.length ?? 0;
    const delivery = await downloadBackupFile(backup);
    if (delivery === "cancelled") return;
    const action = delivery === "shared" ? "已打开系统分享" : "已下载备份";
    message.success(
      `${action}，包含 ${accountCount} 个账号记录和 ${binCount} 份 BIN 凭据`,
    );
  } catch (error) {
    console.error("导出失败:", error);
    message.error(`导出失败：${error.message}`);
  } finally {
    exportingBackup.value = false;
  }
};

const deleteAccount = () => {
  dialog.warning({
    title: "删除账户",
    content: "此操作将永久删除您的账户和所有数据，且无法恢复。确定要继续吗？",
    positiveText: "确定删除",
    negativeText: "取消",
    onPositiveClick: () => {
      message.error("账户删除功能暂未开放");
    },
  });
};

// 生命周期
onMounted(() => {
  // 加载用户信息
  if (authStore.userInfo) {
    Object.assign(userInfo, authStore.userInfo);
  }

  // 加载用户偏好
  const savedPreferences = localStorage.getItem("userPreferences");
  if (savedPreferences) {
    try {
      Object.assign(preferences, JSON.parse(savedPreferences));
    } catch (error) {
      console.error("解析用户偏好失败:", error);
    }
  }
});
</script>

<style scoped lang="scss">
.profile-page {
  min-height: 100dvh;
  background: var(--bg-secondary);
  padding: var(--spacing-xl) 0;
  padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
}

.profile-game-scripts :deep(.n-button) {
  min-height: 44px;
}

.page-header {
  text-align: center;
  margin-bottom: var(--spacing-2xl);

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    margin-bottom: var(--spacing-sm);
  }

  p {
    color: var(--text-secondary);
    font-size: var(--font-size-lg);
    margin: 0;
  }
}

h2 {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-lg);
}

.profile-section {
  margin-bottom: var(--spacing-2xl);
}

.security-items {
  display: flex;
  gap: var(--spacing-lg);
  flex-direction: column;

  .security-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-lg);
    border: 1px solid var(--border-light);
    border-radius: var(--border-radius-medium);
    transition: all var(--transition-fast);

    &:hover {
      box-shadow: var(--shadow-light);
    }

    &.danger {
      border-color: var(--error-color);
      background: rgba(208, 48, 80, 0.05);
    }

    .security-info {
      flex: 1;

      h3 {
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-medium);
        color: var(--text-primary);
        margin-bottom: var(--spacing-xs);
      }

      p {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        margin: 0;
      }
    }
  }
}

.mobile-profile-page {
  min-height: 0;
  padding: var(--mobile-page-gutter, 12px) 0;

  .container { padding-inline: var(--mobile-page-gutter, 12px); }
  .page-header { margin-bottom: var(--spacing-md); text-align: start; }
  .page-header h1 { margin: 0 0 var(--spacing-xs); }
  .page-header p { font-size: var(--font-size-sm); }
  h2 { margin: var(--spacing-md) 0 var(--spacing-sm); }

  :deep(.arco-card-body) { padding: var(--spacing-md); }
  :deep(.arco-form-item) { margin-bottom: var(--spacing-md); }
  :deep(.arco-form-item:last-child) { margin-bottom: 0; }
  :deep(.arco-form-item-label-col) { padding: 0 0 var(--spacing-xs); }
  :deep(.arco-input-wrapper),
  :deep(.arco-btn),
  :deep(.n-base-selection),
  :deep(.n-button),
  .settings-link { min-height: var(--mobile-touch-target, 44px); }

  .profile-preferences :deep(.arco-form-item + .arco-form-item) {
    border-top: 1px solid var(--border-light);
    padding-top: var(--spacing-sm);
  }

  .security-items { gap: 0; }
  .security-items .security-item {
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }
  .security-items .security-item + .security-item { border-top: 1px solid var(--border-light); }
  .security-info { min-width: 0; }
  .security-info h3 { margin-top: 0; }
  .security-item :deep(.n-button),
  .settings-link { flex: 0 0 auto; min-width: var(--mobile-touch-target, 44px); }
  .settings-link { display: inline-grid; place-items: center; color: var(--primary-color); }
}

@media (max-width: 768px) {
  .container {
    padding: 0 var(--spacing-md);
  }

  .info-card {
    padding: var(--spacing-lg);
  }

  .preference-item,
  .security-item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-md);
  }

  .preference-item .n-select,
  .preference-item .n-switch {
    width: 100%;
  }
}
</style>
