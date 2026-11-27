import { openDB } from 'idb'

export const MAX_GAME_SCRIPT_BYTES = 8 * 1024 * 1024

const databaseName = 'xyzw-local-game-scripts'
const defaults = { enabled: true, groups: [] }
const scriptExtension = /(?:\.user)?\.js$/i

function readUserscriptMetadata(code) {
  const lines = code.slice(0, 64 * 1024).split(/\r?\n/)
  const start = lines.findIndex(line => /^\/\/[ \t]*==UserScript==$/.test(line.trim()))
  const metadata = Object.create(null)
  if (start < 0) return metadata
  for (const line of lines.slice(start + 1)) {
    const text = line.trim()
    if (/^\/\/[ \t]*==\/UserScript==$/.test(text)) return metadata
    const declaration = text.match(/^\/\/[ \t]*@([\w-]+)[ \t]+(\S.*)$/)
    if (declaration) metadata[declaration[1]] = declaration[2]
  }
  return Object.create(null)
}

export async function readGameScriptFile(file) {
  if (!scriptExtension.test(file.name)) throw new Error('仅支持 .js 和 .user.js 文件')
  if (!file.size) throw new Error('脚本文件为空')
  if (file.size > MAX_GAME_SCRIPT_BYTES) throw new Error('单个脚本不能超过 8 MiB')

  const bytes = await file.arrayBuffer()
  if (!bytes.byteLength) throw new Error('脚本文件为空')
  if (bytes.byteLength > MAX_GAME_SCRIPT_BYTES) throw new Error('单个脚本不能超过 8 MiB')
  let code
  try {
    code = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('请使用 UTF-8 编码的 JavaScript 文件')
  }
  if (!code.trim() || code.includes('\u0000')) throw new Error('脚本文件没有有效的文本内容')

  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const metadata = readUserscriptMetadata(code)
  return {
    id,
    code,
    name: (metadata.name || file.name.replace(scriptExtension, '') || file.name).slice(0, 160),
    fileName: file.name.slice(0, 255),
    version: (metadata.version || '').slice(0, 40),
    size: bytes.byteLength,
    runAt: metadata['run-at'] === 'document-start' ? 'document-start' : 'document-end',
    hasExternalDependencies: Boolean(metadata.require || metadata.resource),
    importedAt: Date.now(),
  }
}

export function createLocalGameScriptStore(name = databaseName) {
  let opening
  function getDatabase() {
    if (!opening) {
      opening = openDB(name, 1, {
        upgrade(database) {
          const scripts = database.createObjectStore('scripts', { keyPath: 'id' })
          scripts.createIndex('order', 'order', { unique: true })
          database.createObjectStore('sources')
          database.createObjectStore('settings')
        },
      }).catch((error) => {
        opening = undefined
        throw error
      })
    }
    return opening
  }

  const readSettings = async store => (await store.get('library')) || defaults

  return {
    async list() {
      const database = await getDatabase()
      const transaction = database.transaction(['scripts', 'settings'], 'readonly')
      const scripts = await transaction.objectStore('scripts').index('order').getAll()
      const settings = await readSettings(transaction.objectStore('settings'))
      await transaction.done
      return { scripts, ...settings }
    },

    async importFile(file) {
      const { id, code, ...metadata } = await readGameScriptFile(file)
      const database = await getDatabase()
      const transaction = database.transaction(['scripts', 'sources', 'settings'], 'readwrite')
      const scripts = transaction.objectStore('scripts')
      if (await scripts.getKey(id)) {
        await transaction.done
        return 'duplicate'
      }

      const settings = transaction.objectStore('settings')
      const order = (await settings.get('lastOrder') || 0) + 1
      await scripts.add({ id, ...metadata, order, enabled: false, group: '' })
      await transaction.objectStore('sources').add(code, id)
      await settings.put(order, 'lastOrder')
      await transaction.done
      return 'imported'
    },

    async updateSettings(update) {
      const database = await getDatabase()
      const transaction = database.transaction('settings', 'readwrite')
      const settings = await readSettings(transaction.store)
      await transaction.store.put(update(settings), 'library')
      await transaction.done
    },

    async updateScript(id, update) {
      const database = await getDatabase()
      const transaction = database.transaction('scripts', 'readwrite')
      const script = await transaction.store.get(id)
      if (script) await transaction.store.put(update(script))
      await transaction.done
    },

    async deleteScript(id) {
      const database = await getDatabase()
      const transaction = database.transaction(['scripts', 'sources'], 'readwrite')
      await transaction.objectStore('scripts').delete(id)
      await transaction.objectStore('sources').delete(id)
      await transaction.done
    },

    async deleteGroup(name) {
      const database = await getDatabase()
      const transaction = database.transaction(['scripts', 'settings'], 'readwrite')
      const settings = transaction.objectStore('settings')
      const current = await readSettings(settings)
      await settings.put({ ...current, groups: current.groups.filter(group => group !== name) }, 'library')
      const scripts = transaction.objectStore('scripts')
      for (const script of await scripts.getAll()) {
        if (script.group === name) await scripts.put({ ...script, group: '' })
      }
      await transaction.done
    },

    async enabledSnapshot() {
      const database = await getDatabase()
      const transaction = database.transaction(['scripts', 'sources', 'settings'], 'readonly')
      const settings = await readSettings(transaction.objectStore('settings'))
      const snapshot = []
      if (settings.enabled) {
        const sources = transaction.objectStore('sources')
        for (const script of await transaction.objectStore('scripts').index('order').getAll()) {
          if (!script.enabled) continue
          const { id, name, runAt } = script
          const code = await sources.get(id)
          if (typeof code !== 'string') throw new Error(`无法读取脚本「${name}」`)
          snapshot.push({ id, name, runAt, code })
        }
      }
      await transaction.done
      return snapshot
    },
  }
}
