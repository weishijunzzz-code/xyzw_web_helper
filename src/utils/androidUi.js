import { App } from '@capacitor/app'
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { isAndroidApp, isNativeGameApp } from './runtimePlatform'

const panels = '.n-modal, .n-drawer, .arco-modal, .arco-drawer, [data-mobile-escape]'
const closeControls = '.n-card-header__close, .n-dialog__close, .n-drawer-header__close, .arco-modal-close-btn, .arco-drawer-close-btn, [data-mobile-overlay-close]'
const AndroidUi = registerPlugin('AndroidUi')

function closeTopPanel() {
  let topPanel
  let highestZ = -Infinity
  for (const panel of document.querySelectorAll(panels)) {
    if (!panel.getClientRects().length || panel.closest('[inert], [aria-hidden="true"]')) continue
    let layer = panel
    while (layer && getComputedStyle(layer).zIndex === 'auto') layer = layer.parentElement
    const zIndex = layer ? Number(getComputedStyle(layer).zIndex) : 0
    if (zIndex >= highestZ) {
      topPanel = panel
      highestZ = zIndex
    }
  }
  if (!topPanel) return false

  const closeButton = [...topPanel.querySelectorAll(closeControls)].find(button => button.getClientRects().length)
  if (closeButton && !closeButton.matches(':disabled, [aria-disabled="true"]')) {
    closeButton.click()
  } else if (!closeButton) {
    // Let the component honor its own escape/close policy.
    topPanel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
  }
  return true
}

export function initNativeUi(router, getLandingPage, leaveGame) {
  if (!isNativeGameApp()) return

  const root = document.documentElement
  const android = isAndroidApp()
  const subscriptions = []
  let disposed = false
  let returning = false
  const report = error => console.warn('[Native UI]', error)
  function listen(registration) {
    registration.then(handle => {
      if (disposed) return handle.remove()
      subscriptions.push(handle)
    }).catch(report)
  }

  async function syncSystemBars() {
    const style = root.dataset.theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
    try {
      await SystemBars.setStyle({ style })
      if (android && !disposed && Capacitor.isPluginAvailable('AndroidUi')) {
        // Older WebViews leave these insets on the Android window instead of passing them to CSS.
        const color = getComputedStyle(root).getPropertyValue('--bg-primary').trim()
        if (color) await AndroidUi.setWindowSurface({ color })
      }
    } catch (error) {
      report(error)
    }
  }

  function keyboardShown() {
    root.setAttribute('data-native-keyboard', '')
  }
  function keyboardHidden() {
    root.removeAttribute('data-native-keyboard')
  }

  async function goBack({ canGoBack }) {
    if (returning) return
    returning = true
    try {
      if (root.hasAttribute('data-native-keyboard')) {
        await Keyboard.hide()
        return
      }
      if (closeTopPanel()) return
      if (router.currentRoute.value.name === 'GamePlayer') {
        await leaveGame()
        return
      }

      const landingPage = getLandingPage()
      if (router.currentRoute.value.path === landingPage) {
        await App.minimizeApp()
      } else if (canGoBack && window.history.state?.back) {
        router.back()
      } else {
        await router.replace(landingPage)
      }
    } catch (error) {
      report(error)
    } finally {
      returning = false
    }
  }

  syncSystemBars()
  window.addEventListener('theme-change', syncSystemBars)
  listen(App.addListener('appStateChange', ({ isActive }) => { if (isActive) syncSystemBars() }))
  if (android) listen(App.addListener('backButton', goBack))
  listen(Keyboard.addListener('keyboardWillShow', keyboardShown))
  listen(Keyboard.addListener('keyboardDidHide', keyboardHidden))

  return () => {
    disposed = true
    keyboardHidden()
    window.removeEventListener('theme-change', syncSystemBars)
    for (const handle of subscriptions) handle.remove().catch(report)
  }
}
