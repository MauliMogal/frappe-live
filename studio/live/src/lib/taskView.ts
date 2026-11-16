import dayjs from 'dayjs'
import { state, personName, withWhom, submittedAt, spaceName, person, milestonesOf } from './store'
import { isOverdue, waited, waitedDays } from './dates'
import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, prioRank, prio } from './meta'

// The words that explain my relation to a task: "from Sadiq", "for Vasu", "with Neha · 1 day".
export function relation(t: any) {
  const me = state.me
  if (t.status === 'review' && t.reviewer === me && t.assignee !== me) {
    return { text: `from ${personName(t.assignee)} · ${waited(submittedAt(t))}`, strong: waitedDays(submittedAt(t)) >= 2 }
  }
  if (t.status === 'review' && t.assignee === me) {
    return { text: `with ${personName(t.reviewer)} · ${waited(submittedAt(t))}`, strong: waitedDays(submittedAt(t)) >= 2 }
  }
  if (t.status === 'done' && !t.reviewer && t.assignedBy === me && t.assignee && t.assignee !== me && !t.ack) {
    return { text: `${personName(t.assignee)} finished this · have a look`, strong: true }
  }
  if (t.assignee === me && t.assignedBy && t.assignedBy !== me) {
    return { text: `from ${personName(t.assignedBy)}`, strong: false }
  }
  if (t.assignedBy === me && t.assignee && t.assignee !== me) {
    return { text: `for ${personName(t.assignee)}`, strong: false }
  }
  if (!t.assignee) return { text: 'Open · anyone can pick it up', strong: false }
  return null
}

export type Filters = {
  q: string
  origin: string
  space: string
  assignee: string
  status: string
  due: string
  priority: string
  label: string
  sort: string
  dir: string
  groupBy: string
}

export const emptyFilters = (): Filters => ({
  q: '',
  origin: '',
  space: '',
  assignee: '',
  status: '',
  due: '',
  priority: '',
  label: '',
  sort: 'due',
  dir: 'asc',
  groupBy: 'status',
})

// Search (q) counts as a filter too, so "No tasks match · Clear filters" also clears it
export const activeFilterCount = (f: Filters) =>
  ['q', 'origin', 'space', 'assignee', 'status', 'due', 'priority', 'label'].filter((k) => (f as any)[k]).length

// Sort fields, and which way each one reads first (the arrow button flips it):
// Due date: soonest first · Priority: P1 first · Created / Last updated: newest first · Title: A→Z
export const SORTS: Record<string, string> = { due: 'Due date', priority: 'Priority', created: 'Created', updated: 'Last updated', title: 'Title' }
export const SORT_DIR: Record<string, 'asc' | 'desc'> = { due: 'asc', priority: 'asc', created: 'desc', updated: 'desc', title: 'asc' }

// "Assigned to me" = someone else gave it to me. "Made by me" = I created it for myself.
export const isAssignedToMe = (t: any) => t.assignee === state.me && !!t.assignedBy && t.assignedBy !== state.me
export const isMadeByMe = (t: any) => t.createdBy === state.me && (t.assignee === state.me || !t.assignee)

export const originOptions = [
  { label: 'All tasks', value: '' },
  { label: 'Assigned to me', value: 'assigned' },
  { label: 'Made by me', value: 'own' },
  { label: 'My tasks (no project)', value: 'general' },
]

export function applyFilters(list: any[], f: Filters) {
  const q = (f.q || '').trim().toLowerCase()
  return list.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q)) return false
    if (f.origin === 'assigned' && !isAssignedToMe(t)) return false
    if (f.origin === 'own' && !isMadeByMe(t)) return false
    // General = tasks with no project.
    if (f.origin === 'general' && t.space !== 'general') return false
    if (f.space && t.space !== f.space) return false
    if (f.assignee === '__none' && t.assignee) return false
    if (f.assignee && f.assignee !== '__none' && t.assignee !== f.assignee) return false
    if (f.status && t.status !== f.status) return false
    if (!f.status && t.status === 'cancelled') return false
    if (f.priority && (t.priority ? prio(t.priority) : '') !== f.priority) return false
    if (f.label && !t.labels.includes(f.label)) return false
    if (f.due === 'overdue' && !isOverdue(t)) return false
    if (f.due === 'today' && !(t.due && dayjs(t.due).isSame(dayjs(), 'day'))) return false
    if (f.due === 'week' && !(t.due && dayjs(t.due).diff(dayjs().startOf('day'), 'day') <= 7 && dayjs(t.due).diff(dayjs().startOf('day'), 'day') >= 0)) return false
    if (f.due === 'none' && t.due) return false
    return true
  })
}

const PRI = (p: string) => prioRank(p)

