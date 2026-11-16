import { computed, reactive } from 'vue'
import dayjs from 'dayjs'
import { toast } from 'frappe-ui'
import { state, project, task, updateTask, deleteTask, canTickSubtask, toggleChecklistItem, addSubtask, subtaskToTask, makeSubtask, personName, isSolo, milestoneTeam, setMilestonePeople } from './store'
import { can } from './permissions'
import { design } from './look'
import { placeCell } from './place'
import { dockedNow } from './panelLayout'
import { dueInfo } from './dates'
import { PRIORITY, PRIORITY_ORDER, prio } from './meta'

// The "Blocks" task list (Variants → "Task list" = Blocks): the same list as the other designs, drawn with Studio
// blocks — Frappe UI's List (List › ListGroup › ListRows › ListRow › ListCell), Dropdown, Button, Checkbox,
// FormControl — plus the existing StatusControl for the status cell. Nothing is lost:
//   · groups as the toolbar says, each with its count; fold any group (Done starts folded)
//   · Task · Project (when tasks come from projects) · Status · Priority · Due date · ⋯
//   · click a row: the task panel. Status, Priority and Due date change right in the row (same rules as the others)
//   · the subtask count opens the subtasks under the task: tick them, add one, turn one into a task
//   · ⋯: Open · Request a change · Copy link · Add a subtask · Make it a subtask of… · Delete
//   · an "Add a task" row in the groups you can add to (the new task gets that group's date)
// mode "project" (a project's Milestones tab): the first column is "Milestones" with the priority marker before
// each title (no Priority column), no Project column; each milestone group shows its date (late: red), % done, its
// team (change it with the people picker if you manage it) and a pencil to the milestone panel; Select turns on the
// List's checkboxes (the bulk bar is ProjectTaskList's).
// The page script spreads taskListBlocks(groups, …) into what it returns; the blocks bind to `bt…`.
const dotColor = (dot: string) => `var(--${dot.replace(/^bg-/, '')})`

