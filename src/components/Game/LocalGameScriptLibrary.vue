<template>
  <n-drawer :show="visible" placement="bottom" height="min(820px, 94vh)" :z-index="1200" @update:show="value => { if (!value) close(); }">
    <n-drawer-content title="本地脚本" closable>
      <div class="script-library">
        <div class="script-controls">
          <div class="script-master">
            <div>
              <h2>本地脚本总开关</h2>
              <p>适用于应用单开。修改后下次启动生效。</p>
            </div>
            <n-switch :value="library.enabled" :disabled="busy" aria-label="本地脚本总开关" @update:value="value => save(() => setLibraryEnabled(value))" />
          </div>
          <p class="script-trust">已启用的脚本可以访问当前游戏，请只启用信任的文件。</p>
          <div class="script-toolbar">
            <n-input v-model:value="query" aria-label="搜索脚本" placeholder="搜索脚本" clearable>
              <template #prefix><n-icon :component="SearchOutline" /></template>
            </n-input>
            <n-button type="primary" :loading="importing" :disabled="busy" @click="pickFiles">
              <template #icon><n-icon :component="AddOutline" /></template>
              导入脚本
            </n-button>
            <input ref="fileInput" type="file" class="script-file-input" accept=".js,.user.js" multiple @change="onWebFiles">
          </div>
        </div>

        <p v-if="loading" class="script-empty" role="status">正在读取本地脚本…</p>
        <div v-else-if="loadError" class="script-empty" role="alert">
          <p>{{ loadError }}</p>
          <n-button @click="loadLibrary">重新读取</n-button>
        </div>
        <template v-else>
          <ul v-if="importErrors.length" class="script-import-errors" role="status">
            <li v-for="(error, index) in importErrors" :key="index">{{ error }}</li>
          </ul>
          <div class="script-list-heading">
            <span>{{ library.scripts.length }} 个脚本 · {{ enabledCount }} 个已启用</span>
            <n-button text :disabled="busy || addingGroup" @click="addingGroup = true">新建分组</n-button>
          </div>
          <form v-if="addingGroup" class="script-group-form" @submit.prevent="createGroup">
            <n-input v-model:value="groupName" aria-label="分组名称" placeholder="分组名称" :maxlength="40" :disabled="busy" />
            <n-button attr-type="submit" type="primary" :disabled="busy || !groupName.trim()">保存</n-button>
            <n-button :disabled="busy" @click="addingGroup = false; groupName = ''">取消</n-button>
          </form>
          <p v-if="!groups.length" class="script-empty">{{ query.trim() ? '没有找到匹配的脚本' : '还没有本地脚本。请选择 .js 或 .user.js 文件。' }}</p>
          <details v-for="group in groups" :key="group.name" class="script-group" open>
            <summary>
              <n-icon :component="FolderOutline" />
              <span class="script-group-name">{{ group.name || '未分组' }}</span>
              <span class="script-group-count">{{ group.scripts.length }}</span>
              <n-icon :component="ChevronDownOutline" class="script-group-chevron" />
            </summary>
            <p v-if="!group.scripts.length" class="script-group-empty">此分组暂无脚本</p>
            <ul v-else class="script-list">
              <li v-for="script in group.scripts" :key="script.id" class="script-row">
                <span class="script-type-icon" aria-hidden="true"><n-icon :component="DocumentTextOutline" /></span>
                <div class="script-file-info">
                  <strong :title="script.name">{{ script.name }}</strong>
                  <span>{{ formatScriptInfo(script) }}</span>
                  <span v-if="script.hasExternalDependencies" class="script-compatibility">外部依赖需包含在脚本文件中</span>
                </div>
                <n-switch :value="script.enabled" :disabled="busy" :aria-label="`启用 ${script.name}`" @update:value="value => updateScriptEnabled(script, value)" />
                <n-dropdown trigger="click" :options="scriptMenu(script)" @select="key => selectScriptMenu(script, key)">
                  <n-button quaternary circle :disabled="busy" :aria-label="`${script.name} 的更多操作`">
                    <template #icon><n-icon :component="EllipsisHorizontal" /></template>
                  </n-button>
                </n-dropdown>
              </li>
            </ul>
            <div v-if="group.name && !query.trim()" class="script-group-actions">
              <n-button text size="small" :disabled="busy" @click="removeGroup(group.name)">移除分组</n-button>
            </div>
          </details>
        </template>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { AddOutline, ChevronDownOutline, DocumentTextOutline, EllipsisHorizontal, FolderOutline, SearchOutline } from '@vicons/ionicons5'
