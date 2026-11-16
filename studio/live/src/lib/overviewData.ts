import dayjs from 'dayjs'
import {
  state,
  project,
  projectStats,
  planVsActual,
  currentHealth,
  needsAttention,
  milestonesOf,
  milestoneStatus,
  milestoneStats,
  taskPeople,
  personName,
  leadsOf,
} from './store'
import { isOverdue } from './dates'
import { HEALTH } from './meta'

// One summary of a project, shared by every Overview layout so their numbers always agree.
export function projectSummary(pid: string) {
  const p = project(pid)!
  const s = projectStats(pid)
  const plan = planVsActual(pid)
  const health = currentHealth(pid)
  const tasks = state.tasks.filter((t) => t.space === pid && !t.deletedAt)
  const t0 = dayjs().startOf('day')

  const week = {
    done: tasks.filter((t) => t.status === 'done' && t.doneAt && t0.diff(dayjs(t.doneAt).startOf('day'), 'day') <= 7).length,
    due: tasks.filter((t) => t.status !== 'done' && t.due && dayjs(t.due).diff(t0, 'day') >= 0 && dayjs(t.due).diff(t0, 'day') <= 7).length,
    overdue: tasks.filter((t) => isOverdue(t)).length,
  }

  const milestones = [...milestonesOf(pid)]
    .sort((a: any, b: any) => (a.due || '9999').localeCompare(b.due || '9999'))
    .map((m: any) => {
      const st = milestoneStats(pid, m.id)
      return { m, status: milestoneStatus(pid, m), stats: st, left: st.total - st.done, team: (m.people || []) as string[] }
    })
  const reached = milestones.filter((x) => x.status === 'reached').length
  const upcoming = milestones.filter((x) => x.status !== 'reached')

  const attention = needsAttention(pid).filter((a: any) => !/^Waiting on/.test(a.kind))

  // Who has what: open work per person (milestone teams share their tasks), most first.
  const load = p.members
    .map((mm: any) => {
      const mine = tasks.filter((t) => t.status !== 'done' && taskPeople(t).includes(mm.user))
      return { user: mm.user, open: mine.length, overdue: mine.filter((t) => isOverdue(t)).length }
    })
    .filter((r: any) => r.open)
    .sort((a: any, b: any) => b.open - a.open)
  const maxLoad = Math.max(1, ...load.map((r: any) => r.open))

  const start = p.start ? dayjs(p.start) : null
  const end = p.target ? dayjs(p.target) : null
  const daysLeft = end ? end.diff(t0, 'day') : null
  const timePct = start && end ? Math.max(0, Math.min(100, Math.round((t0.diff(start, 'day') / Math.max(1, end.diff(start, 'day'))) * 100))) : null

  // One plain sentence: how it's going, then the most useful next fact.
  const label = HEALTH[health.key]?.label || 'On track'
  const parts = [`${s.pct}% done${plan.planned !== null ? `, the plan says ${plan.planned}% by today` : ''}`]
  if (week.overdue) parts.push(`${week.overdue} overdue`)
  const sentence = `${label}. ${parts.join(' · ')}.`
  const nextLine = upcoming[0] ? `Due soonest: ${upcoming[0].m.name}${upcoming[0].m.due ? `, ${dayjs(upcoming[0].m.due).format('D MMM')}` : ''}` : 'All milestones reached'

  const ups = (p.updates || []).map((u: any) => ({ at: u.at, actor: u.by, text: `posted an update: ${HEALTH[u.health]?.label}`, task: null }))
  const acts = tasks.flatMap((t) =>
    (t.activity || []).filter((a: any) => !/^created this task/.test(a.text)).map((a: any) => ({ at: a.at, actor: a.actor, text: a.text, task: t })),
  )
  const recent = [...ups, ...acts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
  const lastUpdate = (p.updates || []).reduce((a: any, u: any) => (!a || u.at > a.at ? u : a), null)

  return {
    p,
    s,
    plan,
    health,
    label,
    sentence,
    nextLine,
    week,
    milestones,
    reached,
    upcoming,
    attention,
    load,
    maxLoad,
    daysLeft,
    timePct,
    start,
    end,
    owner: leadsOf(pid).map(personName).join(', '),
    ownerId: leadsOf(pid)[0] || null,
    recent,
    lastUpdate,
  }
}
