import { readonly, ref, shallowRef } from 'vue'
import { createLocalGameScriptStore } from '../utils/localGameScriptStore.js'

const database = createLocalGameScriptStore()
const library = shallowRef({ scripts: [], groups: [], enabled: true })
const visible = ref(false)
const revision = ref(0)
let pending = Promise.resolve()

function afterPrevious(action) {
  const result = pending.then(action)
  pending = result.catch(() => {})
  return result
}

async function refresh() {
  library.value = await database.list()
}

function edit(action, changesLaunch = false) {
  return afterPrevious(async () => {
    const result = await action()
    if (changesLaunch) revision.value++
    await refresh()
    return result
  })
}

export function getEnabledGameScripts() {
  return afterPrevious(() => database.enabledSnapshot())
}

function addGroup(input) {
  const name = input.trim()
  if (!name || name.length > 40 || name === '未分组') {
    return Promise.reject(new Error('请输入 1 到 40 个字的分组名称'))
  }
  return edit(() => database.updateSettings((settings) => {
    if (settings.groups.includes(name)) throw new Error('同名分组已存在')
    return { ...settings, groups: [...settings.groups, name] }
  }))
}

export function useLocalGameScripts() {
  return {
    library: readonly(library),
    visible: readonly(visible),
    revision: readonly(revision),
    open() { visible.value = true },
    close() { visible.value = false },
    load: () => afterPrevious(refresh),
    importFile: file => edit(() => database.importFile(file)),
    setLibraryEnabled: enabled => edit(() => database.updateSettings(settings => ({ ...settings, enabled })), true),
    setScriptEnabled: (id, enabled) => edit(() => database.updateScript(id, script => ({ ...script, enabled })), true),
    moveScript: (id, group) => edit(() => database.updateScript(id, script => ({ ...script, group }))),
    deleteScript: script => edit(() => database.deleteScript(script.id), script.enabled),
    addGroup,
    deleteGroup: name => edit(() => database.deleteGroup(name)),
  }
}
