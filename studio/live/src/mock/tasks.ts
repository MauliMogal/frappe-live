import { day, at, hoursAgo } from '../lib/dates'

// Demo tasks. Each one exists to show one flow or edge case (named above it). Nothing else.
// Two people: Swarali and Neha. Dates are relative to today.
// space: 'general' or a project id.
// status: todo | progress | review | done | cancelled  (review only when the task has a check step)
// changesRequested is a flag, not a status. (No "blocked" flag: removed.)
// reviewer is set only when the person who gave the task ticked "Check before it's done".
// Without it, the assignee just marks it done; the giver is told and replies "Looks good" or asks for changes (ack).
// milestone: the project milestone this task belongs to (null = "No milestone").
// checklist = subtasks: { id, text, done, assignee? }. A subtask can go to someone else; it shows on their Home.

const base = {
  description: '',
  labels: [],
  checklist: [],
  attachments: [],
  rounds: [],
  comments: [],
  activity: [],
  suggestion: null,
  changesRequested: false,
  // P1 (urgent) → P5 (someday). Older values high/medium/low still read as P2/P3/P4.
  priority: 'p3',
  due: null,
  doneAt: null,
  deletedAt: null,
  mutedBy: [],
  nudgedAt: null,
  ack: null as string | null,
  milestone: null as string | null,
  // Optional start date (Timeline uses it; otherwise the day it was created).
  start: null as string | null,
  // Tasks this one waits on ("depends on"). Unfinished ones show as "Waiting on".
  dependsOn: [] as string[],
  // Each time the deadline moved later: { from, to, at, by }.
  slips: [] as any[],
}

const own = (id: string, space: string, who: string) => ({
  id,
  space,
  createdBy: who,
  assignee: who,
  assignedBy: who,
  reviewer: null,
})

// Given to someone. check = "Check before it's done" was ticked, so the giver reviews it.
const given = (id: string, space: string, from: string, to: string, check = false) => ({
  id,
  space,
  createdBy: from,
  assignee: to,
  assignedBy: from,
  reviewer: check ? from : null,
})

const round = (n: number, by: string, note: string, submittedAt: string, attachments: string[] = []) => ({
  n,
  submittedBy: by,
  note,
  attachments,
  submittedAt,
  decision: null as string | null,
  decidedBy: null as string | null,
  points: [] as string[],
  decisionNote: '',
  decidedAt: null as string | null,
})

