import { Capacitor, registerPlugin } from '@capacitor/core'
import { nextTick, shallowRef } from 'vue'
import useIndexedDB from '@/hooks/useIndexedDB'
import { useTokenStore } from '@/stores/tokenStore'
import { ANDROID_GAME_ORIGIN } from '@/utils/androidGameBridge'
import { acquireGameAccount } from '@/utils/gameAccountLease'
import { convertBinToLx, prepareSingleGameLaunch } from '@/utils/gameLauncher'
import { IOSGame } from '@/utils/iosGameBridge'
import { isAndroidApp, isIOSApp, isNativeGameApp } from '@/utils/runtimePlatform'
import { getEnabledGameScripts, useLocalGameScripts } from './useLocalGameScripts.js'

export const SCRIPT_LIBRARY_UNAVAILABLE = '当前应用版本不支持脚本加载，请更新后重试。'

export const singleGameSession = shallowRef(null)
export const singleGameSwitch = shallowRef(null)
const { getArrayBuffer } = useIndexedDB()
const GameAssets = registerPlugin('GameAssets')
let releaseAccount
let changing = false
let leavingGame = false
let hasOpenedSession = false

async function canUseIsolatedGame() {
  if (isIOSApp()) {
    if (!Capacitor.isPluginAvailable('IOSGame')) return false
    try { return (await IOSGame.status()).available === true } catch { return false }
  }
  if (!isAndroidApp() || !Capacitor.isPluginAvailable('GameAssets')) return false
  try {
    const status = await GameAssets.status()
    return status?.available === true && status.origin === ANDROID_GAME_ORIGIN
  } catch {
    return false
  }
}

function sessionNonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
}

export function updateSingleGame(sessionId, changes) {
  if (singleGameSession.value?.id === sessionId) {
    singleGameSession.value = { ...singleGameSession.value, ...changes }
  }
}

async function detachSingleGame() {
  const release = releaseAccount
  const previous = singleGameSession.value
  releaseAccount = undefined
  singleGameSession.value = null
  // Unmount the old document before another owner can launch the same account.
  await nextTick()
  if (previous?.nativeIOS) await IOSGame.close({ session: previous.id }).catch(() => {})
  release?.()
}

export async function closeSingleGame(accountId) {
  if (accountId && singleGameSession.value?.accountId !== accountId) return
  singleGameSwitch.value = null
  await detachSingleGame()
}

export function cancelSingleGameSwitch() {
  if (singleGameSwitch.value?.phase === 'preparing') singleGameSwitch.value = null
}

export async function startSingleGameSwitch(token, { withoutScripts = false } = {}) {
  if (!token?.id) throw new Error('未找到该账号的 BIN 数据')
  if (changing) return null
  const source = singleGameSession.value
  const previousSwitch = singleGameSwitch.value
  if (source ? !source.isolated || source.status !== 'ready' || source.accountId === token.id
    : previousSwitch?.phase !== 'failed') return null

  const attempt = {
    phase: 'preparing',
    original: source ? { id: source.accountId, name: source.accountName } : previousSwitch.original,
    target: { id: token.id, name: token.name },
  }
  singleGameSwitch.value = attempt
  try {
    return await openSingleGame(token, { switchAttempt: attempt, withoutScripts })
  } finally {
    if (singleGameSwitch.value === attempt) singleGameSwitch.value = previousSwitch
  }
}

export async function finishSingleGameSwitch(sessionId, router) {
  const attempt = singleGameSwitch.value
  if (attempt?.sessionId !== sessionId || attempt.phase !== 'loading'
    || singleGameSession.value?.id !== sessionId || singleGameSession.value.status !== 'ready') return
  try {
    if (!leavingGame && router.currentRoute.value.name === 'GamePlayer') await resumeSingleGame(router)
  } finally {
    if (singleGameSwitch.value === attempt && singleGameSession.value?.id === sessionId) {
      useTokenStore().selectTokenOnly(singleGameSession.value.accountId)
      singleGameSwitch.value = null
    }
  }
}

export function failSingleGameSwitch(sessionId, failure, { showFailure, diagnostic } = {}) {
  const attempt = singleGameSwitch.value
  if (attempt?.sessionId !== sessionId || attempt.phase !== 'loading' || singleGameSession.value?.id !== sessionId) return
  singleGameSwitch.value = showFailure ? { ...attempt, phase: 'failed', failure, diagnostic } : null
  return detachSingleGame()
}

export function resumeSingleGame(router) {
  const current = singleGameSession.value
  if (current) return router.replace({ name: 'GamePlayer', query: { bin_id: current.accountId } })
}