import { useDialog, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useLocalGameScripts } from '@/composables/useLocalGameScripts.js'
import { collectNativeGameScripts, hasNativeGameScriptPicker, MAX_GAME_SCRIPT_FILES } from '@/utils/localGameScriptPicker.js'

const {
  addGroup, close, deleteGroup, deleteScript, importFile, library,
  load, moveScript, setLibraryEnabled, setScriptEnabled, visible,
} = useLocalGameScripts()
const dialogs = useDialog()
const message = useMessage()
const fileInput = ref(null)
const query = ref('')
const addingGroup = ref(false)
const groupName = ref('')
const loading = ref(false)
const saving = ref(false)
const importing = ref(false)
const loadError = ref('')
const importErrors = ref([])
const busy = computed(() => loading.value || saving.value || importing.value)
const enabledCount = computed(() => library.value.scripts.filter(script => script.enabled).length)
const groups = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  const byName = new Map([['', []], ...library.value.groups.map(name => [name, []])])
  for (const script of library.value.scripts) {
    if (keyword && ![script.name, script.fileName, script.group, script.version].some(value => value.toLocaleLowerCase().includes(keyword))) continue
    const scripts = byName.get(script.group) || byName.get('')
    scripts.push(script)
  }
  return Array.from(byName, ([name, scripts]) => ({ name, scripts }))
    .filter(group => group.scripts.length || (group.name && !keyword))
})

const formatDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
function formatScriptInfo(script) {
  const kib = script.size / 1024
  const size = kib >= 1024 ? `${(kib / 1024).toFixed(1)} MiB` : `${Math.max(0.1, kib).toFixed(1)} KiB`
  return [script.version, size, formatDate.format(script.importedAt)].filter(Boolean).join(' · ')
}

async function loadLibrary() {
  loading.value = true
  loadError.value = ''
  try {
    await load()
  } catch {
    loadError.value = '无法读取本地脚本库，请重试。'
  } finally {
    loading.value = false
  }
}

watch(visible, (open) => {
  if (open) void loadLibrary()
})

async function save(action) {
  if (busy.value) return false
  saving.value = true
  try {
    await action()
    return true
  } catch (error) {
    message.error(error.message || '无法保存脚本设置')
    return false
  } finally {
    saving.value = false
  }
}

function updateScriptEnabled(script, enabled) {
  if (!enabled) return save(() => setScriptEnabled(script.id, false))
  dialogs.warning({
    title: `启用「${script.name}」`,
    content: '脚本会在下次单开时运行，并可以访问当前游戏。请确认你信任此文件。',
    positiveText: '启用',
    negativeText: '取消',
    onPositiveClick: () => save(() => setScriptEnabled(script.id, true)),
  })
}

async function processImports(collect) {
  if (busy.value) return
  importing.value = true
  importErrors.value = []
  let imported = 0
  let duplicates = 0
  const report = (name, error) => importErrors.value.push(`${name}：${error}`)
  const accept = async (file) => {
    try {
      const result = await importFile(file)
      if (result === 'duplicate') duplicates++
      else imported++
    } catch (error) {
      report(file.name, error.message || '无法保存脚本')
    }
  }
  try {
    await collect(accept, report)
    if (imported) message.success(`已导入 ${imported} 个脚本，默认停用`)
    if (duplicates) message.info(`已跳过 ${duplicates} 个重复脚本`)
    if (imported && loadError.value) loadError.value = ''
  } catch (error) {
    report('文件导入', error.message || '无法打开文件选择器')
    message.error(error.message || '无法打开文件选择器')
  } finally {
    importing.value = false
  }
}

function pickFiles() {
  if (hasNativeGameScriptPicker()) return processImports(collectNativeGameScripts)
  fileInput.value?.click()
}

