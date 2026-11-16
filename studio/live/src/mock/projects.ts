import { day, hoursAgo } from '../lib/dates'

// Projects. Each has one Owner (the person who manages it); everyone else is a Member.
// Every project is open to everyone; members are the people working on it (it's in their sidebar).
// Gameplan and CRM: the work loop. Helpdesk: a project Swarali isn't in (she can open or join it).
// Insights: archived (read-only, found in Settings).
// status: active | onhold | completed | archived. priority: p1–p5 (same scale as tasks).
// Helpdesk is On hold; Espresso icons is Completed (all its tasks done).
export const projects = [
  {
    id: 'gameplan',
    name: 'Gameplan',
    code: 'GP',
    description: 'Async discussions for remote teams.',
    status: 'active',
    priority: 'p3',
    start: day(-30),
    target: day(45),
    // Milestones: the checkpoints of a project. Tasks sit under one (or under "No milestone").
    milestones: [
      { id: 'gp-p1', name: 'Research and interviews', due: day(-25) },
      { id: 'gp-p2', name: 'Information architecture', due: day(-12) },
      { id: 'gp-m1', name: 'Discussions v2 design', due: day(5) },
      { id: 'gp-m2', name: 'Design QA', due: day(20) },
      { id: 'gp-m3', name: 'Beta with 5 teams', due: day(30) },
      { id: 'gp-m4', name: 'Public launch', due: day(42) },
    ],
    // No status update yet: the app suggests health from progress vs time.
    updates: [],
    files: [
      { id: 'f1', type: 'link', name: 'Gameplan v2 brief', url: 'https://docs.google.com', addedBy: 'neha', at: hoursAgo(200) },
      { id: 'f2', type: 'link', name: 'Figma · Discussions v2', url: 'https://figma.com', addedBy: 'swarali', at: hoursAgo(120) },
    ],
    members: [
      { user: 'neha', role: 'Owner' },
      { user: 'swarali', role: 'Member' },
      ...['priya', 'karan', 'ishaan', 'riya', 'kabir', 'ananya', 'dev'].map((user) => ({ user, role: 'Member' })),
    ],
    // Tara asked to join: Neha (the Owner) sees it in notifications and in People
    joinRequests: [{ id: 'jr1', user: 'tara', note: '', status: 'pending', at: hoursAgo(2) }],
    invites: [],
  },
  {
    id: 'crm',
    name: 'CRM',
    code: 'CRM',
    description: 'Leads, deals and the sales pipeline.',
    status: 'active',
    priority: 'p2',
    start: day(-60),
    target: day(30),
    milestones: [
      { id: 'crm-p1', name: 'Lead capture forms', due: day(-40) },
      { id: 'crm-p2', name: 'Pipeline view', due: day(-20) },
      { id: 'crm-m1', name: 'Deals page polish', due: day(3) },
      // Slipped twice: shows in Timeline and By milestone.
      { id: 'crm-m2', name: 'Kanban beta', due: day(14), slips: [
        { from: day(-4), to: day(7), at: hoursAgo(240), by: 'neha' },
        { from: day(7), to: day(14), at: hoursAgo(50), by: 'neha' },
      ] },
      { id: 'crm-m3', name: 'Email sync', due: day(22) },
      { id: 'crm-m4', name: 'Reports v2', due: day(28) },
    ],
    // The owner's latest status update (overrides the app's suggestion for 14 days).
    updates: [
      { id: 'up1', health: 'risk', note: 'Kanban beta moved twice: the custom fields API is late. Deals page polish is still on for Monday.', by: 'neha', at: hoursAgo(30) },
    ],
    files: [
      { id: 'f1', type: 'link', name: 'CRM roadmap', url: 'https://docs.google.com', addedBy: 'neha', at: hoursAgo(400) },
    ],
    members: [
      { user: 'neha', role: 'Owner' },
      { user: 'swarali', role: 'Member' },
      ...['karan', 'priya', 'dev', 'tara', 'ishaan', 'ananya'].map((user) => ({ user, role: 'Member' })),
    ],
    joinRequests: [],
    invites: [],
  },
  {
    id: 'helpdesk',
    name: 'Helpdesk',
    code: 'HD',
    description: 'Customer support tickets and SLAs.',
    status: 'onhold',
    priority: 'p4',
    start: day(-90),
    target: day(60),
    milestones: [
      { id: 'hd-1', name: 'Ticket inbox', due: day(-60) },
      { id: 'hd-2', name: 'SLA rules', due: day(10) },
      { id: 'hd-3', name: 'Email to ticket', due: day(25) },
      { id: 'hd-4', name: 'Agent mobile app', due: day(45) },
      { id: 'hd-5', name: 'Customer portal', due: day(58) },
    ],
    // Owned by Rohan; Neha is a Member. Swarali isn't in it: she has asked to join (waiting for Rohan).
    members: [
      { user: 'rohan', role: 'Owner' },
      { user: 'neha', role: 'Member' },
      ...['tara', 'ishaan', 'kabir', 'ananya'].map((user) => ({ user, role: 'Member' })),
    ],
    joinRequests: [{ id: 'jr2', user: 'swarali', note: '', status: 'pending', at: hoursAgo(20) }],
    invites: [],
  },
  {
    id: 'espresso',
    name: 'Espresso icons',
    code: 'ES',
    description: 'The icon set for the Espresso design system.',
    status: 'completed',
    priority: 'p3',
    start: day(-50),
    target: day(-8),
    milestones: [
      { id: 'es-1', name: 'Base set (24px)', due: day(-30) },
      { id: 'es-2', name: 'SVG export', due: day(-15) },
      { id: 'es-5', name: 'Figma kit', due: day(-12) },
      { id: 'es-3', name: 'Library release', due: day(-9) },
      { id: 'es-4', name: 'Usage guide', due: day(-8) },
    ],
    members: [
      { user: 'neha', role: 'Owner' },
      { user: 'riya', role: 'Member' },
      { user: 'kabir', role: 'Member' },
    ],
    joinRequests: [],
    invites: [],
  },
  {
    id: 'insights',
    name: 'Insights',
    code: 'IN',
    description: 'Reports and dashboards. Paused for now.',
    status: 'archived',
    start: day(-200),
    target: null,
    milestones: [],
    members: [
      { user: 'neha', role: 'Owner' },
      { user: 'swarali', role: 'Member' },
    ],
    joinRequests: [],
    invites: [],
  },
]

