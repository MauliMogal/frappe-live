import { reactive, computed } from 'vue'
import { toast } from 'frappe-ui'
import dayjs from 'dayjs'
import { people as seedPeople } from '../mock/people'
import { projects as seedProjects, invites as seedInvites } from '../mock/projects'
import { tasks as seedTasks } from '../mock/tasks'
import { notifications as seedNotifications } from '../mock/notifications'
import { now, isOverdue, isDueToday, withinDays, hoursAgo, daysOverdue, waitedDays } from './dates'
import { prioRank, prio, PRIORITY, DEFAULT_PRIORITY } from './meta'

// No review step in this app: reviews happen in discussions (comments), not as a status.
// Old seed data had one, so it's cleaned out on load: "Under review" → In Progress, no reviewer, no rounds.
const REVIEW_TEXT = /review|approved|asked for changes|looks good|withdrew/i
function noReview(t: any) {
  return {
    ...t,
    status: t.status === 'review' ? 'progress' : t.status,
    reviewer: null,
    rounds: [],
    changesRequested: false,
    ack: null,
    checklist: (t.checklist || []).map((c: any) => (c.source === 'review' ? { ...c, source: 'manual', round: undefined } : c)),
    activity: (t.activity || []).filter((a: any) => !REVIEW_TEXT.test(a.text)),
  }
}
const REVIEW_NOTES = ['N2', 'N3', 'N4', 'N7', 'N16', 'N19']

// My tasks (space 'general') are personal: they belong to whoever made them and are never assigned to
// anyone else. Assigning only exists inside projects. Old seed data had some given to others: cleaned on load.
function personalOnly(t: any) {
  if (t.space !== 'general') return t
  return { ...t, assignee: t.createdBy, assignedBy: null, suggestion: null }
}
// Nobody else is told about a personal task, so seed notifications about them are dropped.
const PERSONAL_IDS = new Set(seedTasks.filter((t: any) => t.space === 'general').map((t: any) => t.id))

// One store for the whole app, filled from the server and saved back by lib/sync.ts.
export const state = reactive({
  me: 'swarali',
  signedIn: true,
  online: true,
  workspace: { name: 'Frappe', setupDone: false },
  people: structuredClone(seedPeople),
  projects: structuredClone(seedProjects),
  invites: structuredClone(seedInvites),
  tasks: structuredClone(seedTasks).map(noReview).map(personalOnly),
  // "X finished a task you gave" is just so you know now (no reply step): Updates, not Action needed.
  notifications: structuredClone(seedNotifications)
    .filter((n: any) => !PERSONAL_IDS.has(n.task))
    .filter((n: any) => !REVIEW_NOTES.includes(n.type))
    .map((n: any) => (n.type === 'N18' ? { ...n, tab: 'updates' } : n)),
  settings: {} as Record<string, any>,
  hints: {} as Record<string, boolean>,
  // When each person last opened each task. Drives the "New" line in comments.
  seen: { 'swarali:GP-1': hoursAgo(5) } as Record<string, string>,
  // Get started checklist, per person. Neha has used Tasks for a while, so hers is dismissed.
  onboarding: { neha: { skipped: [], dismissed: true, inbox: true } } as Record<string, { skipped: string[]; dismissed: boolean; inbox: boolean }>,
  // UI switches for overlays mounted in App.vue
  ui: {
    quickAdd: false,
    quickAddSpace: null as string | null,
    quickAddMilestone: null as string | null,
    createTask: false,
    createTaskSpace: null as string | null,
    search: false,
    settings: false,
    settingsTab: 'profile',
    createProject: false,
    submitTask: null as string | null,
    suggestTask: null as string | null,
    suggestKind: 'date' as string,
    selecting: false,
    homeChip: 'all',
    sidebarCollapsed: false,
    requestChangesTask: null as string | null,
    focusComment: 0,
    membersProject: null as string | null,
    editProject: null as string | null,
    joinProject: null as string | null,
    getStarted: false,
    // Milestone dialog: { pid, id? } (id = edit)
    milestone: null as { pid: string; id?: string } | null,
    // Post a project status update (project id)
    projectUpdate: null as string | null,
    // Paste-to-import dialog: { pid, milestone? }
    importTasks: null as { pid: string; milestone?: string | null } | null,
  },
})

