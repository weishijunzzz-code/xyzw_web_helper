<template>
  <NDrawer
    :show="show"
    placement="bottom"
    height="var(--game-account-drawer-height)"
    :z-index="1200"
    class="game-account-switch-drawer"
    :aria-labelledby="`${drawerId}-title`"
    @update:show="emit('update:show', $event)"
    @after-leave="emit('afterLeave')"
  >
    <NDrawerContent
      :header-style="{ padding: '0' }"
      :body-content-style="{ padding: '0' }"
      :footer-style="{ padding: '0' }"
    >
      <template #header>
        <div class="drawer-heading">
          <span :id="`${drawerId}-title`">切换游戏账号</span>
          <NButton
            quaternary
            aria-label="关闭换号"
            data-mobile-overlay-close
            @click="emit('update:show', false)"
          >
            <template #icon><NIcon :component="CloseOutline" aria-hidden="true" /></template>
          </NButton>
        </div>
      </template>

      <div class="drawer-main">
        <div v-if="currentAccount" class="current-account">
          <span>当前账号</span>
          <strong>{{ currentAccount.name }}</strong>
          <span v-if="currentAccount.details" class="account-details">{{ currentAccount.details }}</span>
        </div>

        <label class="account-search">
          <NIcon :component="SearchOutline" aria-hidden="true" />
          <input
            v-model="query"
            type="search"
            aria-label="搜索名称、区服或角色 ID"
            placeholder="搜索名称、区服或角色 ID"
          />
        </label>

        <p v-if="preparing" class="drawer-feedback" role="status">正在准备目标账号…</p>
        <p v-else-if="error" class="drawer-feedback drawer-error" role="alert">{{ error }}</p>

        <div v-for="(group, index) in visibleGroups" :key="group.id" class="account-group">
          <button
            class="group-toggle"
            type="button"
            :aria-expanded="!collapsedGroups.has(group.id)"
            :aria-controls="`${drawerId}-group-${index}`"
            @click="toggleGroup(group.id)"
          >
            <NIcon :component="FolderOutline" aria-hidden="true" />
            <span>{{ group.name }}</span>
            <span class="group-count">{{ group.accounts.length }}</span>
            <NIcon :component="ChevronDownOutline" class="group-chevron" aria-hidden="true" />
          </button>
          <ul v-show="!collapsedGroups.has(group.id)" :id="`${drawerId}-group-${index}`" class="account-list">
            <li v-for="account in group.accounts" :key="account.token.id" class="account-row">
              <div class="account-info">
                <strong>{{ account.name }}</strong>
                <span v-if="account.details" class="account-details">{{ account.details }}</span>
              </div>
              <span v-if="account.token.id === currentAccountId" class="current-label" aria-current="true">已选</span>
              <NButton
                v-else
                secondary
                type="primary"
                :disabled="preparing"
                :aria-label="`更换 ${account.name}${account.details ? ` ${account.details}` : ''}`"
                @click="emit('select', account.token)"
              >更换</NButton>
            </li>
          </ul>
        </div>
        <p v-if="!visibleGroups.length" class="drawer-feedback" role="status">没有匹配的账号</p>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <NButton block @click="emit('update:show', false)">取消</NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<script setup>
import { ChevronDownOutline, CloseOutline, FolderOutline, SearchOutline } from '@vicons/ionicons5'
import { NButton, NDrawer, NDrawerContent, NIcon } from 'naive-ui'
import { computed, ref, useId, watch } from 'vue'
import { useTokenStore } from '@/stores/tokenStore'

const props = defineProps({
  show: Boolean,
  currentAccountId: String,
  preparing: Boolean,
  error: String,
})
const emit = defineEmits(['update:show', 'select', 'afterLeave'])

const tokenStore = useTokenStore()
const drawerId = useId()
const query = ref('')
const collapsedGroups = ref(new Set())

const accounts = computed(() => tokenStore.gameTokens.map(token => {
  const name = token.name?.trim() || `账号 ${token.id.slice(-4)}`
  const rawServer = String(token.server || token.serverId || '')
  const server = rawServer && !rawServer.includes('服') ? `${rawServer}服` : rawServer
  const role = token.roleId ? `角色 ID ${token.roleId}` : ''
  return { token, name, server, role, details: [server, role].filter(Boolean).join(' · ') }
}))
const currentAccount = computed(() => accounts.value.find(account => account.token.id === props.currentAccountId))