// More Frappe products, so the Projects page and the sidebar look like a real organisation.
// Owners vary (not only Neha). Swarali and Neha are in some, so the rest show under "Join a project".
const P = (o: any) => ({ milestones: [], updates: [], files: [], joinRequests: [], invites: [], ...o })
const M = (owner: string, members: string[]) => [{ user: owner, role: 'Owner' }, ...members.map((user) => ({ user, role: 'Member' }))]
projects.push(
  P({
    id: 'erpnext',
    name: 'ERPNext v16',
    code: 'ERP',
    description: 'The next ERPNext release: a calmer accounting UI and faster reports.',
    status: 'active',
    priority: 'p1',
    start: day(-40),
    target: day(50),
    milestones: [
      { id: 'erp-p1', name: 'Scope and RFCs', due: day(-30) },
      { id: 'erp-p2', name: 'Design system update', due: day(-15) },
      { id: 'erp-m1', name: 'Accounting UX refresh', due: day(9) },
      { id: 'erp-m3', name: 'Payroll fixes', due: day(18) },
      { id: 'erp-m2', name: 'v16 beta', due: day(35) },
      { id: 'erp-m4', name: 'Release candidate', due: day(42) },
      { id: 'erp-m5', name: 'General release', due: day(49) },
    ],
    updates: [{ id: 'up-erp', health: 'on', note: 'Accounting screens are in review. Beta date holds.', by: 'neha', at: hoursAgo(50) }],
    members: M('neha', ['swarali', 'karan', 'dev', 'priya', 'ishaan', 'ananya', 'tara']),
    // Swarali is in 3 projects (Gameplan, CRM, ERPNext). Neha keeps an eye on almost everything (all but LMS).
  }),
  P({
    id: 'hrms',
    name: 'Frappe HR Portal',
    code: 'HR',
    description: 'Self-service portal for leave, payslips and expense claims.',
    status: 'active',
    priority: 'p2',
    start: day(-20),
    target: day(40),
    milestones: [
      { id: 'hr-p1', name: 'Portal shell', due: day(-10) },
      { id: 'hr-m1', name: 'Leave and attendance', due: day(6) },
      { id: 'hr-m5', name: 'Expense approvals', due: day(22) },
      { id: 'hr-m2', name: 'Payslips and claims', due: day(28) },
      { id: 'hr-m3', name: 'Mobile check-in', due: day(34) },
      { id: 'hr-m4', name: 'Launch', due: day(39) },
    ],
    members: M('priya', ['neha', 'riya', 'karan', 'ishaan', 'ananya']),
  }),
  P({
    id: 'cloud',
    name: 'Frappe Cloud',
    code: 'FC',
    description: 'Hosting dashboard: faster site creation and clearer billing.',
    status: 'active',
    priority: 'p1',
    start: day(-35),
    target: day(20),
    milestones: [
      { id: 'fc-p1', name: 'New region setup', due: day(-20) },
      { id: 'fc-m1', name: 'One-click site setup', due: day(-2) },
      { id: 'fc-m3', name: 'Backups page', due: day(8) },
      { id: 'fc-m2', name: 'Billing page', due: day(15) },
      { id: 'fc-m4', name: 'Status page', due: day(18) },
      { id: 'fc-m5', name: 'Usage alerts', due: day(19) },
    ],
    updates: [{ id: 'up-fc', health: 'off', note: 'Site setup slipped: the new region is not ready.', by: 'karan', at: hoursAgo(20) }],
    members: M('karan', ['neha', 'tara', 'ishaan', 'dev', 'kabir', 'priya']),
  }),
  P({
    id: 'builder',
    name: 'Frappe Builder',
    code: 'FB',
    description: 'Visual website builder: blocks, templates and publishing.',
    status: 'active',
    priority: 'p3',
    start: day(-15),
    target: day(45),
    milestones: [
      { id: 'fb-p1', name: 'Block library', due: day(-5) },
      { id: 'fb-m1', name: 'Template gallery', due: day(12) },
      { id: 'fb-m2', name: 'Custom domains', due: day(25) },
      { id: 'fb-m3', name: 'Forms block', due: day(32) },
      { id: 'fb-m4', name: 'SEO settings', due: day(38) },
      { id: 'fb-m5', name: 'Publish flow', due: day(44) },
    ],
    members: M('riya', ['neha', 'priya', 'ananya']),
  }),
  P({
    id: 'lms',
    name: 'Frappe LMS',
    code: 'LMS',
    description: 'Courses, quizzes and certificates for learners.',
    status: 'onhold',
    priority: 'p4',
    start: day(-60),
    target: day(60),
    milestones: [
      { id: 'lms-p1', name: 'Course pages', due: day(-40) },
      { id: 'lms-m1', name: 'Quiz builder', due: day(30) },
      { id: 'lms-m2', name: 'Certificates', due: day(45) },
      { id: 'lms-m3', name: 'Batches', due: day(55) },
      { id: 'lms-m4', name: 'Payments', due: day(58) },
    ],
    members: M('ananya', ['dev', 'kabir', 'tara']),
  }),
  P({
    id: 'drive',
    name: 'Frappe Drive',
    code: 'DR',
    description: 'File storage and sharing for teams.',
    status: 'completed',
    priority: 'p3',
    start: day(-90),
    target: day(-5),
    milestones: [
      { id: 'dr-p1', name: 'Upload and preview', due: day(-60) },
      { id: 'dr-p2', name: 'Folders', due: day(-40) },
      { id: 'dr-p3', name: 'Search', due: day(-25) },
      { id: 'dr-m1', name: 'Sharing and permissions', due: day(-10) },
      { id: 'dr-p4', name: 'Desktop sync', due: day(-6) },
    ],
    members: M('kabir', ['neha', 'priya', 'ishaan', 'karan']),
  }),
)

// Invite links. Open /#/invite/<token> to try them. Only the expired-link case is kept.
export const invites = [{ token: 'old-link', user: null, invitedBy: 'neha', project: 'crm', task: null, expired: true }]