let seq = 1000
const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`

// ── Workspaces (demo state "Workspaces": Off | On) ──────────────────────────────────────
// Off: the app exactly as before (one organisation, everything in it).
// On: a layer above projects. A workspace (e.g. Frappe) has its own people (Admin or Member), its own
// projects and its own invites. You can be in more than one and switch at the top of the sidebar.
//   · My tasks follows the workspace: Personal = your personal tasks (no project); a company (Frappe) = the tasks
//     given to you in its projects, all together. Notes stay yours across workspaces.
//   · Projects, people pickers, search and "Move to" show only the current workspace.
//   · Joining a workspace: by invite (email). Joining a project: by invite from its Owner (Accept / Decline);
//     projects you're not in aren't listed.
//   · Admin is per workspace (Neha: Admin in Frappe).
export const org = reactive({ on: false })
const wsMembers = (admins: string[], members: string[]) => [...admins.map((user) => ({ user, role: 'Admin' })), ...members.map((user) => ({ user, role: 'Member' }))]
// Two kinds: company (shared, Admin / Member) and personal (just you: no people, roles or invites).
// Everyone has one personal workspace; it can't be deleted or shared.
const personalWs = (user: string) => ({ id: `me-${user}`, kind: 'personal', name: 'Personal', owner: user, members: [{ user, role: 'Admin' }], invites: [] })
export const workspaces = reactive<any[]>([
  personalWs('swarali'),
  personalWs('neha'),
  personalWs('admin'),
  {
    id: 'frappe',
    kind: 'company',
    name: 'Frappe',
    members: wsMembers(['neha', 'admin'], ['swarali', 'rohan', 'priya', 'karan', 'ishaan', 'riya', 'dev', 'ananya', 'kabir', 'tara']),
    invites: [
      { id: 'wi1', email: 'newbie@example.com', user: 'newbie', by: 'neha', at: hoursAgo(3), projects: ['gameplan'], status: 'pending' },
      { id: 'wi2', email: 'meera@example.com', user: null, by: 'neha', at: hoursAgo(30), projects: [], status: 'pending' },
      { id: 'wi3', email: 'sam@example.com', user: null, by: 'neha', at: hoursAgo(24 * 9), projects: [], status: 'expired' },
    ],
  },
])
// The workspace each person is looking at (a new person has none until they join one)
export const currentWsOf = reactive<Record<string, string | null>>({ swarali: 'frappe', neha: 'frappe', admin: 'frappe', newbie: null })
export const wsOf = (p: any) => p?.ws || 'frappe'
export const wsById = (id: string | null) => workspaces.find((w) => w.id === id) || null
export const isWsMember = (wsId: string | null, uidd = state.me) => !!wsById(wsId)?.members.some((m: any) => m.user === uidd)
// Personal first, then companies
export const myWorkspaces = computed(() =>
  workspaces.filter((w) => w.members.some((m: any) => m.user === state.me)).sort((a, b) => (a.kind === 'personal' ? -1 : b.kind === 'personal' ? 1 : 0)),
)
export const isPersonalWs = (id: string | null) => wsById(id)?.kind === 'personal'
export const myPersonalWs = computed(() => myWorkspaces.value.find((w) => w.kind === 'personal') || null)
export const myCompanies = computed(() => myWorkspaces.value.filter((w) => w.kind !== 'personal'))
// Looking at your personal workspace right now
export const inPersonal = computed(() => org.on && currentWs.value?.kind === 'personal')
// A project in a personal workspace: only its owner, so no people, teams or invites anywhere in it
export const isSolo = (pid: string | null) => org.on && !!pid && pid !== 'general' && isPersonalWs(wsOf(project(pid)))
// Inviting new people to the workspace: company Admins only
export const canInviteToWs = computed(() => org.on && currentWs.value?.kind === 'company' && isWsAdmin())
export function ensurePersonalWs(user = state.me) {
  const have = workspaces.find((w) => w.kind === 'personal' && w.owner === user)
  if (have) return have.id
  const w = personalWs(user)
  workspaces.unshift(w)
  return w.id
}
// Personal → company, owner only, one way (shared work never goes back to someone's personal space)
export function moveProjectToWs(pid: string, wsId: string) {
  const p = project(pid)
  if (!p) return
  p.ws = wsId
  switchWorkspace(wsId, true)
}
export const currentWs = computed(() => myWorkspaces.value.find((w) => w.id === currentWsOf[state.me]) || myWorkspaces.value[0] || null)
export const isWsAdmin = (uidd = state.me, wsId: string | null = currentWs.value?.id || null) =>
  !!wsById(wsId)?.members.some((m: any) => m.user === uidd && m.role === 'Admin')
// Is this project in view? Off: the Frappe organisation (Acme Studio only exists with workspaces). On: the current workspace.
export function inScope(p: any) {
  if (!p) return false
  if (!org.on) return wsOf(p) === 'frappe'
  return !!currentWs.value && wsOf(p) === currentWs.value.id
}
// People you can pick (assign, add, mention): On = the current workspace's members
export const wsPeople = computed(() => (org.on ? state.people.filter((x: any) => isWsMember(currentWs.value?.id || null, x.id)) : state.people))
export function switchWorkspace(id: string, quiet = false) {
  currentWsOf[state.me] = id
  if (!quiet) toast.success(`Switched to ${wsById(id)?.name}.`)
}
export function createWorkspace(name: string) {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid('')
  workspaces.push({ id, kind: 'company', name: name.trim(), members: [{ user: state.me, role: 'Admin' }], invites: [] })
  ensurePersonalWs()
  switchWorkspace(id, true)
  return id
}
// Workspace invites (by email). A known email links to that person; the invite can also add them to projects.
export const myWsInvites = computed(() =>
  workspaces.filter((w) => !isWsMember(w.id)).map((w) => ({ w, inv: w.invites.find((i: any) => i.user === state.me && i.status === 'pending') })).filter((x) => x.inv),
)
export function inviteToWs(email: string, projects: string[] = [], wsId = currentWs.value?.id) {
  const w = wsById(wsId || null)
  if (!w) return
  const known = state.people.find((x: any) => x.email.toLowerCase() === email.toLowerCase())
  if (known && isWsMember(w.id, known.id)) return 'member'
  const open = w.invites.find((i: any) => i.email.toLowerCase() === email.toLowerCase() && i.status === 'pending')
  if (open) {
    open.at = now()
    return 'resent'
  }
  w.invites.unshift({ id: uid('wi'), email, user: known?.id || null, by: state.me, at: now(), projects, status: 'pending' })
  if (known) notify(known.id, { type: 'W1', actor: state.me, ws: w.id, orgOnly: true })
  return 'sent'
}
export function resendWsInvite(wsId: string, id: string) {
  const i = wsById(wsId)?.invites.find((x: any) => x.id === id)
  if (i) Object.assign(i, { at: now(), status: 'pending' })
}
export function cancelWsInvite(wsId: string, id: string) {
  const w = wsById(wsId)
  if (w) w.invites = w.invites.filter((x: any) => x.id !== id)
}
export function answerWsInvite(wsId: string, accept: boolean) {
  const w = wsById(wsId)
  const inv = w?.invites.find((i: any) => i.user === state.me && i.status === 'pending')
  if (!w || !inv) return
  inv.status = accept ? 'accepted' : 'declined'
  state.notifications.forEach((n) => n.to === state.me && n.type === 'W1' && n.ws === wsId && (n.read = true))
  if (!accept) return notify(inv.by, { type: 'W3', actor: state.me, ws: wsId, orgOnly: true })
  w.members.push({ user: state.me, role: 'Member' })
  // Joining by invite skips the setup question; a personal workspace is made quietly
  ensurePersonalWs()
  // The invite can come with projects: you're in them straight away
  ;(inv.projects || []).forEach((pid: string) => {
    const p = project(pid)
    if (p && !p.members.some((m: any) => m.user === state.me)) p.members.push({ user: state.me, role: 'Member' })
  })
  switchWorkspace(wsId, true)
  notify(inv.by, { type: 'W2', actor: state.me, ws: wsId, orgOnly: true })
}
export function setWsRole(wsId: string, user: string, role: string) {
  const m = wsById(wsId)?.members.find((x: any) => x.user === user)
  if (m) m.role = role
}
export const wsAdmins = (wsId: string | null) => wsById(wsId)?.members.filter((m: any) => m.role === 'Admin').map((m: any) => m.user) || []
// Leaving or being removed: out of the workspace and all its projects (open tasks go back to unassigned)
export function removeFromWs(wsId: string, user: string) {
  const w = wsById(wsId)
  if (!w) return
  state.projects
    .filter((p) => wsOf(p) === wsId && p.members.some((m: any) => m.user === user))
    .forEach((p) => {
      // Their projects can't be left without an Owner: the Admin removing them takes over
      const owners = p.members.filter((m: any) => isOwnerRole(m.role))
      if (user !== state.me && owners.length === 1 && owners[0].user === user) {
        const mine = p.members.find((m: any) => m.user === state.me)
        if (mine) mine.role = 'Owner'
        else p.members.push({ user: state.me, role: 'Owner' })
      }
      removeMember(p.id, user)
    })
  w.members = w.members.filter((m: any) => m.user !== user)
  if (user === state.me) currentWsOf[state.me] = myWorkspaces.value[0]?.id || null
}
// Project invites (On: joining a project is by invitation from its Owner)
export const projInvitesOf = (pid: string) => (project(pid)?.projInvites || []).filter((i: any) => i.status === 'pending')
export const myProjectInvite = (pid: string) => projInvitesOf(pid).find((i: any) => i.user === state.me) || null
export const myProjectInvites = computed(() => state.projects.filter((p) => p.status !== 'archived' && inScope(p) && !!myProjectInvite(p.id)))
export function inviteToProject(pid: string, user: string) {
  const p = project(pid)
  if (!p || p.members.some((m: any) => m.user === user) || myProjectInviteFor(pid, user)) return
  if (!p.projInvites) p.projInvites = []
  p.projInvites.push({ id: uid('pi'), user, by: state.me, at: now(), status: 'pending' })
  notify(user, { type: 'P1', actor: state.me, project: pid, orgOnly: true })
}
const myProjectInviteFor = (pid: string, user: string) => projInvitesOf(pid).find((i: any) => i.user === user) || null
export function cancelProjectInvite(pid: string, user: string) {
  const p = project(pid)
  if (!p) return
  p.projInvites = (p.projInvites || []).filter((i: any) => !(i.user === user && i.status === 'pending'))
  state.notifications = state.notifications.filter((n) => !(n.type === 'P1' && n.to === user && n.project === pid))
}
export function answerProjectInvite(pid: string, accept: boolean) {
  const p = project(pid)
  const inv = p && myProjectInvite(pid)
  if (!p || !inv) return
  inv.status = accept ? 'accepted' : 'declined'
  state.notifications.forEach((n) => n.to === state.me && n.type === 'P1' && n.project === pid && (n.read = true))
  if (accept && !p.members.some((m: any) => m.user === state.me)) p.members.push({ user: state.me, role: 'Member' })
  notify(inv.by, { type: accept ? 'P2' : 'P3', actor: state.me, project: pid, orgOnly: true })
}

// Demo data that only shows with Workspaces on: Swarali's personal project, pending project invites,
// and the notifications that go with them (orgOnly). Off, none of it appears anywhere.
{
  const d = (n: number) => dayjs().add(n, 'day').format('YYYY-MM-DD')
  const proj = (o: any) => ({ updates: [], files: [], joinRequests: [], invites: [], projInvites: [], status: 'active', ...o })
  state.projects.push(
    // Swarali's personal project (only she sees it). She can move it to Frappe to work on it with others.
    proj({
      id: 'portfolio',
      ws: 'me-swarali',
      name: 'Portfolio site',
      code: 'PF',
      description: 'My design portfolio: case studies and a simple site.',
      priority: 'p3',
      start: d(-18),
      target: d(30),
      // A design intern's portfolio, start to launch (Round 250)
      milestones: [
        { id: 'pf-1', name: 'Content plan', due: d(-10), people: [] },
        { id: 'pf-2', name: 'Case study: Helpdesk', due: d(6), people: [] },
        { id: 'pf-4', name: 'Visual design', due: d(12), people: [] },
        { id: 'pf-3', name: 'Case study: Frappe Tasks', due: d(20), people: [] },
        { id: 'pf-5', name: 'Build in Framer', due: d(24), people: [] },
        { id: 'pf-6', name: 'Launch', due: d(30), people: [] },
      ],
      members: [{ user: 'swarali', role: 'Owner' }],
    }),
    // Swarali's own build of this task manager (Round 249): started 14 Oct, today is week 3.
    // Research and IA are done, the core screens shipped, Notes and workspaces are in progress, testing is next.
    proj({
      id: 'taskmgr',
      ws: 'me-swarali',
      name: 'Task manager',
      code: 'TM',
      description: 'Designing and prototyping a task and project tool for Frappe teams.',
      priority: 'p1',
      start: '2026-10-14',
      target: d(20),
      milestones: [
        { id: 'tm-1', name: 'Research and references', due: '2026-10-20', people: [] },
        { id: 'tm-2', name: 'Information architecture', due: '2026-10-24', people: [] },
        { id: 'tm-3', name: 'Core screens', due: '2026-10-31', people: [] },
        { id: 'tm-4', name: 'Notes and AI tasks', due: d(3), people: [] },
        { id: 'tm-5', name: 'Personal and team workspaces', due: d(6), people: [] },
        { id: 'tm-6', name: 'Usability testing', due: d(13), people: [] },
        { id: 'tm-7', name: 'Final review', due: d(20), people: [] },
      ],
      members: [{ user: 'swarali', role: 'Owner' }],
    }),
  )
  // Frappe: Rohan invited Swarali to Helpdesk; Neha invited Tara to Gameplan (waiting)
  const hd = state.projects.find((p: any) => p.id === 'helpdesk')
  if (hd) hd.projInvites = [{ id: 'pi1', user: 'swarali', by: 'rohan', at: hoursAgo(6), status: 'pending' }]
  const gp = state.projects.find((p: any) => p.id === 'gameplan')
  if (gp) gp.projInvites = [{ id: 'pi2', user: 'tara', by: 'neha', at: hoursAgo(2), status: 'pending' }]
  const t = (o: any) => ({
    description: '', labels: [], checklist: [], attachments: [], rounds: [], comments: [], activity: [], suggestion: null, changesRequested: false,
    priority: 'p3', due: null, doneAt: null, deletedAt: null, mutedBy: [], nudgedAt: null, ack: null, start: null, dependsOn: [], slips: [],
    reviewer: null, createdBy: 'riya', assignedBy: 'riya', createdAt: hoursAgo(72), ...o,
  })
  state.tasks.push(
    ...[
      // Content plan (done)
      ['PF-4', 'Pick my 3 strongest projects', 'pf-1', 'done', 'p1', -14, -14],
      ['PF-2', 'Collect old files and screenshots', 'pf-1', 'done', 'p3', -11, -11],
      ['PF-5', 'Write a short bio and what I want to do next', 'pf-1', 'done', 'p3', -10, -10],
      // Case study: Helpdesk (in progress)
      ['PF-1', 'Write the Helpdesk case study', 'pf-2', 'progress', 'p2', 2],
      ['PF-6', 'Make before and after mockups', 'pf-2', 'todo', 'p2', 4],
      ['PF-7', 'Ask Neha for feedback on the draft', 'pf-2', 'todo', 'p3', 6],
      // Visual design
      ['PF-8', 'Pick a type pair and colours', 'pf-4', 'todo', 'p3', 8],
      ['PF-9', 'Design the home and case study pages', 'pf-4', 'todo', 'p2', 12],
      // Case study: Frappe Tasks (after the internship work is presented)
      ['PF-10', 'Draft the story: problem, process, outcome', 'pf-3', 'backlog', 'p3', 18],
      ['PF-11', 'Export the best prototype screens', 'pf-3', 'backlog', 'p4', 20],
      // Build in Framer
      ['PF-12', 'Set up the Framer project', 'pf-5', 'todo', 'p3', 16],
      ['PF-13', 'Check every page on a phone', 'pf-5', 'backlog', 'p3', 24],
      // Launch
      ['PF-3', 'Pick a domain name', 'pf-6', 'todo', 'p3', 14],
      ['PF-14', 'Ask two designers for a review', 'pf-6', 'backlog', 'p2', 27],
      ['PF-15', 'Share it on LinkedIn and Read.cv', 'pf-6', 'backlog', 'p4', 30],
    ].map(([id, title, milestone, status, priority, due, doneDay]: any) =>
      t({ id, title, space: 'portfolio', milestone, status, priority, due: d(due), assignee: 'swarali', createdBy: 'swarali', assignedBy: 'swarali', createdAt: hoursAgo(24 * 16), doneAt: status === 'done' ? dayjs().add(doneDay, 'day').hour(18).toISOString() : null }),
    ),
  )
  // Task manager: all Swarali's (personal project), dated from 14 Oct
  {
    const me = { assignee: 'swarali', createdBy: 'swarali', assignedBy: 'swarali', space: 'taskmgr' }
    const on = (day: string, h = 17) => dayjs(day).hour(h).toISOString()
    const tm = (o: any) => t({ ...me, createdAt: on(o.from || '2026-10-14', 10), ...o })
    const c = (id: string, text: string, done: boolean) => ({ id, text, done, source: 'manual' })
    state.tasks.push(
      // Research and references (done)
      tm({ id: 'TM-1', title: 'Study how Linear, Asana and Gameplan handle My tasks', milestone: 'tm-1', status: 'done', priority: 'p2', labels: ['Research'], due: '2026-10-16', doneAt: on('2026-10-16') }),
      tm({ id: 'TM-2', title: 'Map the Frappe UI parts for lists and panels', milestone: 'tm-1', status: 'done', priority: 'p2', labels: ['Research'], due: '2026-10-17', doneAt: on('2026-10-17') }),
      tm({ id: 'TM-3', title: 'Write the problem statement', milestone: 'tm-1', status: 'done', priority: 'p1', labels: ['Research'], due: '2026-10-20', doneAt: on('2026-10-19') }),
      // Information architecture (done)
      tm({ id: 'TM-4', title: 'Sitemap: My tasks, Projects, Notes, Inbox', milestone: 'tm-2', status: 'done', priority: 'p2', labels: ['IA'], due: '2026-10-22', doneAt: on('2026-10-21'), from: '2026-10-20' }),
      tm({ id: 'TM-5', title: 'Define roles: Owner, member, admin', milestone: 'tm-2', status: 'done', priority: 'p2', labels: ['IA'], due: '2026-10-23', doneAt: on('2026-10-23'), from: '2026-10-20' }),
      tm({ id: 'TM-6', title: 'Decide the milestone, task, subtask model', milestone: 'tm-2', status: 'done', priority: 'p1', labels: ['IA'], due: '2026-10-24', doneAt: on('2026-10-24'), from: '2026-10-21' }),
      // Core screens (done, the last one a day late)
      tm({ id: 'TM-7', title: 'My tasks list grouped by due date', milestone: 'tm-3', status: 'done', priority: 'p1', labels: ['Prototype'], due: '2026-10-27', doneAt: on('2026-10-27'), from: '2026-10-24' }),
      tm({ id: 'TM-8', title: 'Project page: Overview, Milestones, Timeline', milestone: 'tm-3', status: 'done', priority: 'p1', labels: ['Prototype'], due: '2026-10-29', doneAt: on('2026-10-29'), from: '2026-10-25' }),
      tm({ id: 'TM-9', title: 'Task panel with its properties', milestone: 'tm-3', status: 'done', priority: 'p2', labels: ['Prototype'], due: '2026-10-30', doneAt: on('2026-10-30'), from: '2026-10-26' }),
      tm({ id: 'TM-10', title: 'Filter and sort bar for every list', milestone: 'tm-3', status: 'done', priority: 'p2', labels: ['Prototype'], due: '2026-10-31', doneAt: on('2026-11-01'), from: '2026-10-28' }),
      // Notes and AI tasks (in progress, due Fri)
      tm({ id: 'TM-11', title: 'Notes as one notebook with Personal and Frappe tags', milestone: 'tm-4', status: 'done', priority: 'p2', labels: ['Prototype'], due: d(-1), doneAt: hoursAgo(30), from: '2026-10-30' }),
      tm({
        id: 'TM-12', title: 'Create tasks panel: Grouped layout', milestone: 'tm-4', status: 'progress', priority: 'p1', labels: ['Prototype'], due: d(1), from: '2026-11-01',
        checklist: [c('tm12-1', 'Move all to a new milestone', true), c('tm12-2', 'Compact project picker', true), c('tm12-3', 'Edge cases with no projects', false)],
      }),
      tm({ id: 'TM-13', title: 'Only milestones you are on in the picker', milestone: 'tm-4', status: 'done', priority: 'p2', labels: ['Prototype'], due: d(0), doneAt: hoursAgo(20), from: '2026-11-02' }),
      tm({ id: 'TM-14', title: 'Try the panel with 3 people', milestone: 'tm-4', status: 'todo', priority: 'p2', labels: ['Research'], due: d(3), from: '2026-11-02' }),
      // Personal and team workspaces (in progress)
      tm({ id: 'TM-15', title: 'Remove team features from Personal', milestone: 'tm-5', status: 'done', priority: 'p2', labels: ['Prototype'], due: d(0), doneAt: hoursAgo(10), from: '2026-11-03' }),
      tm({ id: 'TM-16', title: 'Needs attention grouping in My tasks', milestone: 'tm-5', status: 'progress', priority: 'p2', labels: ['Prototype'], due: d(2), from: '2026-11-03' }),
      tm({ id: 'TM-17', title: 'Request to join: All projects section', milestone: 'tm-5', status: 'todo', priority: 'p1', labels: ['Design'], due: d(5), from: '2026-11-03' }),
      tm({ id: 'TM-18', title: 'Reminders only in Personal notifications', milestone: 'tm-5', status: 'done', priority: 'p3', labels: ['Prototype'], due: d(0), doneAt: hoursAgo(26), from: '2026-11-02' }),
      // Usability testing (not started)
      tm({ id: 'TM-19', title: 'Write the test script', milestone: 'tm-6', status: 'todo', priority: 'p2', labels: ['Research'], due: d(8), from: '2026-11-03' }),
      tm({ id: 'TM-20', title: 'Find 5 people from the support team', milestone: 'tm-6', status: 'todo', priority: 'p3', labels: ['Research'], due: d(9), from: '2026-11-03' }),
      tm({ id: 'TM-21', title: 'Run the sessions and note what breaks', milestone: 'tm-6', status: 'backlog', priority: 'p2', labels: ['Research'], due: d(12), from: '2026-11-03' }),
      // Final review
      tm({ id: 'TM-22', title: 'Polish empty states and copy', milestone: 'tm-7', status: 'backlog', priority: 'p3', labels: ['Design'], due: d(18), from: '2026-11-03' }),
      tm({ id: 'TM-23', title: 'Present to Neha and the design team', milestone: 'tm-7', status: 'todo', priority: 'p1', labels: ['Design'], due: d(20), from: '2026-11-03' }),
      // No milestone: a small bug, a day overdue
      tm({ id: 'TM-24', title: 'Fix the selection toolbar covering text in Notes', milestone: 'tm-4', status: 'todo', priority: 'p2', labels: ['Bug'], due: d(-1), from: '2026-11-02' }),
    )
  }
  state.notifications.unshift(
    { id: 'nw1', to: 'newbie', type: 'W1', tab: 'needs', actor: 'neha', ws: 'frappe', at: hoursAgo(3), read: false, orgOnly: true },
    { id: 'np1', to: 'swarali', type: 'P1', tab: 'needs', actor: 'rohan', project: 'helpdesk', at: hoursAgo(6), read: false, orgOnly: true },
    { id: 'nw2', to: 'neha', type: 'W2', tab: 'updates', actor: 'tara', ws: 'frappe', at: hoursAgo(26), read: true, orgOnly: true },
  )
}

// ── Lookups ──────────────────────────────────────────────────────────────

export const person = (id: string | null) => state.people.find((p) => p.id === id) || null
export const personName = (id: string | null) => person(id)?.name || 'Someone'
export const project = (id: string | null) => state.projects.find((p) => p.id === id) || null
export const task = (id: string | null) => state.tasks.find((t) => t.id === id) || null
export const me = computed(() => person(state.me)!)

export function spaceName(space: string) {
  if (space === 'general') return 'My tasks'
  return project(space)?.name || space
}

export function isMember(pid: string, uid = state.me) {
  return !!project(pid)?.members.some((m) => m.user === uid)
}
// Who manages a project: its Owner, plus anyone who can create projects (and admins).
export const isOwnerRole = (role: string) => role === 'Owner' || role === 'Lead'
export function isLead(pid: string, uid = state.me) {
  const p = project(pid)
  if (!p) return false
  // Anyone can create projects now, so creating them doesn't make you a manager of others'. Admins and Owners manage.
  const who = person(uid)
  // Workspaces on: admin is per workspace (the project's)
  if (org.on ? isWsAdmin(uid, wsOf(p)) : who?.isAdmin) return true
  return p.members.some((m) => m.user === uid && isOwnerRole(m.role))
}
// The actual role (Owner), not the permission. Admins can manage every project, but only lead the ones they own.
export function isOwner(pid: string, uid = state.me) {
  return !!project(pid)?.members.some((m) => m.user === uid && isOwnerRole(m.role))
}
export function leadsOf(pid: string) {
  return project(pid)?.members.filter((m) => isOwnerRole(m.role)).map((m) => m.user) || []
}
export const ownerOf = (pid: string) => leadsOf(pid)[0] || null

// Projects I'm in (active), most recently used first.
// Live = not archived (Active, On hold or Completed). Archived projects live in Settings.
// (and in view: the current workspace when Workspaces is on)
export const isLiveProject = (p: any) => p.status !== 'archived' && inScope(p)
export const myProjects = computed(() =>
  state.projects.filter((p) => isLiveProject(p) && isMember(p.id)),
)
export const otherProjects = computed(() =>
  state.projects.filter((p) => isLiveProject(p) && !isMember(p.id)),
)
export const archivedProjects = computed(() =>
  state.projects.filter((p) => p.status === 'archived' && isMember(p.id) && inScope(p)),
)

// Can I see this task at all? Frappe works in the open: every project task is visible to everyone.
// Only General (tasks with no project) stays private to the people on the task.
export function canSee(t: any, uid = state.me) {
  if (t.deletedAt) return false
  if (t.space === 'general') {
    return t.createdBy === uid || t.assignee === uid || t.reviewer === uid
  }
  // Workspaces on: only tasks in the current workspace's projects
  return !!project(t.space) && inScope(project(t.space))
}

// Anyone can assign to anyone. If they're not in the project yet, assigning adds them.
function ensureMember(space: string, user: string | null) {
  if (!user || space === 'general' || isMember(space, user)) return
  addMember(space, user)
  toast.info(`${personName(user)} was added to ${spaceName(space)}.`)
}

// Join = ask the Owner. It sends a request (the Owner gets it in notifications and in People);
// you're in once they accept. Admins can manage every project, so they join straight away.
export function joinProject(pid: string) {
  if (org.on ? isWsAdmin() : person(state.me)?.isAdmin) {
    addMember(pid, state.me)
    toast.success(`You joined ${spaceName(pid)}.`)
    return
  }
  if (myJoinRequest(pid)) return
  requestToJoin(pid, '')
  toast.success(`Request sent to ${leadsOf(pid).map(personName).join(' and ')}.`)
}

export const visibleTasks = computed(() => state.tasks.filter((t) => canSee(t)))

// Archived projects are read-only and stay out of Home.
export const isArchived = (t: any) => t.space !== 'general' && project(t.space)?.status === 'archived'

export const isOpen = (t: any) => t.status === 'backlog' || t.status === 'todo' || t.status === 'progress'

// ── Home groups (docs/03 section 5.2) ─────────────────────────────────────

const byDue = (a: any, b: any) => (a.due || '9999').localeCompare(b.due || '9999')
const lastRound = (t: any) => t.rounds[t.rounds.length - 1]
export const submittedAt = (t: any) => lastRound(t)?.submittedAt || t.createdAt

export function homeGroups(space: string | null) {
  const uid = state.me
  const list = visibleTasks.value.filter((t) => (!space || t.space === space) && !isArchived(t))
  const mine = list.filter((t) => t.assignee === uid)

  // "Waiting on you": work to review, and suggestions on tasks you gave (you own the answer).
  const answerTest = (t: any) => !!t.suggestion && t.assignedBy === uid && t.assignee !== uid
  // Finished work you gave (no check needed): have a look, say "Looks good" or ask for changes.
  const lookTest = (t: any) => isFinishedForMe(t, uid)
  const toReview = list
    .filter((t) => (t.reviewer === uid && t.status === 'review') || answerTest(t) || lookTest(t))
    .sort((a, b) => (a.suggestion?.at || a.doneAt || submittedAt(a) || '').localeCompare(b.suggestion?.at || b.doneAt || submittedAt(b) || ''))

  const doNowTest = (t: any) =>
    isOpen(t) && (isOverdue(t) || isDueToday(t) || t.status === 'progress' || t.changesRequested)
  const doNow = mine.filter(doNowTest).sort((a, b) => {
    const score = (t: any) =>
      isOverdue(t) ? 0 : t.changesRequested ? 1 : prioRank(t.priority) <= 2 ? 2 : 3
    return score(a) - score(b) || byDue(a, b)
  })
  const next = mine
    .filter((t) => isOpen(t) && !doNowTest(t))
    .sort((a, b) => byDue(a, b) || (b.createdAt || '').localeCompare(a.createdAt || ''))

  const waiting = list
    .filter(
      (t) =>
        (t.assignedBy === uid && t.assignee && t.assignee !== uid && t.status !== 'done' && t.status !== 'cancelled' &&
          !(t.status === 'review' && t.reviewer === uid) && !answerTest(t)) ||
        (t.assignee === uid && t.status === 'review' && t.reviewer !== uid),
    )
    .sort((a, b) => (waitingSince(a) || '').localeCompare(waitingSince(b) || ''))

  const done = list
    .filter((t) => (t.assignee === uid || t.reviewer === uid) && t.status === 'done' && withinDays(t.doneAt, 7))
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))

  return { toReview, doNow, next, waiting, done }
}

// Someone finished a task I gave them, without a check step. I haven't replied yet.
// (No reply step any more: you're just told in your Inbox. Kept so callers still work.)
export const isFinishedForMe = (t: any, uid = state.me) =>
  false && t.status === 'done' && !t.reviewer && t.assignedBy === uid && !!t.assignee && t.assignee !== uid && !t.ack && withinDays(t.doneAt, 7)

export function waitingSince(t: any) {
  if (t.status === 'review') return submittedAt(t)
  return t.createdAt
}

// Who the task is "with" right now.
export function withWhom(t: any) {
  if (t.status === 'review') return t.reviewer
  return t.assignee
}

// ── Attention dots and counts ─────────────────────────────────────────────

// Workspaces on: every company workspace's notifications in one list (each says which workspace). Off: as before.
// Personal workspace (Round 246): reminders only (your tasks due tomorrow / today / overdue, milestones due soon),
// for your personal tasks and personal projects. Nobody else is there, so nothing else can happen. Those reminders
// don't show in a company workspace.
const notificationWs = (n: any) => {
  if (n.ws) return n.ws
  const sp = notificationSpace(n)
  if (sp === 'general') return task(n.task)?.ws || myPersonalWs.value?.id || null
  return sp ? wsOf(project(sp)) : 'frappe'
}
export const myNotifications = computed(() =>
  state.notifications
    .filter((n) => n.to === state.me)
    .filter((n) => {
      if (!org.on) return !n.orgOnly && (!notificationSpace(n) || notificationSpace(n) === 'general' || inScope(project(notificationSpace(n))))
      const personal = isPersonalWs(notificationWs(n))
      return inPersonal.value ? personal && ['R1', 'R2'].includes(n.type) : !personal
    })
    .sort((a, b) => (b.at || '').localeCompare(a.at || '')),
)
export const needsCount = computed(
  () => myNotifications.value.filter((n) => n.tab === 'needs' && !n.read).length,
)

export function notificationSpace(n: any) {
  if (n.project) return n.project
  return task(n.task)?.space || null
}

// A red dot shows when an unread "Needs you" item belongs to that space.
export function attention(space: string) {
  return myNotifications.value.some(
    (n) => n.tab === 'needs' && !n.read && notificationSpace(n) === space,
  )
}

// ── Notifications ──────────────────────────────────────────────────────────

const NEEDS = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N13', 'N16', 'N17', 'N18', 'N21', 'R1', 'R2', 'W1', 'P1']

export function prefs(uid = state.me) {
  if (!state.settings[uid]) {
    state.settings[uid] = { emailMe: true, dailySummary: true, push: true, quietHours: true, mutedProjects: [] as string[], quickAddRow: true }
  }
  return state.settings[uid]
}

export function notify(to: string | null, n: any) {
  if (!to || to === n.actor) return
  const t = n.task ? task(n.task) : null
  const tab = NEEDS.includes(n.type) ? 'needs' : 'updates'
  // Muted tasks and muted projects skip Updates. "Needs you" always arrives.
  if (tab === 'updates' && t?.mutedBy?.includes(to)) return
  if (tab === 'updates' && t && prefs(to).mutedProjects.includes(t.space)) return
  // Group comment updates by task.
  if (n.type === 'N9') {
    const existing = state.notifications.find(
      (x) => x.to === to && x.type === 'N9' && x.task === n.task && !x.read,
    )
    if (existing) {
      existing.count = (existing.count || 1) + 1
      existing.at = now()
      existing.actor = n.actor
      return
    }
  }
  state.notifications.unshift({ id: uid('n'), to, tab, at: now(), read: false, count: 1, ...n })
}

export function markRead(id: string) {
  const n = state.notifications.find((x) => x.id === id)
  if (n) n.read = true
}
export function markAllRead(tab: string) {
  state.notifications.forEach((n) => {
    if (n.to === state.me && n.tab === tab) n.read = true
  })
}
// Opening a task clears its notifications for me (and the dot with them).
export function markTaskRead(taskId: string) {
  state.notifications.forEach((n) => {
    if (n.to === state.me && n.task === taskId) n.read = true
  })
}
// A suggestion closed (answered, withdrawn, submitted, reassigned): its "Needs you" item goes with it.
function clearSuggestionNotes(t: any) {
  state.notifications.forEach((n) => {
    if (n.type === 'N6' && n.task === t.id) n.read = true
  })
}
export function markProjectRequestsRead(pid: string) {
  state.notifications.forEach((n) => {
    if (n.to === state.me && n.type === 'N13' && n.project === pid) n.read = true
  })
}

// ── Task actions ───────────────────────────────────────────────────────────

function log(t: any, text: string, actor = state.me) {
  t.activity.push({ actor, text, at: now() })
  t.updatedAt = now()
}

function nextId(space: string) {
  const prefix = space === 'general' ? 'T' : project(space)?.code || 'T'
  const nums = state.tasks
    .filter((t) => t.id.startsWith(prefix + '-'))
    .map((t) => parseInt(t.id.split('-')[1], 10) || 0)
  return `${prefix}-${Math.max(0, ...nums) + 1}`
}

export function addTask(input: any) {
  const uidMe = state.me
  const space = input.space || 'general'
  // Personal tasks are always yours (never assigned to anyone else)
  const assignee = space === 'general' ? uidMe : input.assignee === undefined ? uidMe : input.assignee
  const t = {
    id: nextId(space),
    space,
    // Your own tasks (no project) belong to a workspace (Round 253): Personal, or a company's My tasks (a Raven post…)
    ws: space === 'general' ? input.ws || currentWs.value?.id || null : undefined,
    title: input.title.trim(),
    description: input.description || '',
    status: 'todo',
    // No silent default: a task has a priority only if someone picked one.
    priority: input.priority || null,
    due: input.due || null,
    labels: input.labels || [],
    checklist: input.checklist || [],
    milestone: input.milestone || null,
    start: input.start || null,
    dependsOn: input.dependsOn || [],
    slips: [],
    attachments: input.attachments || [],
    rounds: [],
    comments: [],
    activity: [],
    suggestion: null,
    changesRequested: false,
    createdBy: uidMe,
    assignee,
    assignedBy: assignee ? uidMe : null,
    // No review step: the person doing it marks it done, and whoever gave it is told.
    reviewer: null,
    ack: null as string | null,
    createdAt: now(),
    doneAt: null,
    deletedAt: null,
    mutedBy: [],
  }
  ensureMember(space, assignee)
  state.tasks.unshift(t)
  log(t, assignee && assignee !== uidMe ? `created this task and assigned it to ${personName(assignee)}` : 'created this task')
  if (assignee && assignee !== uidMe) notify(assignee, { type: 'N1', actor: uidMe, task: t.id })
  return t
}

export function updateTask(id: string, patch: any, note?: string) {
  const t = task(id)
  if (!t) return
  const old = { ...t }
  Object.assign(t, patch)
  if (note) log(t, note)
  if ('due' in patch && patch.due !== old.due) {
    recordSlip(t, old.due, patch.due)
    log(t, patch.due ? `set the due date to ${dayjs(patch.due).format('ddd D MMM')}` : 'removed the due date')
    notifyParticipants(t, { type: 'N10' })
  }
  if ('priority' in patch && patch.priority !== old.priority) log(t, `set priority to ${PRIORITY[prio(patch.priority)].short} (${PRIORITY[prio(patch.priority)].label})`)
  if ('title' in patch && patch.title !== old.title) log(t, 'renamed this task')
}

function notifyParticipants(t: any, n: any, except: string[] = []) {
  const who = new Set([t.assignee, t.reviewer].filter(Boolean))
  who.forEach((p) => {
    if (!except.includes(p)) notify(p, { actor: state.me, task: t.id, ...n })
  })
}

export function start(id: string) {
  const t = task(id)!
  t.status = 'progress'
  log(t, 'started this task')
}

export function setStatus(id: string, status: string) {
  const t = task(id)!
  if (status === 'progress' && (t.status === 'todo' || t.status === 'backlog')) return start(id)
  t.status = status
  if (status === 'done') {
    t.doneAt = now()
    log(t, 'marked this done')
  } else if (status === 'todo') log(t, 'moved this to Todo')
  else if (status === 'backlog') log(t, 'moved this to Backlog')
  else if (status === 'progress') log(t, 'moved this to In Progress')
}

export function markDone(id: string, skipReview = false) {
  const t = task(id)!
  t.status = 'done'
  t.doneAt = now()
  t.changesRequested = false
  t.ack = null
  log(t, skipReview ? 'marked this done without review' : 'marked this done')
  if (skipReview) notify(t.assignee, { type: 'N3', actor: state.me, task: t.id })
  // A task someone gave you, with no check step: they're told, and can reply.
  else if (t.assignedBy && t.assignedBy !== t.assignee) notify(t.assignedBy, { type: 'N18', actor: state.me, task: t.id })
}

// Reply to finished work: "Looks good" (closes the loop) or ask for changes (reopens it).
export function looksGood(id: string) {
  const t = task(id)!
  t.ack = 'ok'
  log(t, 'said this looks good')
  notify(t.assignee, { type: 'N19', actor: state.me, task: t.id })
  markTaskRead(id)
}

export function submitForReview(id: string, note: string, attachments: any[] = []) {
  const t = task(id)!
  attachments.forEach((a) => t.attachments.push(a))
  t.rounds.push({
    n: t.rounds.length + 1,
    submittedBy: state.me,
    note,
    attachments: attachments.map((a) => a.id),
    submittedAt: now(),
    decision: null,
    decidedBy: null,
    points: [],
    decisionNote: '',
    decidedAt: null,
  })
  const again = t.rounds.length > 1
  if (state.hints.submitHint === state.me) state.hints.submitHint = null
  t.status = 'review'
  t.changesRequested = false
  t.suggestion = null
  t.nudgedAt = null
  clearSuggestionNotes(t)
  log(t, again ? 'submitted this again' : 'submitted this for review')
  notify(t.reviewer, { type: 'N2', actor: state.me, task: t.id })
  // Starter tasks (new users): the reviewer approves after a moment, so the whole loop is visible.
  if (t.starter && t.reviewer && t.reviewer !== state.me) {
    const who = state.me
    const rev = t.reviewer
    setTimeout(() => {
      if (t.status !== 'review') return
      const r = lastRound(t)
      if (r) Object.assign(r, { decision: 'approved', decidedBy: rev, decisionNote: 'Nice work. That’s the whole loop.', decidedAt: now() })
      t.status = 'done'
      t.doneAt = now()
      log(t, 'approved this', rev)
      notify(who, { type: 'N3', actor: rev, task: t.id })
      toast.success(`${personName(rev)} approved “${t.title}”.`)
    }, 4000)
  }
}

export function approve(id: string, note = '') {
  const t = task(id)!
  const r = lastRound(t)
  if (r) Object.assign(r, { decision: 'approved', decidedBy: state.me, decisionNote: note, decidedAt: now() })
  t.status = 'done'
  t.doneAt = now()
  log(t, 'approved this')
  notify(t.assignee, { type: 'N3', actor: state.me, task: t.id })
}

export function undoApprove(id: string) {
  const t = task(id)!
  const r = lastRound(t)
  if (r) Object.assign(r, { decision: null, decidedBy: null, decisionNote: '', decidedAt: null })
  t.status = 'review'
  t.doneAt = null
  log(t, 'undid the approval')
  state.notifications = state.notifications.filter(
    (n) => !(n.type === 'N3' && n.task === id && n.actor === state.me && !n.read),
  )
}

export function requestChanges(id: string, points: string[]) {
  const t = task(id)!
  const r = lastRound(t)
  if (r) Object.assign(r, { decision: 'changes', decidedBy: state.me, points, decidedAt: now() })
  points.forEach((p) =>
    t.checklist.push({ id: uid('c'), text: p, done: false, source: 'review', round: r?.n || 1 }),
  )
  t.status = 'progress'
  t.doneAt = null
  t.ack = null
  t.changesRequested = true
  log(t, 'asked for changes')
  notify(t.assignee, { type: 'N4', actor: state.me, task: t.id })
}

// Assignee reminds a slow reviewer. Once a day at most.
export const canNudge = (t: any) =>
  t.status === 'review' && t.assignee === state.me && t.reviewer && t.reviewer !== state.me &&
  dayjs().diff(dayjs(submittedAt(t)), 'hour') >= 24 &&
  (!t.nudgedAt || dayjs().diff(dayjs(t.nudgedAt), 'hour') >= 24)
export function nudge(id: string) {
  const t = task(id)!
  t.nudgedAt = now()
  log(t, `reminded ${personName(t.reviewer)} to review this`)
  notify(t.reviewer, { type: 'N16', actor: state.me, task: t.id })
}

export function withdraw(id: string) {
  const t = task(id)!
  const r = lastRound(t)
  if (r) Object.assign(r, { decision: 'withdrawn', decidedBy: state.me, decidedAt: now() })
  t.status = 'progress'
  log(t, 'withdrew this from review')
}

export function reopen(id: string) {
  const t = task(id)!
  t.status = 'progress'
  t.doneAt = null
  log(t, 'reopened this')
}

export function cancelTask(id: string) {
  const t = task(id)!
  t.prevStatus = t.status
  t.status = 'cancelled'
  log(t, 'cancelled this')
  notifyParticipants(t, { type: 'N11' })
}
export function restoreCancelled(id: string) {
  const t = task(id)!
  t.status = 'todo'
  log(t, 'restored this')
}

export function deleteTask(id: string) {
  const t = task(id)!
  t.deletedAt = now()
  t.deletedBy = state.me
  notifyParticipants(t, { type: 'N11', deleted: true })
}
export function restoreDeleted(id: string) {
  const t = task(id)!
  t.deletedAt = null
  log(t, 'restored this from deleted tasks')
}
export const deletedTasks = computed(() =>
  state.tasks
    .filter((t) => t.deletedAt && (t.createdBy === state.me || (t.space !== 'general' && isLead(t.space))))
    .filter((t) => dayjs().diff(dayjs(t.deletedAt), 'day') < 30)
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || '')),
)

export function reassign(id: string, to: string | null) {
  const t = task(id)!
  // Personal tasks can't be assigned (the UI never offers it; this is the safety net)
  if (t.space === 'general') return
  const from = t.assignee
  ensureMember(t.space, to)
  t.assignee = to
  if (to && !t.assignedBy) t.assignedBy = state.me
  // A check step stays with the assigner. If I assign it to myself, no check.
  if (to && to === t.assignedBy) t.reviewer = null
  t.suggestion = null
  clearSuggestionNotes(t)
  log(t, to ? `assigned this to ${personName(to)}` : 'removed the assignee')
  if (to) notify(to, { type: 'N1', actor: state.me, task: t.id })
  if (from && from !== to) notify(from, { type: 'N10', actor: state.me, task: t.id, reassigned: true })
}

// Unassigned project task: "Pick up". The creator is told when it's done.
export function takeTask(id: string) {
  const t = task(id)!
  ensureMember(t.space, state.me)
  t.assignee = state.me
  t.assignedBy = t.createdBy
  t.reviewer = null
  log(t, 'took this task')
  if (t.status === 'todo') start(id)
}

export function changeReviewer(id: string, to: string) {
  const t = task(id)!
  const from = t.reviewer
  t.reviewer = to
  log(t, `made ${personName(to)} the reviewer`)
  notify(to, { type: 'N7', actor: state.me, task: t.id })
  if (from && from !== to) notify(from, { type: 'N10', actor: state.me, task: t.id })
}

export function moveTask(id: string, space: string) {
  const t = task(id)!
  t.space = space
  // Into My tasks: it becomes yours alone (only offered when nobody else is on it)
  if (space === 'general') Object.assign(t, { assignee: state.me, assignedBy: null, milestone: null, suggestion: null })
  log(t, `moved this to ${spaceName(space)}`)
}

export function toggleMute(id: string) {
  const t = task(id)!
  const i = t.mutedBy.indexOf(state.me)
  if (i >= 0) t.mutedBy.splice(i, 1)
  else t.mutedBy.push(state.me)
}

// Checklist
export function addChecklistItem(id: string, text: string) {
  const t = task(id)!
  t.checklist.push({ id: uid('c'), text, done: false, source: 'manual' })
  if (t.status === 'todo' && t.assignee === state.me) start(id)
}
export function toggleChecklistItem(id: string, itemId: string) {
  const t = task(id)!
  const c = t.checklist.find((c: any) => c.id === itemId)
  if (c) c.done = !c.done
  if (t.status === 'todo' && t.assignee === state.me) start(id)
}
export function removeChecklistItem(id: string, itemId: string) {
  const t = task(id)!
  t.checklist = t.checklist.filter((c: any) => c.id !== itemId)
}

// Subtasks (the checklist items) can be given to someone. They see it on their Home.
export function setSubtaskAssignee(id: string, itemId: string, user: string | null) {
  const t = task(id)!
  const c = t.checklist.find((c: any) => c.id === itemId)
  if (!c) return
  c.assignee = user
  ensureMember(t.space, user)
  log(t, user ? `gave the subtask “${c.text}” to ${personName(user)}` : `unassigned the subtask “${c.text}”`)
  if (user) notify(user, { type: 'N17', actor: state.me, task: t.id, subtask: c.text })
}
// Who ticks a subtask: its own assignee, or the task's assignee when it has none.
export const canTickSubtask = (t: any, c: any) =>
  t.status !== 'done' && t.status !== 'cancelled' && !isArchived(t) && (c.assignee ? c.assignee === state.me : t.assignee === state.me)

// Open subtasks given to me on tasks someone else owns.
export const mySubtasks = computed(() =>
  visibleTasks.value
    .filter((t) => !isArchived(t) && t.assignee !== state.me && t.status !== 'done' && t.status !== 'cancelled')
    .flatMap((t) => t.checklist.filter((c: any) => c.assignee === state.me && !c.done).map((c: any) => ({ task: t, item: c }))),
)

// ── Milestones ──────────────────────────────────────────────────────────────

export const milestonesOf = (pid: string) =>
  [...(project(pid)?.milestones || [])].sort((a: any, b: any) => (a.due || '9999').localeCompare(b.due || '9999'))
export const milestone = (pid: string, mid: string | null) => (mid ? project(pid)?.milestones?.find((m: any) => m.id === mid) || null : null)

export function milestoneStats(pid: string, mid: string | null) {
  const list = state.tasks.filter((t) => t.space === pid && !t.deletedAt && t.status !== 'cancelled' && (t.milestone || null) === mid)
  const done = list.filter((t) => t.status === 'done').length
  return { total: list.length, done, late: list.filter((t) => isOverdue(t)).length, pct: list.length ? Math.round((done / list.length) * 100) : 0 }
}
// The next milestone that isn't finished yet.
export function nextMilestone(pid: string) {
  return milestonesOf(pid).find((m: any) => {
    const s = milestoneStats(pid, m.id)
    return !s.total || s.done < s.total
  }) || null
}
export function saveMilestone(pid: string, data: { id?: string; name: string; due: string | null }) {
  const p = project(pid)!
  if (!p.milestones) p.milestones = []
  if (data.id) {
    const m = p.milestones.find((m: any) => m.id === data.id)
    recordSlip(m, m.due, data.due)
    Object.assign(m, { name: data.name, due: data.due })
    return data.id
  }
  const id = uid('m')
  p.milestones.push({ id, name: data.name, due: data.due, createdBy: state.me })
  return id
}
// Returns an undo: puts the milestone back where it was and its tasks back in it.
export function deleteMilestone(pid: string, mid: string) {
  const p = project(pid)!
  const at = p.milestones.findIndex((m: any) => m.id === mid)
  const gone = p.milestones[at]
  const moved = state.tasks.filter((t) => t.space === pid && t.milestone === mid).map((t) => t.id)
  p.milestones = p.milestones.filter((m: any) => m.id !== mid)
  state.tasks.forEach((t) => {
    if (t.space === pid && t.milestone === mid) t.milestone = null
  })
  return () => {
    if (gone && !p.milestones.some((m: any) => m.id === mid)) p.milestones.splice(Math.max(0, at), 0, gone)
    moved.forEach((id) => {
      const t = task(id)
      if (t) t.milestone = mid
    })
  }
}
export function setTaskMilestone(id: string, mid: string | null) {
  const t = task(id)!
  t.milestone = mid
  const m = milestone(t.space, mid)
  log(t, m ? `moved this to the milestone “${m.name}”` : 'removed the milestone')
}

// Who's on what: open tasks per person in a project.
export function workload(pid: string) {
  const open = state.tasks.filter((t) => t.space === pid && !t.deletedAt && isOpenOrReview(t))
  const by: Record<string, number> = {}
  open.forEach((t) => {
    const k = t.assignee || '__none'
    by[k] = (by[k] || 0) + 1
  })
  return Object.entries(by)
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count)
}
const isOpenOrReview = (t: any) => isOpen(t) || t.status === 'review'

// Attachments
export function makeAttachment(input: any) {
  return { id: uid('a'), addedBy: state.me, at: now(), ...input }
}
export function addAttachment(id: string, a: any) {
  const t = task(id)!
  t.attachments.push(makeAttachment(a))
  log(t, `added ${a.name}`)
}
export function removeAttachment(id: string, aid: string) {
  const t = task(id)!
  t.attachments = t.attachments.filter((a: any) => a.id !== aid)
}

// Comments
export function mentionsIn(text: string) {
  const ids: string[] = []
  state.people.forEach((p) => {
    if (new RegExp(`@${p.name}\\b`, 'i').test(text)) ids.push(p.id)
  })
  return ids
}
export function addComment(id: string, text: string, replyTo: string | null = null) {
  const t = task(id)!
  t.comments.push({ id: uid('m'), author: state.me, text, at: now(), replyTo })
  t.updatedAt = now()
  // Only people who can open the task get a mention notification.
  const mentioned = mentionsIn(text).filter((p) => canSee(t, p))
  mentioned.forEach((p) => notify(p, { type: 'N5', actor: state.me, task: t.id }))
  notifyParticipants(t, { type: 'N9' }, mentioned)
  // Answering a "needs more info" suggestion closes it.
  if (t.suggestion?.kind === 'info' && state.me === t.assignedBy) {
    t.suggestion = null
    clearSuggestionNotes(t)
    notify(t.assignee, { type: 'N6b', actor: state.me, task: t.id, answer: 'replied' })
  }
}
export function editComment(id: string, cid: string, text: string) {
  const c = task(id)!.comments.find((c: any) => c.id === cid)
  if (c) {
    c.text = text
    c.edited = true
  }
}
export function deleteComment(id: string, cid: string) {
  const t = task(id)!
  t.comments = t.comments.filter((c: any) => c.id !== cid)
}

// Suggest a change (replaces "decline")
export function suggestChange(id: string, s: { kind: string; date?: string; person?: string; note?: string }) {
  const t = task(id)!
  t.suggestion = { ...s, by: state.me, at: now() }
  if (state.onboarding[state.me]) (state.onboarding[state.me] as any).asked = true
  const what = s.kind === 'date' ? 'suggested a new date' : s.kind === 'person' ? `suggested ${personName(s.person!)}` : 'asked for more info'
  log(t, what)
  if (s.kind === 'info' && s.note) {
    t.comments.push({ id: uid('m'), author: state.me, text: s.note, at: now(), question: true })
  }
  notify(t.assignedBy, { type: 'N6', actor: state.me, task: t.id, kind: s.kind })
}
export function answerSuggestion(id: string, accept: boolean) {
  const t = task(id)!
  const s = t.suggestion
  if (!s) return
  if (accept && s.kind === 'date') {
    recordSlip(t, t.due, s.date)
    t.due = s.date
    log(t, `accepted the new date: ${dayjs(s.date).format('ddd D MMM')}`)
  } else if (accept && s.kind === 'person') {
    t.suggestion = null
    reassign(id, s.person!)
  } else {
    log(t, s.kind === 'date' ? 'kept the original date' : `kept this with ${personName(t.assignee)}`)
  }
  notify(s.by, { type: 'N6b', actor: state.me, task: t.id, answer: accept ? 'accepted' : 'kept', kind: s.kind })
  t.suggestion = null
  clearSuggestionNotes(t)
}
export function withdrawSuggestion(id: string) {
  const t = task(id)!
  t.suggestion = null
  clearSuggestionNotes(t)
}

// Bulk
export function bulkUpdate(ids: string[], patch: any) {
  ids.forEach((id) => {
    const t = task(id)
    if (!t) return
    if (patch.status) setStatus(id, patch.status)
    if (patch.priority) updateTask(id, { priority: patch.priority })
    if ('assignee' in patch) reassign(id, patch.assignee)
  })
}

// ── Projects ───────────────────────────────────────────────────────────────

export function createProject(input: { name: string; code: string; description?: string; start?: string | null; target?: string | null; priority?: string | null; people?: string[] }) {
  const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid('')
  const p = {
    id,
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    description: input.description || '',
    status: 'active',
    // Nothing is decided for the Owner: no priority until they set one.
    priority: input.priority || null,
    start: input.start || null,
    target: input.target || null,
    milestones: [] as any[],
    updates: [] as any[],
    files: [] as any[],
    members: [{ user: state.me, role: 'Owner' }, ...(input.people || []).filter((u) => u !== state.me).map((u) => ({ user: u, role: 'Member' }))],
    joinRequests: [],
    invites: [],
    projInvites: [] as any[],
    // Workspaces on: it belongs to the workspace you're in
    ws: org.on ? currentWs.value?.id || 'frappe' : 'frappe',
  }
  state.projects.unshift(p)
  return p
}
// Project files: briefs, specs and links that belong to the project, not one task.
export function addProjectLink(pid: string, a: any) {
  const p = project(pid)!
  if (!p.files) p.files = []
  p.files.push({ id: uid('f'), addedBy: state.me, at: now(), ...a })
}
export function removeProjectFile(pid: string, fid: string) {
  const p = project(pid)!
  p.files = (p.files || []).filter((f: any) => f.id !== fid)
}
export function editProject(pid: string, patch: any) {
  Object.assign(project(pid)!, patch)
}
export function archiveProject(pid: string, archived = true) {
  project(pid)!.status = archived ? 'archived' : 'active'
}
export function deleteProject(pid: string) {
  state.projects = state.projects.filter((p) => p.id !== pid)
  state.tasks.forEach((t) => {
    if (t.space === pid) t.deletedAt = now()
  })
}
export function addMember(pid: string, user: string, role = 'Member') {
  const p = project(pid)!
  if (p.members.some((m) => m.user === user)) return
  p.members.push({ user, role })
  notify(user, { type: 'N8', actor: state.me, project: pid })
}
export function inviteByEmail(pid: string, email: string) {
  project(pid)!.invites.push({ email, invitedBy: state.me, at: now() })
}
export function removeMember(pid: string, user: string) {
  const p = project(pid)!
  p.members = p.members.filter((m) => m.user !== user)
  const lead = leadsOf(pid).find((l) => l !== user) || null
  state.tasks.forEach((t) => {
    if (t.space !== pid || t.status === 'done' || t.status === 'cancelled') return
    // Their open work goes back to unassigned. An open review round closes. History stays.
    if (t.assignee === user) {
      const r = lastRound(t)
      if (t.status === 'review' && r && !r.decision) Object.assign(r, { decision: 'withdrawn', decidedBy: user, decidedAt: now() })
      t.assignee = null
      t.status = 'todo'
      t.suggestion = null
      clearSuggestionNotes(t)
      log(t, `unassigned ${personName(user)} (left the project)`)
      if (lead) notify(lead, { type: 'N10', actor: state.me, task: t.id, reassigned: true })
    }
    // A reviewer who leaves hands the review to the Owner, so nothing gets stuck.
    if (t.reviewer === user && t.assignee) {
      t.reviewer = lead
      if (lead) {
        log(t, `made ${personName(lead)} the reviewer (${personName(user)} left the project)`)
        notify(lead, { type: 'N7', actor: state.me, task: t.id })
      }
    }
  })
}
export function setMemberRole(pid: string, user: string, role: string) {
  const m = project(pid)!.members.find((m) => m.user === user)
  if (m) m.role = role
}
export function leaveProject(pid: string) {
  removeMember(pid, state.me)
}
export function requestToJoin(pid: string, note: string) {
  const p = project(pid)!
  p.joinRequests.push({ id: uid('jr'), user: state.me, note, status: 'pending', at: now() })
  leadsOf(pid).forEach((l) => notify(l, { type: 'N13', actor: state.me, project: pid }))
}
export function myJoinRequest(pid: string) {
  return project(pid)?.joinRequests.find((r) => r.user === state.me && r.status === 'pending') || null
}
// Changed your mind: the request goes, and so does the Owner's notification about it.
export function cancelJoinRequest(pid: string) {
  const p = project(pid)
  if (!p) return
  p.joinRequests = p.joinRequests.filter((r) => !(r.user === state.me && r.status === 'pending'))
  state.notifications = state.notifications.filter((n) => !(n.type === 'N13' && n.actor === state.me && n.project === pid))
}
export function answerJoinRequest(pid: string, rid: string, approve: boolean, note = '') {
  const p = project(pid)!
  const r = p.joinRequests.find((r) => r.id === rid)
  if (!r) return
  r.status = approve ? 'approved' : 'notnow'
  r.decidedBy = state.me
  r.decisionNote = note
  if (approve) {
    p.members.push({ user: r.user, role: 'Member' })
    notify(r.user, { type: 'N14', actor: state.me, project: pid })
  } else {
    notify(r.user, { type: 'N15', actor: state.me, project: pid, note })
  }
  markProjectRequestsRead(pid)
}

export function projectStats(pid: string) {
  const list = state.tasks.filter((t) => t.space === pid && !t.deletedAt && t.status !== 'cancelled')
  const by = (s: string) => list.filter((t) => t.status === s).length
  const overdue = list.filter((t) => isOverdue(t)).length
  const done = by('done')
  return {
    total: list.length,
    backlog: by('backlog'),
    todo: by('todo'),
    progress: by('progress'),
    review: by('review'),
    done,
    overdue,
    pct: list.length ? Math.round((done / list.length) * 100) : 0,
  }
}

// ── People and session ────────────────────────────────────────────────────

export function setMe(id: string) {
  state.me = id
}
// Real Frappe session: log out on the server, then Frappe's login page brings you back here.
export function signOut() {
  state.signedIn = false
  const back = window.location.pathname.split('/').slice(0, window.location.pathname.startsWith('/dev/') ? 3 : 2).join('/')
  fetch('/api/method/logout', { method: 'POST', headers: { 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' } }).finally(() => {
    window.location.href = `/login?redirect-to=${encodeURIComponent(back + '/')}`
  })
}
export function signIn() {
  state.signedIn = true
}
// Where a person lands when they arrive. First visits go to setup or their invite.
export function firstRoute(id = state.me) {
  const p = person(id)
  if (id === 'newbie' && !p?.onboarded) return '/welcome'
  if (p && !p.onboarded) {
    const inv = state.invites.find((i) => i.user === id && !i.expired)
    if (inv) return `/invite/${inv.token}`
  }
  return '/'
}

export function finishOnboarding(id = state.me) {
  const p = person(id)
  if (p) p.onboarded = true
}
export function inviteToWorkspace(email: string, canCreateProjects = false) {
  const name = email.split('@')[0]
  const id = name.toLowerCase().replace(/[^a-z]/g, '') || uid('u')
  if (person(id)) return person(id)
  const p = {
    id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    role: '',
    email,
    isAdmin: false,
    canCreateProjects,
    onboarded: false,
    invited: true,
  }
  state.people.push(p)
  return p
}

// ── Search ────────────────────────────────────────────────────────────────

const strip = (html: string) => (html || '').replace(/<[^>]+>/g, ' ')

export function search(q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return { tasks: [], projects: [], people: [] }
  const tasks = visibleTasks.value
    .filter(
      (t) =>
        t.title.toLowerCase().includes(s) ||
        t.id.toLowerCase() === s ||
        strip(t.description).toLowerCase().includes(s) ||
        t.comments.some((c: any) => c.text.toLowerCase().includes(s)),
    )
    .sort((a, b) => {
      const closed = (t: any) => (t.status === 'done' || t.status === 'cancelled' ? 1 : 0)
      const inTitle = (t: any) => (t.title.toLowerCase().includes(s) ? 0 : 1)
      return closed(a) - closed(b) || inTitle(a) - inTitle(b)
    })
  // Workspaces on: only the current workspace, and only projects you're in (projects are joined by invite)
  const projects = state.projects.filter(
    (p) => p.status === 'active' && inScope(p) && (!org.on || isMember(p.id) || isLead(p.id)) && (p.name.toLowerCase().includes(s) || p.code.toLowerCase() === s),
  )
  const ppl = wsPeople.value.filter((p) => p.name.toLowerCase().includes(s))
  return { tasks, projects, people: ppl }
}

// ── Date slips ────────────────────────────────────────────────────────────
// Every time a deadline moves later (task or milestone), we keep a note of it. Repeated slips are the
// earliest warning a manager gets. Moving a date earlier isn't a slip.
export function recordSlip(x: any, from: string | null, to: string | null) {
  if (!x || !from || !to || !dayjs(to).isAfter(dayjs(from), 'day')) return
  x.slips = [...(x.slips || []), { from, to, at: now(), by: state.me }]
}
export const slipText = (x: any) => {
  const s = x?.slips || []
  if (!s.length) return ''
  return `Moved later ${s.length}× · first due ${dayjs(s[0].from).format('D MMM')}`
}

// ── Dependencies ───────────────────────────────────────────────────────────
// "Waiting on": tasks this one depends on that aren't done yet.
export const waitingOn = (t: any) =>
  (t.dependsOn || []).map((id: string) => task(id)).filter((d: any) => d && !d.deletedAt && d.status !== 'done')
export function setDependsOn(id: string, ids: string[]) {
  const t = task(id)!
  const added = ids.filter((x) => !(t.dependsOn || []).includes(x))
  t.dependsOn = ids
  added.forEach((x) => log(t, `made this wait on “${task(x)?.title}”`))
}

// ── Project health and status updates ─────────────────────────────────────
// The app suggests health from progress vs time (planned % = how much of the project's time has passed).
// The owner confirms or changes it by posting a short update; the latest update (last 14 days) wins.
export function planVsActual(pid: string) {
  const p = project(pid)
  const s = projectStats(pid)
  let planned: number | null = null
  if (p?.start && p?.target) {
    const total = Math.max(1, dayjs(p.target).diff(dayjs(p.start), 'day'))
    planned = Math.max(0, Math.min(100, Math.round((dayjs().diff(dayjs(p.start), 'day') / total) * 100)))
  }
  return { planned, actual: s.pct, diff: planned === null ? 0 : s.pct - planned }
}
export function suggestedHealth(pid: string) {
  const p = project(pid)
  if (!p) return 'on'
  if (p.status === 'completed') return 'done'
  if (p.status === 'onhold') return 'paused'
  const { diff } = planVsActual(pid)
  const late = milestonesOf(pid).some((m: any) => milestoneStatus(pid, m) === 'late')
  // A milestone at risk makes the project at risk too, so the header never says "On track" next to "1 at risk"
  const risky = milestonesOf(pid).some((m: any) => milestoneStatus(pid, m) === 'risk')
  return diff <= -25 || late ? 'off' : diff <= -10 || risky ? 'risk' : 'on'
}
export const latestUpdate = (pid: string) => {
  const u = project(pid)?.updates || []
  return u.length ? u[u.length - 1] : null
}
export function currentHealth(pid: string) {
  const p = project(pid)
  const suggested = suggestedHealth(pid)
  if (p?.status === 'completed' || p?.status === 'onhold') return { key: suggested, source: 'status', suggested, update: null }
  const u = latestUpdate(pid)
  if (u && withinDays(u.at, 14)) return { key: u.health, source: 'update', suggested, update: u }
  return { key: suggested, source: 'auto', suggested, update: null }
}
export function postUpdate(pid: string, health: string, note: string) {
  const p = project(pid)!
  if (!p.updates) p.updates = []
  p.updates.push({ id: uid('up'), health, note, by: state.me, at: now() })
  // Everyone in the project gets it in their Inbox (Updates), with the note itself.
  p.members.forEach((m: any) => notify(m.user, { type: 'N20', actor: state.me, project: pid, health, note }))
}

// ── Milestone status ─────────────────────────────────────────────────────────
// Reached · Late (past due) · At risk (due within a week and under half done, or not started) · On track · Not started
// ── Milestone teams ──
// In projects, people are assigned to a milestone, not to each task. One milestone can have several people;
// they all work on its tasks. Tasks with no milestone still have one assignee.
export function milestoneTeam(pid: string, mid: string | null | undefined): string[] {
  if (!mid) return []
  return milestone(pid, mid)?.people || []
}
// Who does this task: the milestone's team, or (no milestone / no team) its assignee.
export function taskPeople(t: any): string[] {
  // Personal projects: the owner does everything
  if (isSolo(t.space)) return [ownerOf(t.space)].filter(Boolean) as string[]
  if (t.space !== 'general' && t.milestone) {
    const team = milestoneTeam(t.space, t.milestone)
    if (team.length) return team
  }
  return t.assignee ? [t.assignee] : []
}
export function setMilestonePeople(pid: string, mid: string, people: string[]) {
  const m = milestone(pid, mid)
  if (!m) return
  m.people = [...new Set(people)]
  m.people.forEach((u: string) => ensureMember(pid, u))
}
// Seed: each milestone's team = the people already working on its tasks.
state.projects.forEach((p: any) =>
  (p.milestones || []).forEach((m: any) => {
    if (!m.people) m.people = [...new Set(state.tasks.filter((t: any) => t.space === p.id && t.milestone === m.id && t.assignee).map((t: any) => t.assignee))]
  }),
)

export function milestoneStatus(pid: string, m: any) {
  const s = milestoneStats(pid, m.id)
  if (s.total && s.done === s.total) return 'reached'
  const started = state.tasks.some(
    (t) => t.space === pid && t.milestone === m.id && !t.deletedAt && ['progress', 'review', 'done'].includes(t.status),
  )
  if (!m.due) return started ? 'on' : 'notstarted'
  const d = dayjs(m.due).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (d < 0) return 'late'
  if (d <= 7 && (!started || s.pct < 50)) return 'risk'
  return started ? 'on' : 'notstarted'
}

// ── Needs attention ─────────────────────────────────────────────────────────
// What a manager should look at in a project, each with one quick action. One line per task (worst first).
export function needsAttention(pid: string) {
  const today = dayjs().startOf('day')
  const within = (d: string | null, n: number) => !!d && dayjs(d).startOf('day').diff(today, 'day') <= n
  const out: any[] = []
  milestonesOf(pid).forEach((m: any) => {
    const st = milestoneStatus(pid, m)
    if (st === 'late' || st === 'risk')
      out.push({ key: `m-${m.id}`, rank: st === 'late' ? 1 : 3, kind: st === 'late' ? 'Milestone late' : 'Milestone at risk', milestone: m, person: null, action: 'view' })
  })
  state.tasks
    .filter((t) => t.space === pid && !t.deletedAt && t.status !== 'done')
    .forEach((t) => {
      const w = waitingOn(t)
      let item: any = null
      if (isOverdue(t) && taskPeople(t).length) item = { rank: 0, kind: `Overdue by ${daysOverdue(t)} ${daysOverdue(t) === 1 ? 'day' : 'days'}`, person: taskPeople(t)[0], action: 'remind' }
      else if (w.length && t.status !== 'backlog') item = { rank: 4, kind: 'Waiting on another task', note: `“${w[0].title}”`, person: t.assignee, action: 'open' }
      else if (!taskPeople(t).length && within(t.due, 7)) item = { rank: 5, kind: 'Unassigned', person: null, action: 'assign' }
      else if (t.status === 'review' && t.reviewer && waitedDays(submittedAt(t)) >= 2) item = { rank: 6, kind: `Waiting for review ${waitedDays(submittedAt(t))} days`, person: t.reviewer, action: 'remind' }
      else if (prioRank(t.priority) <= 2 && (t.status === 'todo' || t.status === 'backlog') && within(t.due, 7)) item = { rank: 7, kind: 'High priority, not started', person: t.assignee, action: 'remind' }
      else if ((t.slips || []).length >= 2) item = { rank: 8, kind: `Due date moved ${t.slips.length}×`, person: t.assignee, action: 'open' }
      if (item) out.push({ key: t.id, task: t, ...item })
    })
  return out.sort((a, b) => a.rank - b.rank)
}
// When each person was last reminded about a task (so Remind can say "Reminded" for a day instead of repeating)
export function remindedRecently(t: any, who: string | null) {
  const at = who ? t?.reminded?.[who] : null
  return !!at && dayjs().diff(dayjs(at), 'hour') < 24
}
export function remindTask(id: string, who: string | null) {
  const t = task(id)
  if (!t || !who) return
  t.reminded = { ...(t.reminded || {}), [who]: now() }
  log(t, `sent ${personName(who)} a reminder`)
  notify(who, { type: 'N21', actor: state.me, task: t.id })
}

// ── Subtasks and moving between levels (Planner) ───────────────────────────────────
// Subtasks stay light: name, done, person, and an optional due date.
export function addSubtask(id: string, text: string, extra: { assignee?: string | null; due?: string | null } = {}) {
  const t = task(id)!
  t.checklist.push({ id: uid('c'), text, done: false, source: 'manual', assignee: extra.assignee || null, due: extra.due || null })
  if (extra.assignee) ensureMember(t.space, extra.assignee)
  log(t, `added the subtask “${text}”`)
  if (extra.assignee && extra.assignee !== state.me) notify(extra.assignee, { type: 'N17', actor: state.me, task: t.id, subtask: text })
}
// A task becomes a subtask of another task in the same project (its title, person, date and done state carry over).
export function makeSubtask(id: string, parentId: string) {
  const t = task(id)!
  const parent = task(parentId)!
  parent.checklist.push({ id: uid('c'), text: t.title, done: t.status === 'done', source: 'moved', assignee: t.assignee, due: t.due })
  log(parent, `turned “${t.title}” into a subtask`)
  t.deletedAt = now()
  t.deletedBy = state.me
}
// A subtask grows into real work: it becomes a task in the same project and milestone.
export function subtaskToTask(id: string, itemId: string) {
  const parent = task(id)!
  const c = parent.checklist.find((x: any) => x.id === itemId)
  if (!c) return null
  const nt = addTask({ title: c.text, space: parent.space, assignee: c.assignee ?? parent.assignee, due: c.due || null, milestone: parent.milestone })
  if (c.done) setStatus(nt.id, 'done')
  parent.checklist = parent.checklist.filter((x: any) => x.id !== itemId)
  log(parent, `turned the subtask “${c.text}” into a task`)
  return nt
}

// ── Plan from a list (outline) ────────────────────────────────────────────────
// "Deals page polish: 20 Oct" or "# Deals page polish" (no bullet) → milestone
// "- Design the note dialog" → task · an indented "- Empty state" → subtask of the task above
// "> Match the CRM pattern" under a task → its notes (the task's description); more ">" lines add more lines
const BULLET = /^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s+/
const NOTE = /^\s*>\s?/
// Adds a "> note" line to the task above (notes under a milestone or subtask are dropped: they have no description)
function addNote(row: { kind?: string; note?: string } | undefined, raw: string) {
  if (!row || row.kind === 'milestone' || row.kind === 'subtask') return
  const line = raw.replace(NOTE, '').trim()
  if (line) row.note = row.note ? `${row.note}\n${line}` : line
}
// Notes text → the task's description (one paragraph per line)
export function noteHtml(note?: string) {
  if (!note) return ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return note
    .split('\n')
    .map((l) => `<p>${esc(l)}</p>`)
    .join('')
}
export function parseOutline(text: string) {
  const rows: { kind: 'milestone' | 'task' | 'subtask'; text: string; date?: string; note?: string }[] = []
  text.split(/\r?\n/).forEach((raw) => {
    if (!raw.trim()) return
    if (NOTE.test(raw)) return addNote(rows[rows.length - 1], raw)
    const indent = (raw.match(/^\s*/)?.[0] || '').replace(/\t/g, '  ').length
    const bullet = BULLET.test(raw)
    const body = raw.replace(BULLET, '').trim()
    if (!bullet && /^#+\s*/.test(body)) rows.push({ kind: 'milestone', text: body.replace(/^#+\s*/, '').trim() })
    else if (!bullet && body.includes(':')) {
      const [name, ...rest] = body.split(':')
      rows.push({ kind: 'milestone', text: name.trim(), date: rest.join(':').trim() })
    } else if (bullet && indent >= 2) rows.push({ kind: 'subtask', text: body })
    else rows.push({ kind: 'task', text: body })
  })
  return rows
}

// ── Paste to import ──────────────────────────────────────────────────────────
// One task per line. Bullets, numbers and [ ] are stripped; title shortcuts work per line (@name !1 fri).
// A "> note" line adds notes to the task above. "# Heading" lines (from a document) aren't tasks.
export function importLines(text: string) {
  const rows: { text: string; note?: string }[] = []
  text.split(/\r?\n/).forEach((raw) => {
    if (NOTE.test(raw)) return addNote(rows[rows.length - 1], raw)
    if (/^\s*#+\s/.test(raw)) return
    const l = raw.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim()
    if (l) rows.push({ text: l })
  })
  return rows
}

// ── Reminders ─────────────────────────────────────────────────────────────────
// Project work isn't on Home, so the Inbox reminds you (Action needed), every morning:
// your project task is due tomorrow / due today / overdue, or a milestone you're in is due within 3 days.
export function seedReminders() {
  const today = dayjs().startOf('day')
  const morning = dayjs().hour(9).minute(0).second(0)
  const when = (morning.isAfter(dayjs()) ? dayjs() : morning).toISOString()
  state.tasks.forEach((t) => {
    // (Personal tasks too, Round 246: they're the Personal workspace's only notifications)
    if (t.deletedAt || !t.assignee || !t.due || !isOpen(t)) return
    if (t.space !== 'general' && project(t.space)?.status !== 'active') return
    const diff = dayjs(t.due).startOf('day').diff(today, 'day')
    const kind = diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : null
    if (!kind) return
    if (state.notifications.some((n) => n.id === `r-${t.id}`)) return
    state.notifications.push({ id: `r-${t.id}`, to: t.assignee, type: 'R1', tab: 'needs', task: t.id, when: kind, at: when, read: false, count: 1 })
  })
  state.projects
    .filter((p) => p.status === 'active')
    .forEach((p) =>
      (p.milestones || []).forEach((m: any) => {
        if (!m.due) return
        const diff = dayjs(m.due).startOf('day').diff(today, 'day')
        const s = milestoneStats(p.id, m.id)
        if (diff < 0 || diff > 3 || (s.total && s.done === s.total)) return
        p.members.forEach((mem: any) =>
          !state.notifications.some((n) => n.id === `rm-${m.id}-${mem.user}`) &&
          state.notifications.push({
            id: `rm-${m.id}-${mem.user}`, to: mem.user, type: 'R2', tab: 'needs', project: p.id,
            milestone: m.name, days: diff, at: when, read: false, count: 1,
          }),
        )
      }),
    )
}
seedReminders()

// ── Weekly summary ─────────────────────────────────────────────────────────────

export function weekSummary() {
  const uid = state.me
  const done = state.tasks
    .filter((t) => !t.deletedAt && t.assignee === uid && t.status === 'done' && withinDays(t.doneAt, 7))
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
  const feedback = state.tasks
    .filter((t) => !t.deletedAt && t.assignee === uid)
    .flatMap((t) =>
      t.rounds
        .filter((r: any) => r.decidedAt && r.decision !== 'withdrawn' && withinDays(r.decidedAt, 7))
        .map((r: any) => ({ task: t, round: r })),
    )
    .sort((a, b) => (b.round.decidedAt || '').localeCompare(a.round.decidedAt || ''))
  const inReview = state.tasks.filter((t) => !t.deletedAt && t.assignee === uid && t.status === 'review')
  return { done, feedback, inReview }
}