// ── The wider team's work (data only) ──
// Neha gives these out. A realistic mix: done this week, in progress, under review, overdue, open, backlog.
// Priya is deliberately overloaded in Gameplan so "By person" shows "Too much".
type T = [string, string, string | null, string, string | null, string, number | null, string | null, number?]
function team(rows: T[]) {
  return rows.map(([id, space, to, title, milestone, status, due, priority, doneDaysAgo]) => ({
    ...base,
    id,
    space,
    createdBy: 'neha',
    assignee: to,
    assignedBy: to ? 'neha' : null,
    reviewer: null,
    title,
    milestone,
    status,
    due: due === null ? null : day(due),
    priority,
    // Created before it was finished (older finished work was created earlier)
    createdAt: at(-Math.max(12, (doneDaysAgo ?? 0) + 5), 10),
    doneAt: status === 'done' ? at(-(doneDaysAgo ?? 2), 16) : null,
    activity: [{ actor: 'neha', text: to ? 'created this task and assigned it' : 'created this task', at: at(-Math.max(12, (doneDaysAgo ?? 0) + 5), 10) }],
  }))
}
const teamTasks = team([
  // Gameplan · Discussions v2 design (gp-m1)
  ['GP-10', 'gameplan', 'priya', 'Build the thread view', 'gp-m1', 'progress', 3, 'p2'],
  ['GP-11', 'gameplan', 'priya', 'Reply composer with mentions', 'gp-m1', 'todo', 4, 'p2'],
  ['GP-12', 'gameplan', 'priya', 'Keyboard shortcuts for threads', 'gp-m1', 'todo', 5, 'p3'],
  ['GP-13', 'gameplan', 'karan', 'Thread API: pagination', 'gp-m1', 'done', -1, 'p2', 1],
  ['GP-14', 'gameplan', 'karan', 'Unread counts per discussion', 'gp-m1', 'progress', -1, 'p1'],
  ['GP-15', 'gameplan', 'riya', 'Discussion list density options', 'gp-m1', 'done', -2, 'p3', 3],
  ['GP-16', 'gameplan', 'ananya', 'Empty-state and onboarding copy', 'gp-m1', 'review', 1, 'p3'],
  ['GP-17', 'gameplan', 'kabir', 'Mobile thread layout', 'gp-m1', 'progress', 4, 'p2'],
  // Gameplan · Design QA (gp-m2)
  ['GP-18', 'gameplan', 'ishaan', 'Test plan for Discussions v2', 'gp-m2', 'progress', 8, 'p2'],
  ['GP-19', 'gameplan', 'ishaan', 'Regression run on Safari', 'gp-m2', 'todo', 15, 'p3'],
  ['GP-20', 'gameplan', 'priya', 'Fix focus rings across the app', 'gp-m2', 'todo', 12, 'p3'],
  ['GP-21', 'gameplan', 'priya', 'Accessibility pass on menus', 'gp-m2', 'backlog', null, 'p4'],
  ['GP-22', 'gameplan', 'dev', 'Usage dashboard for Discussions', 'gp-m2', 'todo', 18, 'p4'],
  ['GP-23', 'gameplan', null, 'Write release notes', 'gp-m2', 'todo', 19, 'p3'],
  ['GP-24', 'gameplan', 'riya', 'Final visual QA', 'gp-m2', 'backlog', null, null],
  // CRM · Deals page polish (crm-m1)
  ['CRM-10', 'crm', 'priya', 'Deals table: sticky header', 'crm-m1', 'done', -1, 'p3', 2],
  ['CRM-11', 'crm', 'karan', 'Deal stage history API', 'crm-m1', 'progress', -3, 'p1'],
  ['CRM-12', 'crm', 'dev', 'Win-rate numbers check', 'crm-m1', 'review', 1, 'p2'],
  ['CRM-13', 'crm', 'ananya', 'Help article: managing deals', 'crm-m1', 'todo', 2, 'p4'],
  ['CRM-14', 'crm', 'ishaan', 'Test the Deals page filters', 'crm-m1', 'todo', 2, 'p2'],
  // CRM · Kanban beta (crm-m2)
  ['CRM-15', 'crm', 'priya', 'Kanban drag and drop', 'crm-m2', 'progress', 9, 'p2'],
  ['CRM-16', 'crm', 'karan', 'Custom fields API', 'crm-m2', 'progress', 6, 'p1'],
  ['CRM-17', 'crm', 'tara', 'Collect beta feedback from support', 'crm-m2', 'todo', 12, 'p3'],
  ['CRM-18', 'crm', 'dev', 'Beta usage tracking', 'crm-m2', 'done', 0, 'p3', 1],
  ['CRM-19', 'crm', null, 'Kanban empty columns', 'crm-m2', 'todo', 11, 'p4'],
  // Helpdesk (on hold, owned by Rohan)
  ['HD-1', 'helpdesk', 'tara', 'SLA timer on tickets', 'hd-2', 'progress', 10, 'p2'],
  ['HD-2', 'helpdesk', 'ishaan', 'Test email-to-ticket', 'hd-3', 'todo', 14, 'p3'],
  ['HD-3', 'helpdesk', 'kabir', 'Agent app: ticket list', 'hd-4', 'backlog', null, 'p3'],
  ['HD-4', 'helpdesk', 'ananya', 'Canned responses copy', 'hd-1', 'done', -4, 'p4', 5],
  ['HD-5', 'helpdesk', 'tara', 'Escalation rules', 'hd-2', 'todo', 20, 'p2'],
  // Espresso icons (completed)
  ['ES-4', 'espresso', 'riya', 'Icon usage guide', 'es-4', 'done', -10, 'p3', 10],
  ['ES-5', 'espresso', 'riya', 'Publish the Figma kit', 'es-5', 'done', -12, 'p3', 12],
  // Reached milestones (one finished task each), so past milestones read "Reached"
  ['GP-30', 'gameplan', 'riya', 'Interview 8 remote teams', 'gp-p1', 'done', -26, 'p2', 26],
  ['GP-31', 'gameplan', 'riya', 'Sitemap for Discussions', 'gp-p2', 'done', -13, 'p2', 13],
  ['CRM-30', 'crm', 'priya', 'Web-to-lead form', 'crm-p1', 'done', -41, 'p2', 41],
  ['CRM-31', 'crm', 'karan', 'Pipeline board API', 'crm-p2', 'done', -21, 'p2', 21],
  ['ERP-30', 'erpnext', 'dev', 'v16 scope document', 'erp-p1', 'done', -31, 'p2', 31],
  ['ERP-31', 'erpnext', 'priya', 'Update form components', 'erp-p2', 'done', -16, 'p2', 16],
  ['HR-30', 'hrms', 'priya', 'Portal layout and login', 'hr-p1', 'done', -11, 'p2', 11],
  ['FC-30', 'cloud', 'karan', 'Mumbai region servers', 'fc-p1', 'done', -21, 'p1', 21],
  ['FB-30', 'builder', 'riya', 'First 20 blocks', 'fb-p1', 'done', -6, 'p2', 6],
  ['LMS-30', 'lms', 'ananya', 'Course landing page', 'lms-p1', 'done', -41, 'p3', 41],
  ['DR-30', 'drive', 'kabir', 'File previews', 'dr-p1', 'done', -61, 'p2', 61],
  ['DR-31', 'drive', 'priya', 'Folder tree', 'dr-p2', 'done', -41, 'p2', 41],
  ['DR-32', 'drive', 'karan', 'Search index', 'dr-p3', 'done', -26, 'p2', 26],
  ['DR-33', 'drive', 'kabir', 'Desktop sync client', 'dr-p4', 'done', -7, 'p2', 7],
  // A first task in some upcoming milestones (most later ones are still empty, like real plans)
  ['GP-32', 'gameplan', 'dev', 'Pick the 5 beta teams', 'gp-m3', 'todo', 25, 'p3'],
  ['CRM-32', 'crm', 'karan', 'Gmail sync spike', 'crm-m3', 'todo', 18, 'p2'],
  ['ERP-32', 'erpnext', 'karan', 'Payroll rounding bug', 'erp-m3', 'todo', 15, 'p2'],
  ['FC-31', 'cloud', 'dev', 'Backups list design', 'fc-m3', 'progress', 6, 'p2'],
  // ERPNext v16
  ['ERP-1', 'erpnext', 'swarali', 'Redesign the journal entry form', 'erp-m1', 'progress', 5, 'p2'],
  ['ERP-2', 'erpnext', 'karan', 'Faster general ledger report', 'erp-m1', 'progress', 7, 'p1'],
  ['ERP-3', 'erpnext', 'priya', 'New chart of accounts tree', 'erp-m1', 'done', 0, 'p2', 1],
  ['ERP-4', 'erpnext', 'ananya', 'Accounting docs for v16', 'erp-m2', 'todo', 30, 'p3'],
  ['ERP-5', 'erpnext', 'ishaan', 'Test multi-currency invoices', 'erp-m1', 'todo', 8, 'p2'],
  ['ERP-6', 'erpnext', 'dev', 'Report usage numbers', 'erp-m2', 'todo', 25, 'p4'],
  ['ERP-7', 'erpnext', 'tara', 'Collect top support issues for v16', 'erp-m2', 'done', -2, 'p3', 3],
  ['ERP-8', 'erpnext', null, 'Migration guide from v15', 'erp-m2', 'todo', 33, 'p2'],
  // Frappe HR Portal (Owner Priya)
  ['HR-1', 'hrms', 'riya', 'Leave request screens', 'hr-m1', 'review', 2, 'p2'],
  ['HR-2', 'hrms', 'karan', 'Attendance API', 'hr-m1', 'progress', -1, 'p1'],
  ['HR-3', 'hrms', 'riya', 'Payslip layout', 'hr-m2', 'todo', 20, 'p3'],
  ['HR-4', 'hrms', 'ishaan', 'Test leave balances', 'hr-m1', 'todo', 5, 'p2'],
  ['HR-5', 'hrms', 'ananya', 'Portal welcome copy', 'hr-m1', 'done', -1, 'p4', 2],
  // Frappe Cloud (Owner Karan) — Swarali and Neha aren't in it
  ['FC-1', 'cloud', 'kabir', 'Region picker', 'fc-m1', 'progress', -2, 'p1'],
  ['FC-2', 'cloud', 'tara', 'Setup failure messages', 'fc-m1', 'todo', -1, 'p2'],
  ['FC-3', 'cloud', 'dev', 'Billing usage charts', 'fc-m2', 'progress', 12, 'p2'],
  ['FC-4', 'cloud', 'ishaan', 'Load test site creation', 'fc-m1', 'done', -3, 'p2', 3],
  ['FC-5', 'cloud', 'priya', 'Invoice download', 'fc-m2', 'todo', 14, 'p3'],
  // Frappe Builder (Owner Riya)
  ['FB-1', 'builder', 'riya', 'Template card design', 'fb-m1', 'todo', 9, 'p3'],
  ['FB-2', 'builder', 'priya', 'Template preview', 'fb-m1', 'progress', 10, 'p2'],
  ['FB-3', 'builder', 'ananya', 'Template descriptions', 'fb-m1', 'todo', 11, 'p4'],
  // Frappe LMS (on hold, Owner Ananya)
  ['LMS-1', 'lms', 'dev', 'Quiz scoring rules', 'lms-m1', 'backlog', null, 'p3'],
  ['LMS-2', 'lms', 'kabir', 'Course player on mobile', 'lms-m1', 'todo', 25, 'p3'],
  // Frappe Drive (completed, Owner Kabir)
  ['DR-1', 'drive', 'priya', 'Share dialog', 'dr-m1', 'done', -12, 'p2', 12],
  ['DR-2', 'drive', 'karan', 'Permission checks', 'dr-m1', 'done', -11, 'p1', 11],
  ['DR-3', 'drive', 'ishaan', 'Sharing test pass', 'dr-m1', 'done', -9, 'p2', 9],
])