function onWebFiles(event) {
  const chosen = Array.from(event.target.files)
  event.target.value = ''
  if (chosen.length > MAX_GAME_SCRIPT_FILES) {
    message.error(`一次最多选择 ${MAX_GAME_SCRIPT_FILES} 个脚本`)
    return
  }
  return processImports(async (accept) => {
    for (const file of chosen) await accept(file)
  })
}

async function createGroup() {
  if (await save(() => addGroup(groupName.value))) {
    addingGroup.value = false
    groupName.value = ''
  }
}

function scriptMenu(script) {
  return [
    {
      label: '移动至分组', key: 'move',
      children: ['', ...library.value.groups].map(name => ({
        label: name || '未分组', key: `group:${name}`, disabled: name === script.group,
      })),
    },
    { label: '删除脚本', key: 'delete' },
  ]
}

function selectScriptMenu(script, key) {
  if (key.startsWith('group:')) return save(() => moveScript(script.id, key.slice(6)))
  dialogs.warning({
    title: `删除「${script.name}」`,
    content: '删除后可从原文件重新导入。已经打开的游戏会在下次启动时应用变更。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => save(() => deleteScript(script)),
  })
}

function removeGroup(name) {
  dialogs.warning({
    title: `移除「${name}」分组`,
    content: '分组内的脚本会移到未分组。',
    positiveText: '移除',
    negativeText: '取消',
    onPositiveClick: () => save(() => deleteGroup(name)),
  })
}
</script>

<style scoped>
.script-library {
  display: grid;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

.script-controls { display: grid; gap: 10px; }
.script-master {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--bg-secondary);
}
.script-master h2 { margin: 0; font-size: 15px; }
.script-master p, .script-trust { margin: 2px 0 0; color: var(--text-secondary); font-size: 12px; }
.script-toolbar, .script-group-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.script-group-form { grid-template-columns: minmax(0, 1fr) auto auto; }
.script-toolbar :deep(.n-button), .script-toolbar :deep(.n-input), .script-group-form :deep(.n-button) { min-height: 44px; }
.script-file-input { display: none; }
.script-list-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--text-secondary); font-size: 13px; }
.script-list-heading :deep(.n-button), .script-group-actions :deep(.n-button) { min-height: 44px; }
.script-group { border: 1px solid var(--border-light, var(--color-border)); border-radius: 12px; overflow: hidden; }
.script-group summary { display: flex; align-items: center; gap: 9px; min-height: 48px; padding: 0 12px; cursor: pointer; background: var(--bg-secondary); }
.script-group summary::-webkit-details-marker { display: none; }
.script-group summary > :deep(.n-icon:first-child) { color: var(--primary-color); font-size: 18px; }
.script-group-name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.script-group-count { color: var(--text-secondary); font-size: 13px; font-variant-numeric: tabular-nums; }
.script-group:not([open]) .script-group-chevron { transform: rotate(-90deg); }
.script-list, .script-import-errors { margin: 0; padding: 0; list-style: none; }
.script-import-errors { padding: 8px 12px; color: var(--text-secondary); background: var(--bg-secondary); border-radius: 10px; font-size: 13px; overflow-wrap: anywhere; }
.script-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 8px; min-height: 61px; padding: 6px 9px 6px 12px; }
.script-row + .script-row { border-top: 1px solid var(--border-light, var(--color-border)); }
.script-type-icon { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; color: var(--text-secondary); border-radius: 8px; background: var(--bg-secondary); font-size: 16px; }
.script-file-info { min-width: 0; display: grid; }
.script-file-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.script-file-info span, .script-group-empty, .script-empty { color: var(--text-secondary); font-size: 12px; }
.script-compatibility { line-height: 1.5; }
.script-row :deep(.n-button), .script-row :deep(.n-switch), .script-master :deep(.n-switch) { min-width: 44px; min-height: 44px; }
.script-group-actions { padding: 0 12px; text-align: right; }
.script-group-empty, .script-empty { margin: 0; padding: 14px; text-align: center; }

@media (max-width: 380px) {
  .script-row { grid-template-columns: minmax(0, 1fr) auto auto; gap: 4px; }
  .script-type-icon { display: none; }
}
</style>
