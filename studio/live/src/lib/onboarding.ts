import { computed } from 'vue'
import { state, isOpen, isFinishedForMe, isOwnerRole } from './store'
import { can } from './permissions'

// "Get started" checklist. Steps tick themselves off from what you actually did, so there's
// nothing to mark by hand. Skip moves on; Dismiss hides the card (it can come back from the account menu).

export type Step = {
  key: string
  icon: string
  title: string
  text: string
  action: string
  done: boolean
  // When there's nothing to act on yet, say why instead of a dead button
  waiting?: string
  run: (router: any) => void
}

export function onboardingFor(uid = state.me) {
  if (!state.onboarding[uid]) state.onboarding[uid] = { skipped: [], dismissed: false, inbox: false }
  return state.onboarding[uid]
}

const openTask = (router: any, id: string) => router.push({ path: '/', query: { task: id } })

// Everyone gets the same four steps (anyone can create projects).
const STEPS = ['project', 'add', 'assign', 'inbox']

export const steps = computed<Step[]>(() => {
  const uid = state.me
  const ob = onboardingFor(uid) as any
  const tasks = state.tasks.filter((t) => !t.deletedAt)
  // Starter tasks count for submit/review; they don't count as "you added a task".
  const real = tasks.filter((t) => !t.starter)
  const toSubmit = tasks.find((t) => t.assignee === uid && isOpen(t) && can.submit(t))
  const toReview = tasks.find((t) => (t.reviewer === uid && t.status === 'review') || isFinishedForMe(t, uid))
  const list: Step[] = []

  list.push({
    key: 'project',
    icon: 'lucide-folder-plus',
    title: 'Create a project',
    text: 'A project holds a team’s tasks and milestones. You’ll be its Lead.',
    action: 'New project',
    done: state.projects.some((p) => p.members.some((m: any) => m.user === uid && isOwnerRole(m.role))),
    run: () => (state.ui.createProject = true),
  })

  list.push({
    key: 'ask',
    icon: 'lucide-message-circle-question',
    title: 'Ask about a task',
    text: 'Something unclear? Open the task → ⋯ → Request a change. Ask before you start.',
    action: 'Open a task',
    done: !!ob.asked || tasks.some((t) => t.suggestion?.by === uid),
    waiting: tasks.some((t) => t.assignee === uid && isOpen(t) && t.assignedBy && t.assignedBy !== uid) ? undefined : 'Opens when someone gives you a task.',
    run: (router) => {
      const x = tasks.find((t) => t.assignee === uid && isOpen(t) && t.assignedBy && t.assignedBy !== uid)
      if (x) openTask(router, x.id)
    },
  })

  list.push({
      key: 'invite',
      icon: 'lucide-user-plus',
      title: 'Invite your team',
      text: 'Add people by email. They get a link to join.',
      action: 'Invite people',
      done: state.invites.some((i) => i.invitedBy === uid) || state.people.some((p) => p.invited),
      run: () => {
        state.ui.settingsTab = 'people'
        state.ui.settings = true
      },
    })

  list.push({
    key: 'add',
    icon: 'lucide-plus',
    title: 'Add a task',
    text: 'Press C anywhere, or use New task.',
    action: 'New task',
    done: real.some((t) => t.createdBy === uid),
    run: () => (state.ui.quickAdd = true),
  })

  list.push({
    key: 'assign',
    icon: 'lucide-at-sign',
    title: 'Give a task to someone',
    text: "Type @name in the title. You'll be notified when they finish.",
    action: 'New task',
    done: real.some((t) => t.assignedBy === uid && t.assignee && t.assignee !== uid),
    run: () => (state.ui.quickAdd = true),
  })

  list.push({
      key: 'submit',
      icon: 'lucide-send',
      title: 'Submit your work',
      text: 'Some tasks ask to be checked. Submit them with a note; the person who gave it approves or asks for changes.',
      action: 'Open the task',
      done: tasks.some((t) => t.rounds.some((r: any) => r.submittedBy === uid)),
      waiting: toSubmit ? undefined : 'Nothing to submit yet. Opens when someone gives you a task to check.',
      run: (router) => toSubmit && openTask(router, toSubmit.id),
    })

  list.push({
    key: 'review',
    icon: 'lucide-check-check',
    title: 'Review work',
    text: 'Approve it or say “Looks good”. Or ask for changes: each point becomes a subtask.',
    action: 'Open the task',
    done: tasks.some((t) => (t.assignedBy === uid && t.ack === 'ok') || t.rounds.some((r: any) => r.decidedBy === uid && r.decision !== 'withdrawn')),
    waiting: toReview ? undefined : 'Nothing to review yet. It shows up in your Inbox.',
    run: (router) => toReview && openTask(router, toReview.id),
  })

  list.push({
    key: 'inbox',
    icon: 'lucide-bell',
    title: 'Check your notifications',
    text: '“Action needed” is for you to act on. “Updates” are just to keep you posted.',
    action: 'Open notifications',
    done: ob.inbox,
    run: () => (state.ui.notifications = true),
  })

  return STEPS.map((k) => list.find((s) => s.key === k)!).filter(Boolean)
})

export const progress = computed(() => {
  const ob = onboardingFor()
  const done = steps.value.filter((s) => s.done).length
  const skipped = steps.value.filter((s) => !s.done && ob.skipped.includes(s.key)).length
  const next = steps.value.find((s) => !s.done && !ob.skipped.includes(s.key)) || null
  return { done, skipped, total: steps.value.length, next, finished: !next }
})

export const showOnboarding = computed(() => state.signedIn && !onboardingFor().dismissed)

export function skipStep(key: string) {
  const ob = onboardingFor()
  if (!ob.skipped.includes(key)) ob.skipped.push(key)
}
export function undoSkip(key: string) {
  const ob = onboardingFor()
  ob.skipped = ob.skipped.filter((k) => k !== key)
}
export function dismissOnboarding(v = true) {
  onboardingFor().dismissed = v
}
export function markInboxSeen() {
  onboardingFor().inbox = true
}
export function markProjectSeen() {
  ;(onboardingFor() as any).project = true
}
