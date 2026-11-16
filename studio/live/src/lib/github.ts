import { reactive } from 'vue'
import { day } from './dates'

// Prototype GitHub: a pretend connection and a few Frappe repos with milestones and issues.
// Nothing leaves the browser. Shapes follow GitHub's own (milestone → issues, labels, assignee login).
export const github = reactive({ connected: false, connecting: false, account: '' })

export function connectGithub() {
  github.connecting = true
  return new Promise<void>((res) =>
    setTimeout(() => {
      github.connected = true
      github.connecting = false
      github.account = 'frappe'
      res()
    }, 900),
  )
}
export function disconnectGithub() {
  github.connected = false
  github.account = ''
}

export type GhIssue = { number: number; title: string; labels: string[]; assignee: string | null; open: boolean }
export type GhMilestone = { title: string; due: string | null; issues: GhIssue[] }
export type GhRepo = { name: string; project: string; milestones: GhMilestone[] }

const i = (number: number, title: string, labels: string[] = [], assignee: string | null = null, open = true): GhIssue => ({ number, title, labels, assignee, open })

export const REPOS: GhRepo[] = [
  {
    name: 'frappe/gameplan',
    project: 'gameplan',
    milestones: [
      {
        title: 'v2.1 Discussions',
        due: day(20),
        issues: [
          i(812, 'Thread view loads slowly on long threads', ['bug', 'performance'], 'priya'),
          i(815, 'Add a reactions picker to comments', ['design'], 'riya'),
          i(820, 'Unread badge wrong after “mark all read”', ['bug'], 'dev'),
          i(823, 'Keyboard shortcuts for threads', ['enhancement']),
          i(801, 'Fix the login redirect loop', ['bug'], 'dev', false),
        ],
      },
      {
        title: 'v2.2 Search',
        due: day(45),
        issues: [i(830, 'Search inside a space', ['enhancement'], 'kabir'), i(831, 'Filter search results by author', ['enhancement']), i(834, 'Highlight matches in results', ['design'], 'riya')],
      },
    ],
  },
  {
    name: 'frappe/crm',
    project: 'crm',
    milestones: [
      {
        title: 'Kanban beta',
        due: day(14),
        issues: [i(402, 'Drag cards between stages', ['enhancement'], 'karan'), i(405, 'Card field picker', ['design'], 'swarali'), i(409, 'Column totals on the Kanban view', ['enhancement']), i(398, 'Stage colours', ['design'], 'swarali', false)],
      },
      { title: 'Email sync', due: day(30), issues: [i(415, 'Gmail sign-in flow', ['enhancement'], 'karan'), i(418, 'Thread emails onto deals', ['enhancement'])] },
    ],
  },
  {
    name: 'frappe/erpnext',
    project: 'erpnext',
    milestones: [
      { title: 'v16 Accounting UX', due: day(25), issues: [i(3101, 'Simplify the journal entry form', ['design', 'accounts']), i(3104, 'Faster general ledger report', ['performance', 'accounts'], 'dev'), i(3110, 'Clearer payment reconciliation', ['accounts'])] },
    ],
  },
  {
    name: 'frappe/helpdesk',
    project: 'helpdesk',
    milestones: [{ title: 'SLA rework', due: day(18), issues: [i(220, 'Pause SLA while waiting on the customer', ['enhancement']), i(224, 'SLA breach warnings', ['enhancement'])] }],
  },
]

