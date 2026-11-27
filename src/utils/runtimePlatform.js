import { Capacitor } from '@capacitor/core'

export function isAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function isIOSApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export function isNativeGameApp() {
  return isAndroidApp() || isIOSApp()
}

export function initRuntimePlatform() {
  document.documentElement.dataset.platform = Capacitor.getPlatform()
  document.body.classList.toggle('capacitor-app', Capacitor.isNativePlatform())
}
