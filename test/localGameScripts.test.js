import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalGameScriptStore, MAX_GAME_SCRIPT_BYTES, readGameScriptFile } from '../src/utils/localGameScriptStore.js'
import 'fake-indexeddb/auto'

function script(name, code) {
  return new File([code], name, { type: 'text/javascript' })
}

test('reads userscript metadata without executing source and supports large UTF-8 files', async () => {
  const code = [
    '// ==UserScript==',
    '// @name 大型本地脚本',
    '// @version 3.8.2',
    '// @run-at document-start',
    '// @require https://example.invalid/dependency.js',
    '// ==/UserScript==',
    `/*${'x'.repeat(5 * 1024 * 1024)}*/`,
    'throw new Error("The import must never execute source")',
  ].join('\r\n')
  const file = script('example.user.js', code)
  const result = await readGameScriptFile(file)
  assert.equal(result.name, '大型本地脚本')
  assert.equal(result.version, '3.8.2')
  assert.equal(result.runAt, 'document-start')
  assert.equal(result.hasExternalDependencies, true)
  assert.equal(result.code, code)
  assert.equal(result.size, file.size)
  assert.match(result.id, /^[\da-f]{64}$/)
})

test('rejects invalid files before storing them and disregards incomplete metadata', async () => {
  await assert.rejects(readGameScriptFile(script('bad.html', 'content')), /仅支持/)
  await assert.rejects(readGameScriptFile(script('empty.js', '')), /为空/)
  await assert.rejects(readGameScriptFile(new File([Uint8Array.of(0xC3, 0x28)], 'broken.js')), /UTF-8/)
  await assert.rejects(readGameScriptFile(script('empty.txt.js', ' \r\n ')), /有效/)
  await assert.rejects(readGameScriptFile({ name: 'oversize.js', size: MAX_GAME_SCRIPT_BYTES + 1 }), /8 MiB/)
  const result = await readGameScriptFile(script('fallback.js', '// ==UserScript==\n// @name 不完整\nfoo()'))
  assert.equal(result.name, 'fallback')
  assert.equal(result.runAt, 'document-end')
})

test('persists disabled imports, de-duplicates content, and applies master and item switches in import order', async () => {
  const dbName = 'script-snapshot-regression'
  const library = createLocalGameScriptStore(dbName)
  const firstFile = script('first.js', 'document.title = "First"')
  const secondFile = script('first.js', 'document.title = "Second"')
  assert.equal(await library.importFile(firstFile), 'imported')
  assert.equal(await library.importFile(script('same-content.user.js', await firstFile.text())), 'duplicate')
  assert.equal(await library.importFile(secondFile), 'imported')

  const { scripts } = await library.list()
  assert.equal(scripts.length, 2)
  assert.deepEqual(scripts.map(record => record.enabled), [false, false])
  assert.ok(scripts.every(record => !Object.hasOwn(record, 'code')))
  assert.deepEqual(await library.enabledSnapshot(), [])

  await library.updateScript(scripts[1].id, record => ({ ...record, enabled: true }))
  await library.updateScript(scripts[0].id, record => ({ ...record, enabled: true }))
  const anotherConnection = createLocalGameScriptStore(dbName)
  assert.deepEqual((await anotherConnection.enabledSnapshot()).map(record => record.id), scripts.map(record => record.id))
  assert.deepEqual((await anotherConnection.enabledSnapshot()).map(record => record.code), [await firstFile.text(), await secondFile.text()])

  await anotherConnection.updateSettings(settings => ({ ...settings, enabled: false }))
  assert.deepEqual(await library.enabledSnapshot(), [])
  assert.deepEqual((await library.list()).scripts.map(record => record.enabled), [true, true])
  await library.updateSettings(settings => ({ ...settings, enabled: true }))
  assert.equal((await anotherConnection.enabledSnapshot()).length, 2)
})

test('moves scripts to ungrouped when a group is removed, then deletes source data', async () => {
  const library = createLocalGameScriptStore('script-group-regression')
  await library.importFile(script('move.js', 'document.title = "Group"'))
  const { scripts: [entry] } = await library.list()
  await library.updateSettings(settings => ({ ...settings, groups: ['测试组'] }))
  await library.updateScript(entry.id, record => ({ ...record, enabled: true, group: '测试组' }))
  assert.equal((await library.list()).scripts[0].group, '测试组')
  await library.deleteGroup('测试组')
  const after = await library.list()
  assert.deepEqual(after.groups, [])
  assert.equal(after.scripts[0].group, '')
  assert.equal(after.scripts[0].enabled, true)
  await library.deleteScript(entry.id)
  assert.deepEqual((await library.list()).scripts, [])
  assert.deepEqual(await library.enabledSnapshot(), [])
})

test('keeps default timing and applies declared or selected game-ready timing to existing imports', async () => {
  const library = createLocalGameScriptStore('script-game-ready-timing')
  await library.importFile(script('plain.js', 'document.title = "Plain"'))
  await library.importFile(script('ready.user.js', '// ==UserScript==\n// @run-at document-idle\n// ==/UserScript==\nvoid 0;'))
  const { scripts: [plain, ready] } = await library.list()
  await library.updateScript(plain.id, record => ({ ...record, enabled: true }))
  await library.updateScript(ready.id, record => ({ ...record, enabled: true, runAt: 'document-end' }))
  assert.deepEqual((await library.enabledSnapshot()).map(item => item.runAt), ['document-end', 'document-idle'])
  await library.updateScript(plain.id, record => ({ ...record, waitForGame: true }))
  assert.deepEqual((await library.enabledSnapshot()).map(item => item.runAt), ['document-idle', 'document-idle'])
})
