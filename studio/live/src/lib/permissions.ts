import { state, isLead, isMember, person, isArchived, taskPeople, org, currentWs, isSolo, milestoneTeam } from './store'

// Who can do what. See docs/03 section 7.2 and 8.2.
// Statuses: Backlog · Todo · In Progress · Done. Nothing else (no review step: reviews happen in discussions).
// Core rule: only the person doing the work (the assignee) moves a task forward or back.
// Assigners and Owners can reassign or delete, but never change the work status for someone else.
const me = () => state.me
// The people doing a task: its milestone's team in projects, otherwise its assignee.
const doer = (t: any) => taskPeople(t).includes(me())
const lead = (t: any) => t.space !== 'general' && isLead(t.space)
// Not started or being worked on: Backlog, Todo, In Progress
const active = (t: any) => t.status === 'backlog' || t.status === 'todo' || t.status === 'progress'

// No review step in this app (reviews happen in discussions). Kept so callers still work.
export const needsReview = (_t: any) => false

// Ownership: the assigner owns "what and when" (title, description, priority, due date),
// the assignee owns "progress" (status, ticking subtasks), the reviewer owns "done".
// Frappe Live: the team (people who can start projects) plans; customers work their tasks.
const staff = () => !!person(me())?.canCreateProjects
const owner = (t: any) => (t.assignedBy ? t.assignedBy === me() : t.createdBy === me())

export const can = {
  // Labels, attachments, adding subtasks: anyone involved. Archived projects are read-only.
  edit: (t: any) =>
    !isArchived(t) && (lead(t) || [t.createdBy, t.assignee, t.assignedBy, t.reviewer].includes(me())),
  // Title, description, priority
  editBrief: (t: any) => !isArchived(t) && owner(t),
  tick: (t: any) => !isArchived(t) && doer(t) && t.status !== 'done',
  start: (t: any) => !isArchived(t) && (t.status === 'todo' || t.status === 'backlog') && doer(t),
  // Move between Backlog, Todo and In Progress
  work: (t: any) => !isArchived(t) && doer(t) && active(t),
  // Open project task (no milestone team, no one on it): anyone can pick it up.
  take: (t: any) => !isArchived(t) && !taskPeople(t).length && t.space !== 'general' && active(t),
  // No review step: the people doing it mark it done themselves.
  submit: (_t: any) => false,
  markDone: (t: any) => !isArchived(t) && doer(t) && active(t),
  review: (_t: any) => false,
  withdraw: (_t: any) => false,
  skipReview: (_t: any) => false,
  reopen: (t: any) => !isArchived(t) && t.status === 'done' && (doer(t) || owner(t)),
  // No Cancelled status: a task that won't happen goes to Backlog or is deleted.
  cancel: (_t: any) => false,
  restore: (_t: any) => false,
  remove: (t: any) => t.createdBy === me() || lead(t),
  changeReviewer: (_t: any) => false,
  // Personal tasks (My tasks) have no one else to ask, and can't be assigned
  suggest: (t: any) => t.space !== 'general' && t.assignee === me() && !!t.assignedBy && t.assignedBy !== me() && active(t) && !t.suggestion,
  answerSuggestion: (t: any) => !!t.suggestion && t.assignedBy === me(),
  assign: (t: any) => t.space !== 'general' && (lead(t) || [t.createdBy, t.assignedBy].includes(me()) || !t.assignee),
  move: (t: any) => t.createdBy === me() || lead(t),
  // Due date: only the person who assigned it (for your own tasks, that's you).
  // Unassigned tasks: the creator. The assignee proposes a new date via Suggest a change.
  editDue: (t: any) => !isArchived(t) && owner(t),
  // Tasks can run on its own (not only inside the suite), so anyone can start a project.
  // Workspaces on: projects live in a workspace, so not before you're in one
  // Frappe Live: only the team (staff) starts projects; the server refuses everyone else too.
  createProject: () => !!person(me())?.canCreateProjects && (!org.on || !!currentWs.value),
  manageProject: (pid: string) => staff() && isLead(pid),
  // Finished work you gave (no check step), not replied to yet.
  respond: (_t: any) => false,
  // Putting a task into a milestone from elsewhere (Notes → Create tasks, Round 247): only a milestone you're on
  // (its team), or any milestone of a project you own. Personal projects: all yours.
  placeIn: (pid: string, mid: string) => isSolo(pid) || isLead(pid) || milestoneTeam(pid, mid).includes(me()),
  // Milestones: everyone in the project can add one.
  addMilestone: (pid: string) => staff() && (isMember(pid) || isLead(pid)),
  // Editing a milestone (name, deadline, team, remove): whoever added it, the project's Owner, and admins.
  manageMilestones: (pid: string, m?: any) => staff() && (isLead(pid) || (!!m && m.createdBy === me())),
}
