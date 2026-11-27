import { Capacitor, registerPlugin } from '@capacitor/core'
import { MAX_GAME_SCRIPT_BYTES } from './localGameScriptStore.js'
import { isNativeGameApp } from './runtimePlatform.js'

const ScriptFilePicker = registerPlugin('ScriptFilePicker')
export const MAX_GAME_SCRIPT_FILES = 8

export function hasNativeGameScriptPicker() {
  return isNativeGameApp() && Capacitor.isPluginAvailable('ScriptFilePicker')
}

/** Import files sequentially so a batch never creates one large bridge payload. */
export async function collectNativeGameScripts(onFile, onFileError) {
  try {
    const { files } = await ScriptFilePicker.pick()
    for (const { id, name, error } of files) {
      if (error) {
        onFileError(name, error)
        continue
      }
      try {
        const chunks = []
        let total = 0
        let done = false
        while (!done) {
          const chunk = await ScriptFilePicker.readChunk({ id })
          done = chunk.done
          const binary = atob(chunk.data)
          if (!binary.length && !done) throw new Error('无法读取所选脚本')
          total += binary.length
          if (total > MAX_GAME_SCRIPT_BYTES) throw new Error('单个脚本不能超过 8 MiB')
          const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
          chunks.push(bytes)
        }
        await onFile(new File(chunks, name, { type: 'text/javascript' }))
      } catch (readError) {
        onFileError(name, readError.message || '读取所选脚本失败')
      }
    }
  } finally {
    await ScriptFilePicker.finish().catch(() => {})
  }
}
