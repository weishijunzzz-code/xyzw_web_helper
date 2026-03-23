import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'

const messages = {
  zh,
  en
}

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'zh',
  fallbackLocale: 'zh',
  messages
})

export default i18n

// 语言切换工具
export const setLocale = (locale) => {
  i18n.global.locale.value = locale
  localStorage.setItem('locale', locale)
  document.documentElement.lang = locale
}

export const getLocale = () => {
  return i18n.global.locale.value
}

export const toggleLocale = () => {
  const current = getLocale()
  const next = current === 'zh' ? 'en' : 'zh'
  setLocale(next)
  return next
}
