import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { state } from './store'

// How the side panels (New task, task detail) sit on screen:
//   dock  — a column on the right; the page shrinks next to it (nothing is covered).
//   modal — centred over a dimmed page, once docking would squeeze the page below a readable width.
//   (phones: always modal, centred and as wide as the screen allows; never full screen)
// One width everywhere (list, board, project pages, docked or modal), so the panel never jumps in size.
// A board needs more room (four columns), so it docks only if the board keeps ~150px per column.
const { width } = useWindowSize()
const PANEL = 400 // the task panel, everywhere
const PAGE_MIN = 400 // a list must keep at least this much room next to the panel
const BOARD_MIN = 640 // a board must keep at least this much (4 columns × ~150px + gaps)
// How many boards are on screen (TaskBoard counts itself in and out).
export const boardsShown = ref(0)
export const panelWidth = computed(() => PANEL)
const sidebarWidth = computed(() => (state.ui.sidebarCollapsed ? 52 : 224))
// Modal width (when the panel can't dock): the same as docked; on a phone, the screen minus a margin.
export const modalWidth = computed(() => Math.min(PANEL, width.value - 32))
// True while a side panel is docked (set by AppFrame). Task lists and boards then tighten to fit.
export const dockedNow = ref(false)
export const panelMode = computed<'dock' | 'modal' | 'full'>(() => {
  if (width.value < 768) return 'modal'
  const need = boardsShown.value ? BOARD_MIN : PAGE_MIN
  return width.value - sidebarWidth.value - panelWidth.value >= need ? 'dock' : 'modal'
})
