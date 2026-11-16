import { reactive, computed } from 'vue'
import dayjs from 'dayjs'
import { state, project, isMember, milestonesOf, milestone, milestoneStatus, milestoneStats, milestoneTeam, taskPeople, addTask, isSolo } from './store'
import { applyFilters, sortTasks, groupTasks, emptyFilters, activeFilterCount } from './taskView'
import { prioRank } from './meta'
import { isOverdue } from './dates'
import { design } from './look'
import { can } from './permissions'

// A project's page: state shared by the page script (Studio blocks: header, tabs, toolbar, banners) and
// components/ProjectTaskList.vue (the milestone task list). Moved here from the prototype's pages/Project.vue.
// The layout is the decided one: Manage (Overview · Milestones · Timeline) with Planner adding (New milestone ▾,
// add-milestone row, + Subtask on rows). The Classic layout was never reachable, so it was left out.
export const projectView = reactive({
  // Grouped by milestone unless Group by says otherwise (Milestone · Status · Priority · Assignee · Due date · None)
  f: { ...emptyFilters(), groupBy: 'milestone' } as any,
  // The toolbar's "Show" preset
  chip: 'all',
  // Opened from a milestone on the Overview (or ?ms=<id>): only that milestone
  focusMs: null as string | null,
  // Select (Frappe UI List designs): checkboxes on; the picked task ids
  uiSelecting: false,
  selection: [] as string[],
  // The header's People pop-up. Shared (not a page ref) so ?people=1 still opens it when moving inside the app sets
  // the page up twice: the copy that reads the link and the copy on screen both see it
  peopleOpen: false,
})

export function resetProjectView() {
  projectView.f = { ...emptyFilters(), groupBy: 'milestone' }
  projectView.chip = 'all'
  projectView.focusMs = null
  projectView.peopleOpen = false
  clearSelection()
}
export function clearSelection() {
  projectView.selection = []
  projectView.uiSelecting = false
  state.ui.selecting = false
}

// Everything the page and the list compute from a project's tasks. `pid` is a getter (the route's id).
export function useProjectTasks(pid: () => string) {
  const p = computed(() => project(pid()))
  const member = computed(() => isMember(pid()))
  const archived = computed(() => p.value?.status === 'archived')
  const solo = computed(() => isSolo(pid()))
  const all = computed(() => state.tasks.filter((t: any) => t.space === pid() && !t.deletedAt))

  const isMine = (t: any) =>
    taskPeople(t).includes(state.me) || t.checklist.some((c: any) => c.assignee === state.me) || (t.reviewer === state.me && t.status === 'review')
  const CHIPS: { key: string; label: string; test: (t: any) => boolean }[] = [
    { key: 'all', label: 'All', test: () => true },
    { key: 'mine', label: 'Mine', test: isMine },
    { key: 'overdue', label: 'Overdue', test: (t) => isOverdue(t) },
    { key: 'unassigned', label: 'Unassigned', test: (t) => !taskPeople(t).length && t.status !== 'done' },
    { key: 'urgent', label: 'High priority, not started', test: (t) => prioRank(t.priority) <= 2 && (t.status === 'todo' || t.status === 'backlog') },
    {
      key: 'atrisk',
      label: 'At-risk milestones',
      test: (t) => t.status !== 'done' && !!t.milestone && ['risk', 'late'].includes(milestoneStatus(pid(), milestone(pid(), t.milestone) || { id: '' })),
    },
  ]
  const chipCount = (k: string) => all.value.filter(CHIPS.find((c) => c.key === k)!.test).length
  // Personal project: nobody else is in it, so no Mine / Unassigned and no Assignee anywhere
  const presets = computed(() =>
    CHIPS.filter((c) => !(solo.value && ['mine', 'unassigned'].includes(c.key))).map((c) => ({
      key: c.key,
      label: c.key === 'all' ? 'All tasks' : c.label,
      count: c.key === 'all' ? undefined : chipCount(c.key),
    })),
  )
  const groupChoices = computed(() =>
    [
      { value: 'milestone', label: 'Milestone' },
      { value: 'status', label: 'Status' },
      { value: 'priority', label: 'Priority' },
      { value: 'assignee', label: 'Assignee' },
      { value: 'due', label: 'Due date' },
      { value: 'none', label: 'None' },
    ].filter((g) => !(solo.value && g.value === 'assignee')),
  )
  const taskFields = computed(() => (solo.value ? ['status', 'priority', 'due', 'label'] : ['assignee', 'status', 'priority', 'due', 'label']))
  const members = computed(() => p.value?.members.map((m: any) => m.user) || [])
  const labels = computed(() => [...new Set(all.value.flatMap((t: any) => t.labels))])

  const filtered = computed(() => {
    const test = CHIPS.find((c) => c.key === projectView.chip)?.test || (() => true)
    return sortTasks(applyFilters(all.value.filter(test), projectView.f), projectView.f.sort, projectView.f.dir)
  })
  const groups = computed(() => groupTasks(filtered.value, projectView.f.groupBy).filter((g: any) => g.tasks.length))
  const ms = computed(() => milestonesOf(pid()))
  const byMilestone = computed(() => {
    if (projectView.focusMs)
      return ms.value.filter((m: any) => m.id === projectView.focusMs).map((m: any) => ({ m, tasks: filtered.value.filter((t: any) => t.milestone === m.id) }))
    // (No "No milestone" bucket: in a project every task is in a milestone)
    return ms.value.map((m: any) => ({ m, tasks: filtered.value.filter((t: any) => t.milestone === m.id) }))
  })
  // Variants → "Task list": Frappe UI List designs (TaskListUI) and Desk (TaskDeskList), one group per milestone
  const uiMode = computed(() => (design.group === 'uitable' ? 'table' : ['frappe', 'feed'].includes(design.group) ? (design.group as 'frappe' | 'feed') : null))
  const desk = computed(() => design.group === 'desk')
  // Add row in each milestone: the task goes straight in; the milestone's team does it
  const addIn = (mid: string) => (title: string, x: { priority: string | null; due: string | null }) =>
    addTask({ title, space: pid(), assignee: null, priority: x.priority, due: x.due, milestone: mid })
  const uiGroups = computed(() =>
    projectView.f.groupBy !== 'milestone'
      ? groups.value
      : byMilestone.value
          .map((x: any) => {
            const m = x.m
            const s = milestoneStats(pid(), m.id)
            const st = milestoneStatus(pid(), m)
            return {
              key: m.id,
              label: m.name,
              icon: 'lucide-flag-triangle-right',
              sub: m.due ? (st === 'reached' ? 'Completed' : dayjs(m.due).format(dayjs(m.due).year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')) : '',
              subLate: st === 'late',
              pct: s.total ? s.pct : null,
              people: milestoneTeam(pid(), m.id),
              tasks: x.tasks,
              addInline: archived.value || !member.value ? undefined : addIn(m.id),
              m,
              pid: pid(),
              editable: can.manageMilestones(pid(), m) && !archived.value,
            }
          }),
  )
  const filtering = computed(() => projectView.chip !== 'all' || activeFilterCount(projectView.f) > 0)

  return { p, member, archived, solo, all, presets, groupChoices, taskFields, members, labels, filtered, groups, ms, byMilestone, uiMode, desk, uiGroups, filtering }
}
