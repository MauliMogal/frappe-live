import { inject, computed } from 'vue'
import { design } from './look'
import { dockedNow } from './panelLayout'

// The shape of a task list, shared by its header rows and task rows so the columns always line up.
// Pages set it with provide():
//   showAssignee (default true): Home turns it off. General tasks are yours, so the column says nothing.
//   rowSelection: { ids, toggle, setMany } when the page has bulk actions (projects). Table layouts then
//   show checkboxes; pages without bulk actions get no dead checkboxes.
//   priorityColumn: Home has a Priority column. Project lists have no Progress column (removed): Task · Status · Deadline · Assignee.
// Layouts (Variants → "Task list"), all with one column header at the top:
//   grid:   Spreadsheet (GitHub Projects style): row numbers, gridlines around every cell, 32px rows.
//   table:  Frappe UI list (as in CRM): tight rows, a thin line under each, no cell lines.
//   single: One header (Craftboard reference): rounded grey group bars, icon header, lines between cells.
//   sheet:  each group its own bordered sheet.
export function useListShape() {
  const showAssignee = inject<boolean>('showAssignee', true)
  const sel = inject<any>('rowSelection', null)
  const priorityCol = inject<boolean>('priorityColumn', false)
  // grid: Spreadsheet. roomy: Spreadsheet, roomier — same structure, no lines between cells, 44px rows, more padding.
  // The Frappe List options (uitable · frappe · feed) draw My tasks and Milestones themselves (TaskListUI.vue); any other
  // list still built from TaskRow (e.g. Deleted tasks) keeps the Roomy shape then.
  const roomy = computed(() => ['gridRoomy', 'uitable', 'frappe', 'feed'].includes(design.group))
  const grid = computed(() => design.group === 'grid' || roomy.value)
  const boxed = computed(() => design.group === 'single')
  const table = computed(() => design.group === 'table' || boxed.value)
  // One column header at the top of the list, never repeated per group.
  const single = computed(() => table.value || grid.value)
  // check: the List layout's first column. It holds the row number (like the spreadsheet), not a checkbox.
  const check = computed(() => table.value)
  // A side panel is open: project lists drop the Progress column and show the assignee as an avatar,
  // so the table fits beside the panel instead of running under it. (Home keeps its 4 columns.)
  const narrow = computed(() => dockedNow.value)
  // Literal class strings (Tailwind needs to see them whole).
  const cols = computed(() => {
    // Home (Priority column, no Assignee): keep all four columns, just tighter.
    if (narrow.value && priorityCol) {
      if (roomy.value) return 'md:grid-cols-[1.5rem_minmax(10rem,1fr)_8rem_4.5rem_6.5rem_2.5rem]'
      if (grid.value) return 'md:grid-cols-[2.5rem_minmax(10rem,1fr)_8rem_4.5rem_6.5rem_2rem]'
      if (boxed.value) return 'md:grid-cols-[minmax(10rem,1fr)_8rem_4.5rem_6.5rem_2.75rem]'
      if (!table.value) return 'md:grid-cols-[minmax(10rem,1fr)_8rem_4.5rem_6.5rem_1.75rem]'
      return 'md:grid-cols-[1.5rem_minmax(10rem,1fr)_8rem_4.5rem_6.5rem_1.75rem]'
    }
    if (narrow.value) {
      if (roomy.value) return 'md:grid-cols-[3rem_minmax(12rem,1fr)_9rem_7rem_3rem_2.5rem]'
      if (grid.value) return 'md:grid-cols-[2.5rem_minmax(12rem,1fr)_8.5rem_7rem_3rem_2rem]'
      if (boxed.value) return check.value ? 'md:grid-cols-[2.75rem_minmax(12rem,1fr)_9rem_7rem_3rem_2.75rem]' : 'md:grid-cols-[minmax(12rem,1fr)_9rem_7rem_3rem_2.75rem]'
      if (!table.value) return 'md:grid-cols-[minmax(12rem,1fr)_8.5rem_7rem_3rem_1.75rem]'
      return check.value ? 'md:grid-cols-[1.5rem_minmax(12rem,1fr)_9rem_7rem_3rem_1.75rem]' : 'md:grid-cols-[minmax(12rem,1fr)_9rem_7rem_3rem_1.75rem]'
    }
    // My tasks: a narrow number column, so the Task title, the add row and the task titles line up with the group names
    if (roomy.value && priorityCol) return 'md:grid-cols-[1.5rem_minmax(14rem,1fr)_9.5rem_9rem_8rem_2.5rem]'
    if (roomy.value)
      return showAssignee
        ? 'md:grid-cols-[3rem_minmax(14rem,1fr)_9.5rem_8rem_10rem_2.5rem]'
        : 'md:grid-cols-[3rem_minmax(14rem,1fr)_9.5rem_9rem_8rem_2.5rem]'
    if (grid.value)
      return showAssignee
        ? 'md:grid-cols-[2.5rem_minmax(14rem,1fr)_8.5rem_7rem_9rem_2rem]'
        : 'md:grid-cols-[2.5rem_minmax(14rem,1fr)_8.5rem_8rem_7rem_2rem]'
    if (boxed.value) {
      if (check.value)
        return showAssignee
          ? 'md:grid-cols-[2.75rem_minmax(14rem,1fr)_9.5rem_8rem_10rem_2.75rem]'
          : 'md:grid-cols-[2.75rem_minmax(14rem,1fr)_9.5rem_9.5rem_8rem_2.75rem]'
      return showAssignee
        ? 'md:grid-cols-[minmax(14rem,1fr)_9.5rem_8rem_10rem_2.75rem]'
        : 'md:grid-cols-[minmax(14rem,1fr)_9.5rem_9.5rem_8rem_2.75rem]'
    }
    if (!table.value)
      return showAssignee
        ? 'md:grid-cols-[minmax(14rem,1fr)_8.5rem_7rem_9rem_1.75rem]'
        : 'md:grid-cols-[minmax(14rem,1fr)_8.5rem_8.5rem_7rem_1.75rem]'
    if (check.value)
      return showAssignee
        ? 'md:grid-cols-[1.5rem_minmax(14rem,1fr)_9.5rem_8rem_10rem_1.75rem]'
        : 'md:grid-cols-[1.5rem_minmax(14rem,1fr)_9.5rem_9.5rem_8rem_1.75rem]'
    return showAssignee
      ? 'md:grid-cols-[minmax(14rem,1fr)_9.5rem_8rem_10rem_1.75rem]'
      : 'md:grid-cols-[minmax(14rem,1fr)_9.5rem_9.5rem_8rem_1.75rem]'
  })
  const rowClass = computed(() => {
    if (roomy.value) return 'h-11 border-x border-b border-outline-gray-1'
    if (grid.value) return 'h-8 border-x border-b border-outline-gray-2 md:divide-x md:divide-outline-gray-2'
    if (boxed.value) return 'h-11 border-b border-outline-gray-1 md:divide-x md:divide-outline-gray-1'
    if (table.value) return 'h-9 gap-x-4 border-b border-outline-gray-1 px-2'
    return 'h-11 gap-x-4 px-3'
  })
  const cellClass = computed(() => (roomy.value ? 'h-full px-3' : grid.value ? 'h-full px-2' : boxed.value ? 'h-full px-3' : ''))
  return { showAssignee, sel, priorityCol, table, grid, roomy, boxed, single, check, narrow, cols, rowClass, cellClass }
}
