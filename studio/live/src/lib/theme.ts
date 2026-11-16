import { ref } from 'vue'

// Appearance: Light, Dark or System.
// Frappe UI themes everything from the data-theme attribute on <html>, so we only set that attribute.
// "System" hands control back: it restores whatever the host (Sketch, or the OS in a real app) had set.
// Light is the default. App.vue applies it on start.
export const theme = ref<'light' | 'dark' | 'system'>('light')
let hostTheme: string | null | undefined

export function setTheme(value: 'light' | 'dark' | 'system') {
  const root = document.documentElement
  if (hostTheme === undefined) hostTheme = root.getAttribute('data-theme')
  theme.value = value
  if (value === 'system') {
    if (hostTheme) root.setAttribute('data-theme', hostTheme)
    else {
      const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', dark ? 'dark' : 'light')
    }
    return
  }
  root.setAttribute('data-theme', value)
}