export const tasks = [
  ...teamTasks,
  // ── Swarali's personal tasks (My tasks in Personal, Round 250): life and learning, nothing about Frappe ──
  // A mix: due today (with subtasks), overdue, this week, later, no date, done, backlog.
  ...[
    { id: 'T-1', title: 'Finish module 4 of the UX research course', status: 'progress', priority: 'p3', due: day(0), labels: ['Learning'], from: -3,
      checklist: [{ id: 'c1', text: 'Watch the interview videos', done: true, source: 'manual' }, { id: 'c2', text: 'Do the persona exercise', done: false, source: 'manual' }] },
    { id: 'T-2', title: 'Pay the electricity bill', status: 'todo', priority: 'p2', due: day(-1), labels: ['Home'], from: -4 },
    { id: 'T-3', title: 'Book train tickets home for Diwali', status: 'todo', priority: 'p1', due: day(1), labels: ['Travel'], from: -2 },
    { id: 'T-4', title: 'Read chapters 3 and 4 of Refactoring UI', status: 'todo', priority: 'p4', due: day(3), labels: ['Learning'], from: -1,
      attachments: [{ id: 'a1', type: 'link', name: 'Refactoring UI', url: 'https://www.refactoringui.com', addedBy: 'swarali', at: at(-1, 11) }] },
    { id: 'T-8', title: 'Ask the college for my internship letter', status: 'todo', priority: 'p3', due: day(5), labels: ['College'], from: -2 },
    { id: 'T-9', title: 'Sketch for 20 minutes a day', status: 'progress', priority: 'p4', due: null, labels: ['Habit'], from: -10 },
    { id: 'T-10', title: 'Back up phone photos to the drive', status: 'done', priority: 'p4', due: day(-1), labels: ['Home'], from: -5, doneAt: at(-1, 20) },
    { id: 'T-11', title: 'Learn the basics of Framer', status: 'backlog', priority: 'p5', due: null, labels: ['Learning'], from: -6 },
  ].map(({ from, ...x }) => ({
    ...base,
    ...own(x.id, 'general', 'swarali'),
    ...x,
    createdAt: at(from, 9),
    activity: [{ actor: 'swarali', text: 'created this task', at: at(from, 9) }],
  })),
  // ── Swarali's own Frappe work, in no project (Round 253): My tasks in the Frappe workspace. Raven posts, replies,
  //    demos, small chores. Only hers (own tasks are never assigned). Project tasks always sit in a milestone. ──
  ...[
    { id: 'W-1', title: 'Post the Discussions v2 design update on Raven', status: 'todo', priority: 'p2', due: day(1), labels: ['Update'] },
    { id: 'W-2', title: "Reply to Neha's comments on the empty-state thread", status: 'todo', priority: 'p1', due: day(0), labels: ['Feedback'] },
    { id: 'W-3', title: 'Write a Raven post about the Deals page polish', status: 'todo', priority: 'p3', due: day(3), labels: ['Update'] },
    { id: 'W-4', title: 'Demo the Add note dialog at the Friday sync', status: 'todo', priority: 'p2', due: day(2), labels: ['Demo'] },
    { id: 'W-5', title: 'Share the journal entry explorations in #design on Raven', status: 'progress', priority: 'p2', due: day(0), labels: ['Update'] },
    { id: 'W-6', title: 'Update the Espresso component checklist', status: 'backlog', priority: 'p4', due: null, labels: [] },
    { id: 'W-7', title: 'Weekly design update on Raven', status: 'done', priority: 'p3', due: day(-4), labels: ['Update'], doneAt: at(-4, 17) },
  ].map((x) => ({
    ...base,
    ...own(x.id, 'general', 'swarali'),
    ws: 'frappe',
    ...x,
    createdAt: at(-3, 10),
    activity: [{ actor: 'swarali', text: 'created this task', at: at(-3, 10) }],
  })),
  // Neha's own General tasks: one for today, one upcoming, one in backlog.
  {
    ...base,
    ...own('T-5', 'general', 'neha'),
    title: 'Prepare the Q4 roadmap review',
    status: 'progress',
    priority: 'p1',
    due: day(0),
    checklist: [
      { id: 'c1', text: 'Collect updates from each project', done: true, source: 'manual' },
      { id: 'c2', text: 'Draft the slides', done: false, source: 'manual' },
      { id: 'c3', text: 'Book the meeting room', done: false, source: 'manual' },
    ],
    createdAt: at(-3, 9),
    activity: [{ actor: 'neha', text: 'created this task', at: at(-3, 9) }],
  },
  {
    ...base,
    ...own('T-6', 'general', 'neha'),
    title: 'Book the venue for the team offsite',
    status: 'todo',
    due: day(4),
    createdAt: at(-1, 14),
    activity: [{ actor: 'neha', text: 'created this task', at: at(-1, 14) }],
  },
  {
    ...base,
    ...own('T-7', 'general', 'neha'),
    title: 'Plan the intern demo day',
    status: 'backlog',
    priority: 'p5',
    createdAt: at(-6, 11),
    activity: [{ actor: 'neha', text: 'created this task', at: at(-6, 11) }],
  },

  // ── Gameplan (Owner: Neha) ──────────────────────────

  // Check step, round 2: Neha asked for changes; the points became subtasks. Swarali submits again.
  {
    ...base,
    ...given('GP-1', 'gameplan', 'neha', 'swarali', true),
    title: 'Redesign the discussion empty state',
    milestone: 'gp-m1',
    start: day(-4),
    status: 'progress',
    changesRequested: true,
    priority: 'high',
    due: day(2),
    labels: ['Design'],
    description: '<p>The empty state for a new discussion feels blank. Match the pattern we use in CRM.</p>',
    checklist: [
      { id: 'c1', text: 'Use option B copy.', done: false, source: 'review', round: 1 },
      { id: 'c2', text: 'Remove the illustration.', done: false, source: 'review', round: 1 },
    ],
    attachments: [
      { id: 'a1', type: 'link', name: 'Figma · Empty state v1', url: 'https://figma.com', addedBy: 'swarali', at: hoursAgo(27) },
      { id: 'a2', type: 'image', name: 'empty-state-v1.png', size: '412 KB', addedBy: 'swarali', at: hoursAgo(27) },
    ],
    rounds: [
      {
        ...round(1, 'swarali', 'Matched the CRM pattern. Two copy options in Figma.', hoursAgo(27), ['a1', 'a2']),
        decision: 'changes',
        decidedBy: 'neha',
        points: ['Use option B copy.', 'Remove the illustration.'],
        decidedAt: hoursAgo(3),
      },
    ],
    comments: [
      { id: 'm1', author: 'neha', text: '@Swarali the layout is right. Just the two points above.', at: hoursAgo(3) },
    ],
    createdAt: at(-4, 10),
    activity: [
      { actor: 'neha', text: 'created this task and assigned it to Swarali', at: at(-4, 10) },
      { actor: 'swarali', text: 'submitted this for review', at: hoursAgo(27) },
      { actor: 'neha', text: 'asked for changes', at: hoursAgo(3) },
    ],
  },
  // Check step, submitted 3 days ago and still waiting: Swarali can Nudge; Neha sees it in "Waiting on you".
  {
    ...base,
    ...given('GP-2', 'gameplan', 'neha', 'swarali', true),
    title: 'Discussion card hover states',
    milestone: 'gp-m1',
    status: 'review',
    due: day(-1),
    labels: ['Design'],
    attachments: [
      { id: 'a1', type: 'link', name: 'Figma · Card states', url: 'https://figma.com', addedBy: 'swarali', at: at(-3, 17) },
    ],
    rounds: [round(1, 'swarali', 'Hover, focus and pressed states are in Figma.', at(-3, 17), ['a1'])],
    createdAt: at(-6, 10),
    activity: [
      { actor: 'neha', text: 'created this task and assigned it to Swarali', at: at(-6, 10) },
      { actor: 'swarali', text: 'submitted this for review', at: at(-3, 17) },
    ],
  },
  // Ask before starting: Swarali needs more info. Neha answers by replying.
  {
    ...base,
    ...given('GP-3', 'gameplan', 'neha', 'swarali'),
    title: 'Audit icon usage in Gameplan',
    milestone: 'gp-m2',
    // Waits on the empty-state redesign (it changes which icons are used).
    dependsOn: ['GP-1'],
    status: 'todo',
    due: day(5),
    description: '<p>List every icon we use, and where. Flag any that are not from Lucide.</p>',
    suggestion: { kind: 'info', by: 'swarali', note: 'Should I include the mobile app too?', at: hoursAgo(1) },
    comments: [{ id: 'm1', author: 'swarali', text: 'Should I include the mobile app too?', at: hoursAgo(1), question: true }],
    createdAt: hoursAgo(20),
    activity: [
      { actor: 'neha', text: 'created this task and assigned it to Swarali', at: hoursAgo(20) },
      { actor: 'swarali', text: 'asked for more info', at: hoursAgo(1) },
    ],
  },
  // Own task inside a project: "Mark done".
  {
    ...base,
    ...own('GP-4', 'gameplan', 'swarali'),
    milestone: 'gp-m2',
    title: 'Collect screenshots of the current task UI',
    status: 'progress',
    priority: 'low',
    createdAt: at(-2, 15),
    activity: [{ actor: 'swarali', text: 'created this task', at: at(-2, 15) }],
  },
  // Finished check loop: changes, then approved with a note. Feeds "Done this week" and the weekly summary.
  {
    ...base,
    ...given('GP-5', 'gameplan', 'neha', 'swarali', true),
    title: 'Design reactions for comments',
    milestone: 'gp-m1',
    status: 'done',
    due: day(-3),
    labels: ['Design'],
    checklist: [
      { id: 'c1', text: 'Limit to 6 reactions.', done: true, source: 'review', round: 1 },
    ],
    rounds: [
      {
        ...round(1, 'swarali', 'Added an emoji picker and reaction chips.', at(-6, 15)),
        decision: 'changes',
        decidedBy: 'neha',
        points: ['Limit to 6 reactions.'],
        decidedAt: at(-5, 11),
      },
      {
        ...round(2, 'swarali', 'Limited to 6.', at(-4, 14)),
        decision: 'approved',
        decidedBy: 'neha',
        decisionNote: 'Looks great. Ship it.',
        decidedAt: at(-3, 10),
      },
    ],
    createdAt: at(-8, 10),
    doneAt: at(-3, 10),
    activity: [
      { actor: 'neha', text: 'created this task and assigned it to Swarali', at: at(-8, 10) },
      { actor: 'swarali', text: 'submitted this for review', at: at(-6, 15) },
      { actor: 'neha', text: 'asked for changes', at: at(-5, 11) },
      { actor: 'swarali', text: 'submitted this again', at: at(-4, 14) },
      { actor: 'neha', text: 'approved this', at: at(-3, 10) },
    ],
  },

  // ── CRM (Owner: Neha) ──────────────────────────────

  // Check step, waiting on Neha → Neha's "Waiting on you", Swarali's "Waiting on others".
  {
    ...base,
    ...given('CRM-1', 'crm', 'neha', 'swarali', true),
    title: 'Design the "Add note" dialog',
    milestone: 'crm-m1',
    status: 'review',
    due: day(1),
    priority: 'high',
    labels: ['Design'],
    description: '<p>Notes on a deal should be quick to add. One field, optional title.</p>',
    attachments: [
      { id: 'a1', type: 'link', name: 'Figma · Add note', url: 'https://figma.com', addedBy: 'swarali', at: hoursAgo(26) },
    ],
    rounds: [round(1, 'swarali', 'Two layouts in Figma. Option A keeps the editor full width.', hoursAgo(26), ['a1'])],
    createdAt: at(-5, 11),
    activity: [
      { actor: 'neha', text: 'created this task and assigned it to Swarali', at: at(-5, 11) },
      { actor: 'swarali', text: 'submitted this for review', at: hoursAgo(26) },
    ],
  },
  // Overdue → Swarali can't move the date (Neha set it), so she suggested a new one. Neha accepts or keeps.
  {
    ...base,
    ...given('CRM-2', 'crm', 'neha', 'swarali'),
    title: 'Review CRM copy for the Deals page',
    priority: 'p1',
    slips: [{ from: day(-5), to: day(-2), at: hoursAgo(150), by: 'neha' }],
    milestone: 'crm-m1',
    status: 'todo',
    due: day(-2),
    labels: ['Copy'],
    suggestion: { kind: 'date', by: 'swarali', date: day(2), note: "I'm waiting for the final copy doc.", at: hoursAgo(2) },
    createdAt: at(-6, 12),
    activity: [
      { actor: 'neha', text: 'created this task and assigned it to Swarali', at: at(-6, 12) },
      { actor: 'swarali', text: 'suggested a new date', at: hoursAgo(2) },
    ],
  },
  // Neha's own task. Swarali sees it but can't move it.
  // One subtask is Swarali's, so it shows on her Home under "Your subtasks".
  {
    ...base,
    ...own('CRM-3', 'crm', 'neha'),
    title: 'Kanban card field picker',
    milestone: 'crm-m2',
    start: day(-7),
    slips: [
      { from: day(-3), to: day(0), at: hoursAgo(200), by: 'neha' },
      { from: day(0), to: day(3), at: hoursAgo(48), by: 'neha' },
    ],
    checklist: [
      { id: 's1', text: 'Design the field picker menu', done: false, source: 'manual', assignee: 'swarali' },
      { id: 's2', text: 'Wire it to the custom fields API', done: false, source: 'manual', assignee: 'neha' },
      { id: 's3', text: 'Save the choice per user', done: true, source: 'manual', assignee: 'neha' },
    ],
    status: 'progress',
    due: day(3),
    createdAt: at(-7, 10),
    activity: [
      { actor: 'neha', text: 'created this task', at: at(-7, 10) },
      { actor: 'neha', text: 'gave the subtask “Design the field picker menu” to Swarali', at: hoursAgo(6) },
    ],
  },
  // Open: no one on it yet. Anyone can "Pick up".
  {
    ...base,
    milestone: 'crm-m1',
    id: 'CRM-4',
    space: 'crm',
    createdBy: 'neha',
    assignee: null,
    assignedBy: null,
    reviewer: null,
    title: 'Deal value formatting',
    // Waits on the copy review (labels come from the copy doc).
    dependsOn: ['CRM-2'],
    due: day(5),
    status: 'todo',
    priority: 'low',
    createdAt: at(-1, 15),
    activity: [{ actor: 'neha', text: 'created this task', at: at(-1, 15) }],
  },
  // No check step: Swarali marked it done; Neha is told and can say "Looks good" or ask for changes.
  {
    ...base,
    ...given('CRM-5', 'crm', 'neha', 'swarali'),
    title: 'Fix the date picker on the Deals page',
    milestone: 'crm-m2',
    status: 'done',
    due: day(1),
    labels: ['Bug'],
    description: '<p>The date picker closes before you can pick a month.</p>',
    createdAt: at(-2, 12),
    doneAt: hoursAgo(4),
    activity: [
      { actor: 'neha', text: 'created this task and assigned it to Swarali', at: at(-2, 12) },
      { actor: 'swarali', text: 'marked this done', at: hoursAgo(4) },
    ],
  },

  // ── Espresso icons (Completed project): all done ────────────────
  { ...base, ...own('ES-1', 'espresso', 'riya'), milestone: 'es-1', title: 'Draw the 24px base set', status: 'done', doneAt: at(-20, 15), createdAt: at(-48, 10), activity: [] },
  { ...base, ...own('ES-2', 'espresso', 'kabir'), milestone: 'es-2', title: 'Export icons as SVG', status: 'done', doneAt: at(-12, 12), createdAt: at(-30, 10), activity: [] },
  { ...base, ...own('ES-3', 'espresso', 'neha'), milestone: 'es-3', title: 'Publish the icon library', status: 'done', doneAt: at(-9, 16), createdAt: at(-20, 10), activity: [] },

  // ── Backlog: noted, not planned yet ──────────────────────
  {
    ...base,
    ...own('GP-6', 'gameplan', 'swarali'),
    title: 'Dark mode pass for Discussions',
    milestone: 'gp-m2',
    status: 'backlog',
    priority: 'low',
    createdAt: at(-3, 16),
    activity: [{ actor: 'swarali', text: 'created this task', at: at(-3, 16) }],
  },
  {
    ...base,
    ...own('CRM-6', 'crm', 'neha'),
    title: 'Bulk edit deals',
    milestone: 'crm-m2',
    status: 'backlog',
    createdAt: at(-2, 11),
    activity: [{ actor: 'neha', text: 'created this task', at: at(-2, 11) }],
  },
]
