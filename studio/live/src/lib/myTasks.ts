import { computed, watch } from 'vue'
import dayjs from 'dayjs'
import { state, homeGroups, addTask } from './store'
import { org, currentWs, inScope, project, isSolo, waitingOn, isPersonalWs } from './store'
import { applyFilters, activeFilterCount, emptyFilters, sortTasks, groupTasks } from './taskView'
import { PRIORITY, prio, prioRank } from './meta'
import { isOverdue } from './dates'
import { views, filters, homeChip } from './viewState'
import { design } from './look'

// My tasks: which tasks show and how they're grouped (moved here from the prototype's pages/Home.vue, unchanged).
// Used by the page script (toolbar, empty states) and by components/MyTasksList.vue (the list itself),
// so both see the same groups.
//
// Workspaces on: My tasks follows the workspace you're in.
//   Personal → your personal tasks (no project) + the tasks in your personal projects. Only yours.
//   Company (Frappe) → the tasks given to you in that workspace's projects, all together.
// Group by: Needs attention (company default) · Due date (Personal default) · Status · Priority · Project · None.
export function useMyTasks() {
  const f = computed(() => filters.home)
  const open = (t: any) => t.status !== 'done'
  const daysOut = (t: any) => dayjs(t.due).diff(dayjs().startOf('day'), 'day')

  // C · Quick chips. One at a time; counts are for open work.
  const CHIPS: { key: string; label: string; test: (t: any) => boolean }[] = [
    { key: 'all', label: 'All', test: () => true },
    { key: 'overdue', label: 'Overdue', test: (t) => isOverdue(t) },
    { key: 'week', label: 'This week', test: (t) => open(t) && !!t.due && daysOut(t) >= 0 && daysOut(t) <= 7 },
    { key: 'urgent', label: 'High priority', test: (t) => open(t) && prioRank(t.priority) <= 2 },
    { key: 'nodate', label: 'No due date', test: (t) => open(t) && !t.due },
  ]
  const chipTest = computed(() => CHIPS.find((c) => c.key === homeChip.value)?.test || (() => true))
  // Quick tabs on the left of the toolbar (like CRM / Gameplan list views): All · Overdue · This week · No due date.
  // They only narrow the list (open work; All also keeps Done). Same for everyone, Personal or company workspace.
  const TABS = ['all', 'overdue', 'week', 'nodate']
  const tabs = computed(() => TABS.map((k) => ({ key: k, label: k === 'all' ? 'All tasks' : CHIPS.find((c) => c.key === k)!.label, count: k === 'all' ? undefined : chipCount(k) })))

  // B · Group by
  const GROUPS: Record<string, string> = { when: 'Due date', status: 'Status', priority: 'Priority', none: 'None' }
  const groupOptions = computed(() =>
    Object.entries(GROUPS).map(([value, label]) => ({ label, selected: f.value.groupBy === value, onClick: () => (f.value.groupBy = value) })),
  )

  // Workspaces on: My tasks follows the workspace you're in. Same idea in both: all your work here, stacked together.
  //   Personal → your personal tasks (no project) + the tasks in your personal projects (Round 246). Only yours.
  //   Company (Frappe) → the tasks given to you in that workspace's projects, all together (each row names its project).
  //   Personal tasks don't show there; they live in Personal.
  const inCompany = computed(() => org.on && !!currentWs.value && currentWs.value.kind !== 'personal')
  const raw = computed(() => {
    const r = homeGroups(null)
    if (!inCompany.value) {
      const mine = (l: any[]) => l.filter((t) => (t.space === 'general' && (!t.ws || isPersonalWs(t.ws))) || (isSolo(t.space) && inScope(project(t.space))))
      return { toReview: [], doNow: mine(r.doNow), next: mine(r.next), waiting: mine(r.waiting), done: mine(r.done) }
    }
    // + your own tasks in this workspace with no project (Raven posts, replies, demos): everyone has a My tasks here
    const here = (l: any[]) =>
      l.filter((t) => (t.space === 'general' ? t.ws === currentWs.value?.id : inScope(project(t.space)) && t.assignee === state.me))
    // Only your own work: reviews you owe show in your notifications, not here
    return { toReview: [], doNow: here(r.doNow), next: here(r.next), waiting: here(r.waiting), done: here(r.done) }
  })
  // Add rows make your own task in this workspace (a company's My tasks has them too)
  const addSpace = computed(() => 'general')
  // Project column, Project filter and Group by Project: whenever tasks here come from projects
  // (always in a company workspace; in Personal once you have a personal project with tasks)
  const showProjects = computed(() => inCompany.value || raw.value.doNow.concat(raw.value.next, raw.value.done).some((t: any) => t.space !== 'general'))
  const groupChoices = computed(() => [
    { value: 'attention', label: 'Needs attention' },
    { value: 'when', label: 'Due date' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    ...(showProjects.value ? [{ value: 'space', label: 'Project' }] : []),
    { value: 'none', label: 'None' },
  ])
  // Needs attention (Round 246, the default in a company workspace): what to do first, top to bottom.
  // Each task sits in the first group it fits: Overdue · Blocked (waiting on another task) · Due today · P1 · Everything
  // else (by due date) · Done. (No "review" group: reviews you owe are in your notifications.)
  const attention = computed(() => {
    const left = flat.value.filter((t) => t.status !== 'done')
    const take = (test: (t: any) => boolean) => {
      const hit = left.filter(test)
      hit.forEach((t) => left.splice(left.indexOf(t), 1))
      return hit
    }
    return [
      { key: 'overdue', label: 'Overdue', tasks: take((t) => isOverdue(t)) },
      { key: 'blocked', label: 'Blocked', tasks: take((t) => waitingOn(t).length > 0) },
      { key: 'today', label: 'Due today', tasks: take((t) => !!t.due && daysOut(t) === 0) },
      { key: 'p1', label: `${PRIORITY.p1?.short || 'P1'} · ${PRIORITY.p1?.label || 'Urgent'}`, tasks: take((t) => !!t.priority && prio(t.priority) === 'p1') },
      { key: 'rest', label: 'Everything else', tasks: sortTasks(left.slice(), 'due', 'asc') },
      { key: 'done', label: 'Done', tasks: flat.value.filter((t) => t.status === 'done'), collapsed: true },
    ].filter((x) => x.tasks.length)
  })
  const pipe = (l: any[]) => sortTasks(applyFilters(l.filter(chipTest.value), f.value), f.value.sort, f.value.dir)
  // "When" groups (the default): what needs you, then your open work by its deadline, then waiting and done.
  const g = computed(() => {
    const r = raw.value
    // (Company workspace: tasks you sent for review are still yours, so they sort by date with the rest)
    const mine = pipe([...r.doNow, ...r.next, ...(inCompany.value ? r.waiting : [])])
    const due = (k: string) =>
      mine.filter((t) => {
        if (!t.due) return k === 'none'
        if (isOverdue(t)) return k === 'overdue'
        const d = daysOut(t)
        return k === (d <= 0 ? 'today' : d <= 7 ? 'week' : 'later')
      })
    return {
      toReview: pipe(r.toReview),
      overdue: due('overdue'),
      today: due('today'),
      week: due('week'),
      later: due('later'),
      none: due('none'),
      waiting: pipe(r.waiting),
      done: pipe(r.done),
    }
  })
  // Every task once, for the other groupings and the board
  const flat = computed(() => {
    const r = raw.value
    const seen = new Set()
    const all = [...r.toReview, ...r.doNow, ...r.next, ...r.waiting, ...r.done].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    return pipe(all)
  })
  // Any grouping other than Due date: Status · Priority · Project · None (lib/taskView groupTasks)
  const groups = computed(() =>
    f.value.groupBy === 'when' ? [] : f.value.groupBy === 'attention' ? attention.value : groupTasks(flat.value, f.value.groupBy).filter((x) => x.tasks.length),
  )

  const filtering = computed(() => activeFilterCount(f.value) > 0 || homeChip.value !== 'all')
  const chipCount = (k: string) => {
    const r = raw.value
    const seen = new Set()
    const all = [...r.toReview, ...r.doNow, ...r.next, ...r.waiting, ...r.done].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    return applyFilters(all, f.value).filter(CHIPS.find((c) => c.key === k)!.test).length
  }
  const homeLabels = computed(() => [...new Set(flat.value.flatMap((t) => t.labels))].sort())
  function clearFilters() {
    filters.home = { ...emptyFilters(), sort: f.value.sort, dir: f.value.dir, groupBy: f.value.groupBy }
    homeChip.value = 'all'
  }
  const nothing = computed(() => !flat.value.length)
  const board = computed(() => views.home === 'board')

  // Variants → "Task list": the Frappe UI List versions (components/TaskListUI.vue), same groups as the list below
  const uiMode = computed(() =>
    design.group === 'uitable' ? 'table' : ['frappe', 'feed'].includes(design.group) ? (design.group as 'frappe' | 'feed') : null,
  )
  // Variants → "Task list" = Desk: a Frappe Desk style list (components/TaskDeskList.vue), same groups
  // (Sections and Desk sections were removed, Round 241)
  const desk = computed(() => design.group === 'desk')
  // Every group you can add to has its add row; the new task gets that group's date:
  // Today = today · Next 7 days = tomorrow · Later = in 8 days · No due date = none. (Not Overdue or Done:
  // a new task can't already be overdue or done.) The date can be changed right in the row after.
  // The add row shows that date already filled in (and a priority), both changeable before Enter.
  const addHome = (title: string, x: { priority: string | null; due: string | null }) => addTask({ title, space: 'general', assignee: state.me, priority: x.priority, due: x.due })
  const dayIso = (n: number) => dayjs().add(n, 'day').format('YYYY-MM-DD')
  const addRow = computed(() => addHome)
  // Empty groups stay (to add into) while nothing is filtered
  const canAddHere = computed(() => !filtering.value)
  const uiGroups = computed(() =>
    f.value.groupBy !== 'when'
      ? groups.value
      : [
      { key: 'overdue', label: 'Overdue', tasks: g.value.overdue },
      { key: 'today', label: 'Today', tasks: g.value.today, addInline: addRow.value, addDue: dayIso(0), keep: canAddHere.value },
      { key: 'week', label: 'Next 7 days', tasks: g.value.week, addInline: addRow.value, addDue: dayIso(1), keep: canAddHere.value },
      { key: 'later', label: 'Later', tasks: g.value.later, addInline: addRow.value, addDue: dayIso(8), keep: canAddHere.value },
      { key: 'none', label: 'No due date', tasks: g.value.none, addInline: addRow.value, addDue: null, keep: canAddHere.value },
      { key: 'done', label: 'Done', tasks: g.value.done, collapsed: true },
    ].filter((x: any) => x.tasks.length || x.keep),
  )

  return { f, CHIPS, tabs, GROUPS, groupOptions, inCompany, raw, addSpace, showProjects, groupChoices, attention, g, flat, groups, filtering, homeLabels, clearFilters, nothing, board, uiMode, desk, addRow, canAddHere, uiGroups }
}

// Start of the page, and whenever the workspace (or person) changes: default grouping, no Project filter, All tasks.
export function resetHome(inCompany: boolean) {
  filters.home.space = ''
  homeChip.value = 'all'
  filters.home.groupBy = inCompany ? 'attention' : 'when'
}
export function watchWorkspace(inCompany: any) {
  resetHome(inCompany.value)
  watch([inCompany, () => currentWs.value?.id, () => state.me], () => resetHome(inCompany.value))
}