// ── GitHub Projects (the boards, \"Projects v2\") ──
// How it works on GitHub: a Project belongs to an organisation or a user and holds items: issues and pull requests
// (from any repo) and draft issues (only in the project). Each item has field values: Status (a single select:
// Todo / In Progress / Done by default, often more), Iteration (sprints with dates), and custom fields like Priority
// (P0 / P1 / P2) or a date. Reading them needs the read:project permission (an OAuth scope, or Projects: read on a
// GitHub App installed on the organisation). Our import: pick a project → match its Status options to ours →
// iterations become milestones → pick which items → import, and optionally keep it in sync.
export type GhItem = {
  type: 'issue' | 'draft' | 'pr'
  number?: number
  repo?: string
  title: string
  status: string
  iteration: string | null
  priority: 'P0' | 'P1' | 'P2' | null
  assignees: string[]
  labels: string[]
  closed?: boolean
}
export type GhIteration = { title: string; start: string; end: string }
export type GhProject = { owner: string; number: number; title: string; project: string; statuses: string[]; iterations: GhIteration[]; items: GhItem[] }

const it = (type: GhItem['type'], title: string, status: string, iteration: string | null, priority: GhItem['priority'], assignees: string[] = [], extra: Partial<GhItem> = {}): GhItem => ({
  type,
  title,
  status,
  iteration,
  priority,
  assignees,
  labels: [],
  ...extra,
})

export const GH_PROJECTS: GhProject[] = [
  {
    owner: 'frappe',
    number: 12,
    title: 'CRM Roadmap',
    project: 'crm',
    statuses: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'],
    iterations: [
      { title: 'Sprint 14', start: day(-4), end: day(10) },
      { title: 'Sprint 15', start: day(11), end: day(24) },
    ],
    items: [
      it('issue', 'Drag cards between stages', 'In Progress', 'Sprint 14', 'P1', ['karan'], { number: 402, repo: 'frappe/crm', labels: ['enhancement'] }),
      it('issue', 'Card field picker', 'In Review', 'Sprint 14', 'P0', ['swarali'], { number: 405, repo: 'frappe/crm', labels: ['design'] }),
      it('draft', 'Empty state for a stage with no deals', 'Todo', 'Sprint 14', 'P2', ['swarali']),
      it('issue', 'Column totals on the Kanban view', 'Todo', 'Sprint 15', 'P1', [], { number: 409, repo: 'frappe/crm', labels: ['enhancement'] }),
      it('pr', 'Kanban: persist column order', 'In Review', 'Sprint 14', null, ['karan'], { number: 411, repo: 'frappe/crm' }),
      it('issue', 'Gmail sign-in flow', 'Backlog', null, 'P2', ['karan'], { number: 415, repo: 'frappe/crm', labels: ['enhancement'] }),
      it('draft', 'Write the Kanban beta announcement', 'Backlog', 'Sprint 15', null, ['swarali']),
      it('issue', 'Stage colours', 'Done', 'Sprint 14', 'P2', ['swarali'], { number: 398, repo: 'frappe/crm', labels: ['design'], closed: true }),
    ],
  },
  {
    owner: 'frappe',
    number: 7,
    title: 'Gameplan v2',
    project: 'gameplan',
    statuses: ['Todo', 'In Progress', 'Done'],
    iterations: [{ title: 'Cycle 9', start: day(-7), end: day(7) }],
    items: [
      it('issue', 'Thread view loads slowly on long threads', 'In Progress', 'Cycle 9', 'P0', ['priya'], { number: 812, repo: 'frappe/gameplan', labels: ['bug'] }),
      it('issue', 'Add a reactions picker to comments', 'Todo', 'Cycle 9', 'P1', ['riya'], { number: 815, repo: 'frappe/gameplan', labels: ['design'] }),
      it('draft', 'Audit icon usage across spaces', 'Todo', 'Cycle 9', 'P2', ['swarali']),
      it('issue', 'Keyboard shortcuts for threads', 'Todo', null, null, [], { number: 823, repo: 'frappe/gameplan', labels: ['enhancement'] }),
      it('pr', 'Faster thread pagination', 'In Progress', 'Cycle 9', null, ['dev'], { number: 840, repo: 'frappe/gameplan' }),
      it('issue', 'Fix the login redirect loop', 'Done', 'Cycle 9', 'P1', ['dev'], { number: 801, repo: 'frappe/gameplan', labels: ['bug'], closed: true }),
    ],
  },
]