export function taskListBlocks(o: {
  groups: () => any[]
  showProject: () => boolean
  router: any
  route: any
  mode?: 'home' | 'project'
  // project mode: the bulk selection and whether its checkboxes show
  selection?: { get: () => string[]; set: (ids: string[]) => void; on: () => boolean }
}) {
  const mode = o.mode || 'home'
  const ui = reactive({ folded: {} as Record<string, boolean>, subsOpen: {} as Record<string, boolean>, addingSub: null as string | null })
  const isFolded = (g: any) => ui.folded[g.key] ?? !!g.collapsed

  const taskRow = (t: any) => {
    const p = prio(t.priority)
    const due = dueInfo(t.due, t.status)
    const subsDone = t.checklist.filter((c: any) => c.done).length
    return {
      name: t.id,
      kind: 'task',
      task: t,
      title: t.title,
      titleColor: t.status === 'done' ? 'var(--ink-gray-5)' : 'var(--ink-gray-8)',
      titleLine: t.status === 'done' ? 'line-through' : 'none',
      hasSubs: t.checklist.length > 0,
      subLabel: `${subsDone}/${t.checklist.length}`,
      subIcon: ui.subsOpen[t.id] ? 'lucide-chevron-down' : 'lucide-chevron-right',
      // Project column: the project's folder, or for your own tasks the My tasks check (or nothing, Variants)
      project: placeCell(t).text,
      projectIcon: placeCell(t).icon,
      projectColor: placeCell(t).color,
      prioShort: t.priority ? PRIORITY[p].short : '–',
      prioWord: t.priority ? PRIORITY[p].label : 'No priority',
      prioDot: t.priority ? dotColor(PRIORITY[p].dot) : 'transparent',
      // My tasks: anyone who may edit; projects: whoever may change the brief (same rule as the other designs)
      canPrio: mode === 'project' ? can.editBrief(t) : can.edit(t) && t.status !== 'done',
      dueText: due?.text || 'Add date',
      dueColor: !due ? 'var(--ink-gray-4)' : due.tone === 'overdue' ? 'var(--ink-red-5)' : due.tone === 'soon' ? 'var(--ink-gray-9)' : 'var(--ink-gray-5)',
    }
  }
  const subRows = (t: any) => [
    ...t.checklist.map((c: any) => ({
      name: `${t.id}:${c.id}`,
      kind: 'sub',
      taskId: t.id,
      subId: c.id,
      title: c.text,
      done: !!c.done,
      canTick: canTickSubtask(t, c),
      canPromote: can.edit(t),
      titleColor: c.done ? 'var(--ink-gray-5)' : 'var(--ink-gray-8)',
      titleLine: c.done ? 'line-through' : 'none',
    })),
    ...(ui.addingSub === t.id ? [{ name: `${t.id}:+`, kind: 'addsub', taskId: t.id }] : []),
  ]

  const btGroups = computed(() =>
    o.groups().map((g: any) => {
      const folded = isFolded(g)
      return {
        key: g.key,
        label: g.label,
        count: String(g.tasks.length),
        chevron: folded ? 'lucide-chevron-right' : 'lucide-chevron-down',
        open: !folded,
        canAdd: !folded && !!g.addInline,
        addDue: g.addDue ?? null,
        // Milestone groups (projects): flag, date (late: red), % done, team, edit
        icon: g.icon || '',
        sub: g.sub || '',
        subColor: g.subLate ? 'var(--ink-red-5)' : 'var(--ink-gray-5)',
        pct: g.pct != null ? `${g.pct}% done` : '',
        isMilestone: !!g.m,
        editable: !!g.m && !!g.editable,
        team: g.m && g.pid && !isSolo(g.pid) ? milestoneTeam(g.pid, g.m.id) : [],
        teamNames: g.m && g.pid && !isSolo(g.pid) ? milestoneTeam(g.pid, g.m.id).slice(0, 3).map((u: string) => personName(u)) : [],
        projectPeople: g.pid ? (project(g.pid)?.members || []).map((m: any) => m.user) : [],
        showTeam: !!g.m && !!g.pid && !isSolo(g.pid),
        items: folded ? [] : g.tasks.flatMap((t: any) => [taskRow(t), ...(ui.subsOpen[t.id] || ui.addingSub === t.id ? subRows(t) : [])]),
      }
    }),
  )
  const groupOf = (key: string) => o.groups().find((g: any) => g.key === key)

  // Columns: Task · (Project) · Status · Priority · Due date · ⋯. Phones: Task · Due date · ⋯.
  // With a side panel docked the title keeps at least 12rem (the list scrolls sideways instead of hiding titles)
  const btColumns = computed(() => {
    const title = dockedNow.value ? 'minmax(12rem,1fr)' : 'minmax(0,1fr)'
    // Projects: Milestones · Status · Due date · ⋯
    if (mode === 'project') return { base: ['minmax(0,1fr)', '7rem', '2rem'], md: [title, '9rem', '8rem', '2rem'] }
    return {
      base: ['minmax(0,1fr)', '7rem', '2rem'],
      md: o.showProject() ? [title, '10rem', '9rem', '7rem', '8rem', '2rem'] : [title, '9rem', '7rem', '8rem', '2rem'],
    }
  })

  // The open task is the list's active row (a subtask row opens its task)
  const btActive = computed({
    get: () => (o.route?.query?.task ? String(o.route.query.task) : undefined),
    set: (v: string) => v && o.router.push({ query: { ...o.route.query, task: v.split(':')[0] } }),
  })

  function openTask(id: string) {
    o.router.push({ query: { ...o.route.query, task: id } })
  }
  const setDue = (id: string, d: string | null) => updateTask(id, { due: d })
  function btRowMenu(id: string) {
    const t: any = task(id)
    if (!t) return []
    const m: any[] = [{ label: 'Open', icon: 'lucide-panel-right-open', onClick: () => openTask(id) }]
    if (can.editDue(t))
      m.push({
        label: 'Due date',
        icon: 'lucide-calendar',
        submenu: [
          { label: 'Today', onClick: () => setDue(id, dayjs().format('YYYY-MM-DD')) },
          { label: 'Tomorrow', onClick: () => setDue(id, dayjs().add(1, 'day').format('YYYY-MM-DD')) },
          { label: 'Next week', onClick: () => setDue(id, dayjs().add(7, 'day').format('YYYY-MM-DD')) },
          ...(t.due ? [{ label: 'No date', icon: 'lucide-x', onClick: () => setDue(id, null) }] : []),
        ],
      })
    if (can.suggest(t)) m.push({ label: 'Request a change', icon: 'lucide-message-circle-question', onClick: () => (openTask(id), (state.ui.suggestTask = id)) })
    m.push({
      label: 'Copy link',
      icon: 'lucide-link',
      onClick: () => {
        navigator.clipboard?.writeText(`${location.origin}${location.pathname}?task=${id}`)
        toast.success('Link copied.')
      },
    })
    if (can.edit(t) && t.status !== 'done') m.push({ label: 'Add a subtask', icon: 'lucide-list-plus', onClick: () => btStartSub(id) })
    if (design.projAdd === 'planner' && t.space !== 'general' && can.edit(t)) {
      const others = state.tasks.filter((x: any) => x.space === t.space && x.id !== id && !x.deletedAt && x.status !== 'done')
      if (others.length)
        m.push({
          label: 'Make it a subtask of…',
          icon: 'lucide-corner-down-right',
          submenu: others.map((x: any) => ({ label: x.title, onClick: () => (makeSubtask(id, x.id), toast.success(`“${t.title}” is now a subtask of “${x.title}”.`)) })),
        })
    }
    if (can.remove(t))
      m.push({
        label: 'Delete',
        icon: 'lucide-trash-2',
        theme: 'red',
        onClick: () => {
          deleteTask(id)
          toast.success('Task deleted. You can restore it from Deleted tasks for 30 days.')
        },
      })
    return m
  }
  const btPrioMenu = (id: string) => {
    const t: any = task(id)
    return [
      ...PRIORITY_ORDER.map((p) => ({ label: `${PRIORITY[p].short} · ${PRIORITY[p].label}`, onClick: () => updateTask(id, { priority: p }) })),
      ...(t?.priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => updateTask(id, { priority: null }) }] : []),
    ]
  }

  function btStartSub(id: string) {
    ui.subsOpen[id] = true
    ui.addingSub = id
    setTimeout(() => (document.querySelector('[data-subadd] input') as HTMLInputElement | null)?.focus(), 50)
  }
  // Enter in an add row: read the field, add, empty it (the field isn't bound to a variable: one per row)
  function readField(e: any) {
    const el = e?.target as HTMLInputElement | undefined
    const v = (el?.value || '').trim()
    if (el) el.value = ''
    return v
  }
  function btSaveSub(id: string, e: any) {
    const v = readField(e)
    if (v) addSubtask(id, v)
  }
  function btAdd(key: string, e: any) {
    const g: any = groupOf(key)
    const v = readField(e)
    if (v && g?.addInline) g.addInline(v, { priority: null, due: g.addDue ?? null })
  }

  const btSelection = computed({ get: () => o.selection?.get() || [], set: (v: string[]) => o.selection?.set(v) })
  return {
    btGroups,
    btMode: mode,
    btFirstColumn: mode === 'project' ? 'Milestones' : 'Task',
    btSelectable: computed(() => !!o.selection?.on()),
    btSelection,
    btEditMilestone: (key: string) => {
      const g = groupOf(key)
      if (g?.m) state.ui.milestone = { pid: g.pid, id: g.m.id }
    },
    btSetTeam: (key: string, people: string[]) => {
      const g = groupOf(key)
      if (g?.m) setMilestonePeople(g.pid, g.m.id, people)
    },
    btColumns,
    btActive,
    btShowProject: computed(() => o.showProject()),
    btRowMenu,
    btPrioMenu,
    btToggleGroup: (key: string) => {
      const g = groupOf(key)
      if (g) ui.folded[key] = !isFolded(g)
    },
    btToggleSubs: (id: string) => (ui.subsOpen[id] = !ui.subsOpen[id]),
    btTickSub: (id: string, sub: string) => toggleChecklistItem(id, sub),
    btPromote: (id: string, sub: string) => {
      const nt = subtaskToTask(id, sub)
      if (nt) toast.success(`“${nt.title}” is now a task.`)
    },
    btSaveSub,
    btCancelSub: () => (ui.addingSub = null),
    btAdd,
  }
}
