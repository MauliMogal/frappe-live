import { state } from './store'
import { notesState } from './notes'
import { pins } from './pins'

// Prototype only: "Data: Filled | Empty" (Sketch pill), so every person's empty states can be seen,
// not just the New user's. Empty = the person you're viewing as has nothing yet: no tasks of their own
// or given to them, no notes, no notifications, no pins, and they're in no project (other people's
// projects are still there to join). Filled puts back everything as it was when you first chose Empty.
// (Changes made while on Empty don't carry over.)
const copy = (x: any) => JSON.parse(JSON.stringify(x))
let snap: any = null
let wasEmpty = false

function restore() {
  if (!snap) return
  state.tasks = copy(snap.tasks)
  state.notifications = copy(snap.notifications)
  state.projects = copy(snap.projects)
  notesState.notes = copy(snap.notes)
  Object.keys(pins).forEach((k) => delete pins[k])
  Object.assign(pins, copy(snap.pins))
}

export function applyDemoData(empty: boolean) {
  // Filled → Filled (e.g. switching person): leave the data alone, so nothing you made is lost
  if (!empty && !wasEmpty) return
  if (!snap) snap = { tasks: copy(state.tasks), notifications: copy(state.notifications), projects: copy(state.projects), notes: copy(notesState.notes), pins: copy(pins) }
  restore()
  wasEmpty = empty
  if (!empty) return
  const me = state.me
  const myProjects = state.projects.filter((p: any) => p.members.some((m: any) => m.user === me)).map((p: any) => p.id)
  // Projects they're in: they leave them. If nobody is left, the project goes too (nobody new owns a project).
  state.projects.forEach((p: any) => {
    p.members = p.members.filter((m: any) => m.user !== me)
    // No requests to join either
    p.joinRequests = (p.joinRequests || []).filter((r: any) => r.user !== me)
    p.projInvites = (p.projInvites || []).filter((r: any) => r.user !== me)
  })
  state.projects = state.projects.filter((p: any) => !myProjects.includes(p.id) || p.members.length)
  const live = new Set(state.projects.map((p: any) => p.id))
  state.tasks = state.tasks.filter(
    (t: any) => (t.space === 'general' || live.has(t.space)) && ![t.createdBy, t.assignee, t.assignedBy].includes(me) && !(t.space === 'general' && t.createdBy === me),
  )
  state.notifications = state.notifications.filter((n: any) => n.to !== me)
  notesState.notes = notesState.notes.filter((n: any) => n.owner !== me)
  pins[me] = []
}
