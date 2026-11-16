import { computed } from 'vue'
import { toast } from 'frappe-ui'
import { state, prefs } from './store'
import { design } from './look'

// The quick add row shows when the "Inline row" design is on and the person hasn't hidden it.
// Hiding sticks (it's a preference), and Settings → Appearance turns it back on.
export const showAddRow = computed(
  () => design.addRow === 'inline' && state.settings[state.me]?.quickAddRow !== false,
)

export function setAddRow(on: boolean) {
  prefs().quickAddRow = on
}

export function hideAddRow() {
  setAddRow(false)
  toast.success('Add row hidden. Turn it on in Settings → Appearance.', {
    action: { label: 'Undo', onClick: () => setAddRow(true) },
  })
}