// Priority first (P1 → P5), then deadline. Used inside every Home group.
export const byPriority = (a: any, b: any) => PRI(a.priority) - PRI(b.priority) || (a.due || '9999').localeCompare(b.due || '9999')

// dir: 'asc' | 'desc' (left out = that field's usual way, SORT_DIR). Tasks with no date / no priority stay last either way.
export function sortTasks(list: any[], sort: string, dir?: string) {
  const l = [...list]
  const d = (dir || SORT_DIR[sort] || 'asc') === 'desc' ? -1 : 1
  if (sort === 'priority') return l.sort((a, b) => (!a.priority !== !b.priority ? (a.priority ? -1 : 1) : d * (PRI(a.priority) - PRI(b.priority)) || (a.due || '9999').localeCompare(b.due || '9999')))
  if (sort === 'updated') return l.sort((a, b) => d * (a.updatedAt || a.createdAt).localeCompare(b.updatedAt || b.createdAt))
  if (sort === 'created') return l.sort((a, b) => d * a.createdAt.localeCompare(b.createdAt))
  if (sort === 'title') return l.sort((a, b) => d * a.title.localeCompare(b.title))
  return l.sort((a, b) => (!a.due !== !b.due ? (a.due ? -1 : 1) : d * (a.due || '').localeCompare(b.due || '')) || PRI(a.priority) - PRI(b.priority))
}

// Group by (the toolbar's "Group by"): status · priority · assignee · due · space (project) · milestone · none.
// Done work sits in its own collapsed group at the end for priority / project / milestone (status already has Done).
export function groupTasks(list: any[], groupBy: string) {
  if (groupBy === 'none') return [{ key: 'all', label: 'All tasks', tasks: list, collapsed: false }]
  const open = list.filter((t) => t.status !== 'done')
  const done = { key: 'done', label: 'Done', tasks: list.filter((t) => t.status === 'done'), collapsed: true }
  if (groupBy === 'priority') {
    return [
      ...PRIORITY_ORDER.map((p) => ({ key: p, label: `${PRIORITY[p].short} · ${PRIORITY[p].label}`, tasks: open.filter((t) => t.priority && prio(t.priority) === p), collapsed: false })),
      { key: 'nopri', label: 'No priority', tasks: open.filter((t) => !t.priority), collapsed: false },
      done,
    ]
  }
  if (groupBy === 'space') {
    const keys = [...new Set(open.map((t) => t.space))]
    return [...keys.map((k) => ({ key: k, label: spaceName(k), tasks: open.filter((t) => t.space === k), collapsed: false })).sort((a, b) => a.label.localeCompare(b.label)), done]
  }
  if (groupBy === 'milestone') {
    const pid = list[0]?.space
    const ms = pid ? milestonesOf(pid) : []
    return [
      ...ms.map((m: any) => ({ key: m.id, label: m.name, tasks: open.filter((t) => t.milestone === m.id), collapsed: false })),
      { key: 'nomile', label: 'No milestone', tasks: open.filter((t) => !t.milestone || !ms.some((m: any) => m.id === t.milestone)), collapsed: false },
      done,
    ]
  }
  if (groupBy === 'assignee') {
    const keys = [...new Set(list.map((t) => t.assignee || '__none'))]
    return keys
      .map((k) => ({
        key: k,
        label: k === '__none' ? 'Unassigned' : k === state.me ? `${personName(k)} (you)` : personName(k),
        tasks: list.filter((t) => (t.assignee || '__none') === k),
        collapsed: false,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }
  if (groupBy === 'due') {
    const bucket = (t: any) => {
      if (!t.due) return 'none'
      if (isOverdue(t)) return 'overdue'
      const d = dayjs(t.due).diff(dayjs().startOf('day'), 'day')
      if (d <= 0) return 'today'
      if (d <= 7) return 'week'
      return 'later'
    }
    const order = [
      ['overdue', 'Overdue'],
      ['today', 'Today'],
      ['week', 'This week'],
      ['later', 'Later'],
      ['none', 'No due date'],
    ]
    return order.map(([k, label]) => ({ key: k, label, tasks: list.filter((t) => bucket(t) === k), collapsed: false }))
  }
  // The five statuses, in order. Empty groups are skipped by the page.
  return STATUS_ORDER.map((s) => ({
    key: s,
    label: STATUS[s].label,
    tasks: list.filter((t) => t.status === s),
    collapsed: s === 'done',
  }))
}

export const statusOptions = STATUS_ORDER.map((value) => ({ label: STATUS[value].label, value }))
export const priorityOptions = PRIORITY_ORDER.map((value) => ({ label: `${PRIORITY[value].short} · ${PRIORITY[value].label}`, value }))

export { spaceName, withWhom, person }
