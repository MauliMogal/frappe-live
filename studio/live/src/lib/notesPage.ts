import { reactive } from 'vue'
import { taskLines } from './notes'
import { toast } from 'frappe-ui'

// The Notes page: state shared by the page script (Studio blocks: the notes list, headers, the selection toolbar)
// and components/NoteEditor.vue (the rich text editor). Moved here from the prototype's pages/Notes.vue.
export const notesPage = reactive({
  // The notes sidebar can fold to a thin rail (desktop). Folded by default: the note gets the room.
  listOpen: false,
  // Selecting text in the note: a small toolbar where you let go of the mouse
  sel: null as { x: number; y: number; lines: string[] } | null,
  // Create tasks (the whole note with AI, or the selected lines): the panel beside the note (phones: a dialog)
  sendOpen: false,
  sendLines: [] as string[],
  sendAuto: false,
})

// Open Create tasks for a note: the selected lines, or every line of the note (with AI suggestions)
export function openSend(n: any, lines?: string[], autoAi = false) {
  if (!n) return
  notesPage.sendLines = lines || taskLines(n.body)
  if (!notesPage.sendLines.length) return toast.info('Write something first. Each line can become a task.')
  notesPage.sendAuto = autoAi
  notesPage.sendOpen = true
  notesPage.sel = null
}
