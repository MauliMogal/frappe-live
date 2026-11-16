import { watch, onBeforeUnmount, type Ref } from 'vue'

// Keyboard focus for side panels and dialogs (task panel, New task, milestone panel):
//   opening  remembers what had focus and moves focus into the panel (so keyboard and screen-reader users land in it)
//   trap     while trap() is true (the panel covers the page), Tab and Shift+Tab cycle inside it
//   closing  puts focus back where it was (the row or button that opened it)
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
const shown = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
export const focusablesIn = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown)

export function usePanelFocus(
  open: () => boolean,
  box: Ref<HTMLElement | null>,
  opts: { trap?: () => boolean; initial?: () => HTMLElement | null | undefined } = {},
) {
  let opener: HTMLElement | null = null
  let isOpen = false

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !opts.trap?.() || !box.value) return
    const a = document.activeElement as HTMLElement | null
    // Focus is in something the panel opened (a menu, a picker, a nested dialog): leave it alone
    if (a && a !== document.body && !box.value.contains(a)) return
    const list = focusablesIn(box.value)
    if (!list.length) return
    const first = list[0]
    const last = list[list.length - 1]
    if (e.shiftKey && (a === first || a === box.value || !a || a === document.body)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && a === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function giveBack() {
    document.removeEventListener('keydown', onKey, true)
    const o = opener
    const b = box.value
    opener = null
    isOpen = false
    // Only if focus fell to the page or is still inside the closing panel (it stays in the DOM while it slides out),
    // not when the person already clicked somewhere else
    setTimeout(() => {
      const a = document.activeElement
      if (o?.isConnected && (!a || a === document.body || !a.isConnected || b?.contains(a))) o.focus()
    }, 0)
  }

  watch(
    open,
    (v) => {
      if (v && !isOpen) {
        isOpen = true
        const a = document.activeElement as HTMLElement | null
        opener = a && a !== document.body ? a : null
        document.addEventListener('keydown', onKey, true)
        // After the slide-in has mounted it
        setTimeout(() => {
          if (!box.value || box.value.contains(document.activeElement)) return
          ;(opts.initial?.() || focusablesIn(box.value)[0] || box.value)?.focus()
        }, 60)
      } else if (!v && isOpen) giveBack()
    },
    { immediate: true },
  )
  onBeforeUnmount(() => isOpen && giveBack())
}
