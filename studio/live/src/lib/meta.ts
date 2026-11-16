// Status, priority and notification copy. One place to edit words.
import { personName, task, project, wsById } from './store'

// The only statuses. Icons are drawn by StatusIcon.
export const STATUS: Record<string, { label: string; icon: string }> = {
  backlog: { label: 'Backlog', icon: 'lucide-circle-dashed' },
  todo: { label: 'Todo', icon: 'lucide-circle' },
  progress: { label: 'In Progress', icon: 'lucide-contrast' },
  done: { label: 'Done', icon: 'lucide-circle-check' },
}
// No "Under review": reviews happen in discussions, not as a status.
export const STATUS_ORDER = ['backlog', 'todo', 'progress', 'done']

// Priority P1 (highest) to P5 (lowest). Each number has a word so people pick the meaning, not the digit.
// Drawn by PriorityIcon as a Badge. New tasks start at P3.
// Traffic-light colours, on the dot only: red → orange → yellow → green, then grey for "someday".
// The badge itself is always grey (theme/variant kept for reference, not used for the pill).
export const PRIORITY: Record<string, { label: string; short: string; rank: number; theme: string; variant: string; dot: string }> = {
  p1: { label: 'Urgent', short: 'P1', rank: 1, theme: 'red', variant: 'subtle', dot: 'bg-surface-red-5' },
  p2: { label: 'High', short: 'P2', rank: 2, theme: 'orange', variant: 'subtle', dot: 'bg-surface-orange-5' },
  p3: { label: 'Medium', short: 'P3', rank: 3, theme: 'yellow', variant: 'subtle', dot: 'bg-surface-yellow-5' },
  p4: { label: 'Low', short: 'P4', rank: 4, theme: 'green', variant: 'subtle', dot: 'bg-surface-green-5' },
  p5: { label: 'Someday', short: 'P5', rank: 5, theme: 'gray', variant: 'subtle', dot: 'bg-surface-gray-5' },
}
export const PRIORITY_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5']
export const DEFAULT_PRIORITY = 'p3'
// Older values (high/medium/low) still read correctly.
const LEGACY: Record<string, string> = { high: 'p2', medium: 'p3', low: 'p4' }
export const prio = (p: string | null | undefined) => (p && PRIORITY[p] ? p : (p && LEGACY[p]) || DEFAULT_PRIORITY)
// No priority sorts after P5.
export const prioRank = (p: string | null | undefined) => (p ? PRIORITY[prio(p)].rank : 6)

// Project health: the owner's status update, or the app's suggestion from progress vs time.
// Same badge rule as everywhere: grey pill, only the dot has colour.
// A coloured dot per state (decided). Colours follow the chart meanings: blue = moving / in progress,
// amber = at risk, red = late / off track, green = done, grey = paused or not started.
export const HEALTH: Record<string, { label: string; dot: string }> = {
  on: { label: 'On track', dot: 'bg-surface-blue-5' },
  risk: { label: 'At risk', dot: 'bg-surface-amber-5' },
  off: { label: 'Off track', dot: 'bg-surface-red-5' },
  paused: { label: 'On hold', dot: 'bg-surface-gray-5' },
  done: { label: 'Completed', dot: 'bg-surface-green-5' },
}
// Milestone status, worked out from its tasks and due date.
// Same dots as project health
export const MILESTONE_STATUS: Record<string, { label: string; dot: string }> = {
  reached: { label: 'Completed', dot: 'bg-surface-green-5' },
  on: { label: 'On track', dot: 'bg-surface-blue-5' },
  risk: { label: 'At risk', dot: 'bg-surface-amber-5' },
  late: { label: 'Late', dot: 'bg-surface-red-5' },
  notstarted: { label: 'Not started', dot: 'bg-surface-gray-4' },
}

const q = (s: string) => `“${s}”`

// [Who] [did what] [which task]
export function notificationParts(n: any) {
  const who = personName(n.actor)
  const t = n.task ? task(n.task) : null
  const title = t ? t.title : ''
  const p = n.project ? project(n.project) : null
  switch (n.type) {
    case 'N1':
      return { who, what: 'assigned you', target: title }
    case 'N5':
      return { who, what: 'mentioned you on', target: title }
    case 'N6':
      return {
        who,
        what: n.kind === 'date' ? 'requested a new date for' : n.kind === 'person' ? 'asked to hand over' : 'has a question about',
        target: title,
      }
    case 'N6b':
      return {
        who,
        what: n.answer === 'accepted' ? 'accepted your request on' : n.answer === 'replied' ? 'replied to your question on' : 'declined your request on',
        target: title,
      }
    case 'N8':
      return { who, what: 'added you to', target: p?.name || '' }
    case 'N9':
      return { who: '', what: `${n.count > 1 ? n.count + ' new comments' : 'New comment from ' + who} on`, target: title }
    case 'N10':
      return { who, what: n.reassigned ? 'reassigned' : 'changed', target: title, after: n.reassigned ? 'to someone else' : '' }
    case 'N11':
      return { who, what: n.deleted ? 'deleted' : 'cancelled', target: title }
    case 'N17':
      return { who, what: 'gave you a subtask on', target: title, after: n.subtask ? q(n.subtask) : '' }
    case 'R1':
      return { who: '', what: 'Reminder:', target: title, after: n.when === 'overdue' ? 'is overdue' : `is due ${n.when}` }
    case 'R2':
      return {
        who: '',
        what: 'Reminder: milestone',
        target: n.milestone,
        after: n.days === 0 ? 'is due today' : `is due in ${n.days} ${n.days === 1 ? 'day' : 'days'}`,
      }
    case 'N20':
      return { who, what: `posted an update on`, target: p?.name || '', after: `· ${HEALTH[n.health]?.label || ''}` }
    case 'N21':
      return { who, what: 'sent you a reminder about', target: title }
    case 'N18':
      return { who, what: 'finished', target: title }
    case 'N13':
      return { who, what: 'asked to join', target: p?.name || '' }
    case 'N14':
      return { who, what: 'accepted your request to join', target: p?.name || '' }
    case 'N15':
      return { who, what: 'declined your request to join', target: p?.name || '', after: n.note ? q(n.note) : '' }
    // Workspaces (only with Workspaces on)
    case 'W1':
      return { who, what: 'invited you to join', target: wsById(n.ws)?.name || '' }
    case 'W2':
      return { who, what: 'joined', target: wsById(n.ws)?.name || '' }
    case 'W3':
      return { who, what: 'declined your invite to', target: wsById(n.ws)?.name || '' }
    case 'P1':
      return { who, what: 'invited you to', target: p?.name || '' }
    case 'P2':
      return { who, what: 'accepted your invite to', target: p?.name || '' }
    case 'P3':
      return { who, what: 'declined your invite to', target: p?.name || '' }
    default:
      return { who, what: 'updated', target: title }
  }
}
