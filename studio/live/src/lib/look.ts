import { reactive } from 'vue'

// Design decisions. Every list, row and badge reads from here.
// Only the Project page (manage | classic) is still compared in the Variants pill; the rest are decided.
export const design = reactive({
  group: 'frappe', // Task list (Variants pill; default for now: Table): gridRoomy (Roomy) | table (List) | frappe | feed | uitable (the last three: only Frappe UI List, TaskListUI.vue)
  flags: 'below', // Flags under the title
  color: 'mono', // Monochrome badges (blocked stays red)
  addRow: 'inline', // A blank "Add a task" row at the top of lists and the To do column (hide with ×)
  projList: 'table', // Projects page, List view: table (reference) | grid (spreadsheet)
  projCard: 'folder', // Projects page: folders only (decided)
  projAdd: 'planner', // Adding in projects: Planner (decided): New milestone ▾, add-milestone row, + Subtask on rows, import
  taskForm: 'rows', // New task panel: Rows (decided), compact property rows
  board: 'detailed', // Board (kanban): Detailed (decided): milestone name + subtask progress on cards
  search: 'key', // Search bar (SearchField): Key hint (decided): outlined, a little taller, "/" jumps in
  overview: 'milestones', // Project overview: Milestones (decided): About band, small stats, milestone list with Needs attention
  notes: 'smart', // Notes page: smart (decided; the simple version was removed)
  stats: 'compare', // Overview key numbers: compare (decided; the others were removed)
  about: 'banner', // Overview About: banner (decided; the others were removed)
  workload: 'stacked', // Overview Workload (default: stacked): bars | stacked (BarChart) | donut (DonutChart) | share (split bars)
  planChart: 'area', // Planned vs actual (default: area): line (LineChart) | area (AreaChart)
  projWidth: 'full', // Decided: full width everywhere (pill removed) Project page content: full (edge to edge) | centred (max width, space on both sides)
  tableGroup: 'heading', // Task list = Table: group headers (default for now: heading): label | bar | heading | rule
  msBar: 'inline', // Milestone bar: inline (rename, date, assigned to right on the bar) | edit (pencil → milestone panel)
  emptyValue: 'notset', // New task, empty property values: notset ("Not set") | dash ("—")

  aiCard: 'edit', // Notes AI suggestions list: edit | groups | focus | table
  chips: 'view', // Project Tasks tab quick filters: view (one dropdown) | problems (All|Mine + only problems that exist)
  taskPanel: 'rows', // New task + task detail share one layout: rows (decided; the others were removed)
  msStrip: 'cards', // Overview "Path" milestone strip: cards | steps | rows
  panel: 'crm', // Slide panels (task, New task, milestone rows), default crm (Frappe CRM style: collapsible sections, plain rows) | rows
  ovLayout: 'focus', // Project Overview layout: focus | split | path | digest | current (see OverviewMilestones.vue)
  notifList: 'full', // Notifications pop-up list (Variants pill, Frappe UI List): full (default) | inset | none (Feed, by divider) | table
  taskSearch: 'on', // List toolbar (FilterSortBar, Variants "Filter bar"): on ("Search tasks" first, default) | off (no search box)
  noteList: 'title', // Notes list (Variants "Notes list"): title (default, Round 252) | preview (first line under the title)
  notePanel: 'grouped', // Notes → Create tasks (Variants "Create tasks", Round 245): grouped (under where they go) | onePlace ("Add to" for all) | oneByOne (a card each)
  noteAdd: 'bar', // Notes → Create tasks panel, where "Add N tasks" sits (Variants "Add button"): bar | header | inline
  ownPlace: 'icon', // Project column for your own tasks (no project) (Variants "Own tasks in lists"): icon (My tasks, with its check icon) | blank
  projPage: 'manage', // Project page: manage (Overview · Tasks · Timeline tabs) | classic (insights + views)
})

// Table header "collapse all / expand all". Groups watch `tick` and follow `open`.
export const listToggle = reactive({ open: true, tick: 0 })
export function toggleAllGroups() {
  listToggle.open = !listToggle.open
  listToggle.tick++
}

const LABEL_THEMES = ['blue', 'green', 'amber', 'violet', 'red']
function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Badge theme for a flag or label. Monochrome: grey. Minimal colour: colour only where it means something.
export function toneFor(kind: 'changes' | 'suggested' | 'blocked' | 'label', label = '') {
  if (kind === 'blocked') return 'red'
  if (design.color !== 'color') return 'gray'
  if (kind === 'changes') return 'amber'
  if (kind === 'suggested') return 'blue'
  return LABEL_THEMES[hash(label) % LABEL_THEMES.length]
}
export const labelVariant = () => (design.color === 'color' ? 'subtle' : 'outline')