const visibleGroups = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  const filtered = accounts.value.filter(({ token, name, server, role }) => (
    !keyword || [name, server, role, String(token.serverId ?? '')].some(value => value.toLocaleLowerCase().includes(keyword))
  ))
  const groupedIds = new Set()
  const groups = tokenStore.tokenGroups.map(group => {
    const memberIds = new Set(group.tokenIds)
    for (const id of memberIds) groupedIds.add(id)
    return { id: group.id, name: group.name, accounts: filtered.filter(account => memberIds.has(account.token.id)) }
  })
  groups.push({ id: 'ungrouped', name: '未分组', accounts: filtered.filter(account => !groupedIds.has(account.token.id)) })
  return groups.filter(group => group.accounts.length)
})

function toggleGroup(id) {
  if (collapsedGroups.value.has(id)) collapsedGroups.value.delete(id)
  else collapsedGroups.value.add(id)
}

watch(query, () => collapsedGroups.value.clear())
watch(() => props.show, show => {
  if (show) {
    query.value = ''
    collapsedGroups.value.clear()
  }
})
</script>

<style scoped>
:global(.game-account-switch-drawer.n-drawer) {
  --game-account-drawer-height: min(42rem, 82vh, calc(100vh - env(safe-area-inset-top, 0px) - 8px));
  box-sizing: border-box;
  width: 100% !important;
  max-width: none !important;
  padding-inline: env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px);
  border-radius: var(--border-radius-large) var(--border-radius-large) 0 0;
  background: var(--bg-primary);
}

@supports (height: 100dvh) {
  :global(.game-account-switch-drawer.n-drawer) {
    --game-account-drawer-height: min(42rem, 82dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 8px));
  }
}

.drawer-heading, .drawer-main, .drawer-footer {
  box-sizing: border-box;
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  padding-inline: 16px;
  color: var(--text-primary);
}

.drawer-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 56px;
  line-height: 1.4;
}

.drawer-main { display: grid; gap: 12px; padding-block: 12px; }
.drawer-footer { padding-block: 8px calc(8px + env(safe-area-inset-bottom, 0px)); }
.drawer-heading :deep(.n-button), .drawer-footer :deep(.n-button), .account-row :deep(.n-button) {
  min-width: 48px;
  min-height: 48px;
}

.current-account {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  padding: 8px 12px;
  border-radius: var(--border-radius-medium);
  background: var(--bg-secondary);
  overflow-wrap: anywhere;
}

.current-account > span, .account-details { color: var(--text-secondary); font-size: 0.875rem; }
.account-search { position: relative; display: flex; align-items: center; color: var(--text-secondary); }
.account-search > :deep(.n-icon) { position: absolute; inset-inline-start: 12px; pointer-events: none; }
.account-search input {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding-inline: 36px 12px;
  border: 1px solid var(--border-medium);
  border-radius: var(--border-radius-medium);
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 16px;
}

.account-search input::placeholder { color: var(--text-secondary); opacity: 1; }

.account-search input:focus-visible, .group-toggle:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.account-group { border: 1px solid var(--border-light); border-radius: var(--border-radius-medium); }
.group-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: inherit;
  padding: 8px 12px;
  background: var(--bg-secondary);
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.group-toggle:active { background: var(--bg-hover); }
.group-toggle > :deep(.n-icon) { flex: none; color: var(--text-secondary); }
.group-toggle > span { overflow-wrap: anywhere; }
.group-count { margin-inline-start: auto; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.group-toggle[aria-expanded='false'] .group-chevron { transform: rotate(-90deg); }
.account-list { margin: 0; padding: 0; list-style: none; }
.account-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-top: 1px solid var(--border-light);
}

.account-info { display: grid; min-width: 0; overflow-wrap: anywhere; }
.current-label { padding-inline: 8px; color: var(--text-secondary); font-weight: 600; }
.drawer-feedback { margin: 0; color: var(--text-secondary); overflow-wrap: anywhere; }
.drawer-error { color: var(--text-primary); padding-inline-start: 8px; border-inline-start: 3px solid var(--error-color); }

@media (prefers-reduced-motion: reduce) {
  :global(.game-account-switch-drawer.n-drawer) { transition-duration: 0.01ms !important; }
}
</style>