export async function leaveSingleGame(router) {
  if (isNativeGameApp()) {
    if (leavingGame) return
    leavingGame = true
    try {
      cancelSingleGameSwitch()
      if (singleGameSwitch.value?.phase === 'failed') singleGameSwitch.value = null
      const fullscreen = document.fullscreenElement || document.webkitFullscreenElement
      if (fullscreen?.closest('.game-player')) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        try { await exit?.call(document) } catch { /* Continue back to the app even if fullscreen has already ended. */ }
      }
      // The embedded game can add browser history entries of its own.
      return await router.replace('/mobile/tokens')
    } finally {
      leavingGame = false
    }
  }
  const back = router.options.history.state.back
  if (typeof back === 'string' && router.resolve(back).name !== 'GamePlayer') router.back()
  else return router.replace('/tokens')
}

export async function openSingleGame(token, { confirmSwitch, restart = false, withoutScripts = false, stagedFallback = false, switchAttempt } = {}) {
  if (!token?.id) throw new Error('未找到该账号的 BIN 数据')
  if (changing) return null
  const previous = singleGameSession.value
  const sameAccount = previous?.accountId === token.id
  if (sameAccount && !restart) return previous

  const tokenStore = useTokenStore()
  function preflightCurrent() {
    if (singleGameSession.value?.id !== previous?.id || (switchAttempt && singleGameSwitch.value !== switchAttempt)) return false
    if (!tokenStore.gameTokens.some(entry => entry.id === token.id)) throw new Error('未找到该账号的 BIN 数据')
    return true
  }
  changing = true
  let prospectiveRelease
  const startedAt = performance.now()
  try {
    const isolated = await canUseIsolatedGame()
    if (!preflightCurrent()) return null
    const nativeIOS = isIOSApp()
    if ((switchAttempt || nativeIOS) && !isolated) throw new Error('当前应用游戏环境不可用')
    const binStartedAt = performance.now()
    const bytes = await getArrayBuffer(token.id)
    if (!preflightCurrent()) return null
    let binHex
    if (bytes?.byteLength) {
      binHex = Array.from(convertBinToLx(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
    } else if (!isolated && stagedFallback) {
      binHex = localStorage.getItem(`bin_data_${token.id}`)
    }
    if (!binHex) throw new Error('未找到该账号的 BIN 数据')
    const binMs = Math.round(performance.now() - binStartedAt)

    let scripts = []
    let scriptError = false
    const { revision } = useLocalGameScripts()
    const scriptRevision = revision.value
    if (isolated && !withoutScripts) {
      try {
        scripts = await getEnabledGameScripts()
      } catch {
        scriptError = true
      }
    }

    if (previous && !sameAccount && !switchAttempt && !(await confirmSwitch?.(previous))) return null
    if (!preflightCurrent()) return null

    const reuseLease = sameAccount && singleGameSession.value?.id === previous.id
    if (!reuseLease) {
      prospectiveRelease = await acquireGameAccount(token.id)
      if (!preflightCurrent()) return null
      if (!prospectiveRelease) throw new Error('该账号已在其他游戏窗口打开')
    }
    await tokenStore.closeWebSocketConnection(token.id)

    if (!isolated && bytes?.byteLength) {
      await prepareSingleGameLaunch({ token, getArrayBuffer: () => bytes, localStorage })
    }
    if (!preflightCurrent()) return null
    const id = sessionNonce()
    const pending = switchAttempt ? { ...switchAttempt, phase: 'loading', sessionId: id } : null
    singleGameSwitch.value = pending
    if (previous && !reuseLease) await detachSingleGame()
    if (switchAttempt && singleGameSwitch.value !== pending) return null
    if (!tokenStore.gameTokens.some(entry => entry.id === token.id)) {
      if (pending) singleGameSwitch.value = { ...pending, phase: 'failed', failure: '未找到该账号的 BIN 数据' }
      return null
    }
    if (!reuseLease) {
      releaseAccount = prospectiveRelease
      prospectiveRelease = undefined
    }

    const src = nativeIOS ? null : isolated
      ? `${ANDROID_GAME_ORIGIN}/xyzw-game/android-single.html?${new URLSearchParams({ session: id })}`
      : `${import.meta.env.BASE_URL}game/index.html?${new URLSearchParams({ bin_id: token.id, android_no_scripts: '1' })}`
    if (!switchAttempt) tokenStore.selectTokenOnly(token.id)
    const session = {
      id, accountId: token.id, accountName: token.name, isolated, nativeIOS, src, binHex,
      scripts, scriptRevision, scriptError, scriptResults: {}, withoutScripts,
      stage: 'iframe', status: 'loading', revealed: false, timings: { bin: binMs },
      startedAt, openedAt: performance.now(), startupKind: switchAttempt ? 'switch' : hasOpenedSession ? 'relaunch' : 'first',
    }
    singleGameSession.value = session
    hasOpenedSession = true
    return session
  } finally {
    prospectiveRelease?.()
    changing = false
  }
}

export function reloadSingleGame(options) {
  const current = singleGameSession.value
  if (!current) return
  return openSingleGame({ id: current.accountId, name: current.accountName }, { ...options, restart: true, stagedFallback: true })
}
