import { computed, watch, nextTick } from 'vue'
import { useWindowSize } from '@vueuse/core'
import dayjs from 'dayjs'
import { toast } from 'frappe-ui'
import { state, personName, taskPeople, isSolo, leadsOf, project, milestonesOf, remindTask, remindedRecently } from './store'
import { projectSummary } from './overviewData'
import { can } from './permissions'
import { dockedNow } from './panelLayout'
import { design } from './look'
import { MILESTONE_STATUS } from './meta'
import { relTime } from './dates'
import { WORK_COLOR, PLAN_COLOR, PEOPLE_COLORS, MEANING, STILL } from './charts'

// The Project Overview as data for Studio blocks: one flat `ov` object (moved here from the prototype's
// components/overview/*: OverviewMilestones, OverviewAbout, StatCards, MilestonesAttention, OverviewWorkload,
// TeamLoad, PlanChart, OverviewRecent). The page script spreads useOverview() into what it returns; the
// Overview's blocks (the ov_* Studio Components) bind to `ov.…` and call the actions.
//
// Layouts (Variants → "Overview layout", design.ovLayout):
//   focus   — Needs attention, key numbers, Workload | Planned vs actual, Recent; About in a right column
//   split   — two columns: the work (Needs attention, Planned vs actual, Recent) | the facts (numbers, Workload, About)
//   path    — a milestone strip on top, then Focus below it
//   digest  — a centred status report: headline, this week, Needs attention, the plan, workload, recent; About last
//   current — About banner on top, then numbers and Needs attention, then the charts, then Recent
// Side columns need room: on narrow windows (or with a panel docked under 1440px) everything stacks, About last.
const color = (dot: string) => (dot ? `var(--${dot.replace(/^bg-/, '')})` : 'transparent')

export function useOverview(pid: () => string, router: any, route: any, viewTasks: (f: string) => void) {
  const { width } = useWindowSize()
  const x = computed(() => (project(pid()) ? projectSummary(pid()) : null))

  const ov = computed(() => {
    const s = x.value
    if (!s) return null
    const id = pid()
    const archived = s.p.status === 'archived'
    const solo = isSolo(id)
    const layout = design.ovLayout
    const twoCols = !dockedNow.value || width.value >= 1440
    const roomy = width.value >= 1024 && (!dockedNow.value || width.value >= 1440)
    const rail = ['focus', 'path'].includes(layout) && roomy
    const split = layout === 'split' && roomy
    const phone = width.value < 768

    // ── About ──
    const late = s.daysLeft !== null && s.daysLeft < 0
    const left = s.daysLeft === null ? 'No end date' : late ? `${-s.daysLeft} days late` : `${s.daysLeft} days left`
    const dates =
      s.start && s.end
        ? `${s.start.format('D MMM')} → ${s.end.format('D MMM YYYY')}`
        : s.end
          ? `Until ${s.end.format('D MMM YYYY')}`
          : s.start
            ? `From ${s.start.format('D MMM YYYY')} · no end date`
            : 'No dates yet'
    const team = s.p.members.map((m: any) => m.user)
    const about = {
      name: s.p.name,
      desc: s.p.description || 'No description yet.',
      manage: can.manageProject(id) && !archived,
      showOwner: !solo,
      owner: s.owner,
      dates,
      hasEnd: s.daysLeft !== null,
      left,
      late,
      team,
      owners: leadsOf(id),
      teamCount: String(team.length),
      teamLabel: `${team.length} people`,
    }

    // ── Key numbers: Work done vs Time used on one scale, then Milestones and Open tasks ──
    const open = state.tasks.filter((t: any) => t.space === id && !t.deletedAt && t.status !== 'done').length
    const atRisk = s.milestones.filter((m: any) => m.status === 'risk' || m.status === 'late').length
    const behind = s.plan.planned !== null && s.s.pct < s.plan.planned
    const numbers = {
      workPct: s.s.pct,
      workValue: `${s.s.pct}%`,
      timePct: s.timePct ?? 0,
      timeValue: s.timePct === null ? '–' : `${s.timePct}%`,
      workFlag: behind ? `Plan says ${s.plan.planned}%` : '',
      msValue: `${s.reached}/${s.milestones.length}`,
      msFlag: atRisk ? `${atRisk} at risk` : '',
      openValue: String(open),
      openFlag: s.week.overdue ? `${s.week.overdue} overdue` : '',
      // One row (2fr · 1fr · 1fr) only on a wide window (1280px+). In a side column (Split), with a panel docked or
      // narrower: the wide box on top, the two small ones under it. (The prototype switched at 1024px, where the
      // sidebar and the About column leave the bars too little room and they collapse to dots.)
      columns: dockedNow.value || layout === 'split' || width.value < 1280 ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)',
      wideSpan: dockedNow.value || layout === 'split' || width.value < 1280 ? 'span 2' : 'span 1',
    }

    // ── Needs attention: milestones that need a look (worst first) with their problem tasks, then loose ones ──
    const RANK: Record<string, number> = { late: 0, risk: 1, on: 2, notstarted: 3, reached: 4 }
    const issues = s.attention.filter((a: any) => a.task)
    const inMs = (a: any) => s.milestones.some((mm: any) => mm.m.id === a.task.milestone)
    const issuesOf = (mid: string | null) => issues.filter((a: any) => (mid ? a.task.milestone === mid : !inMs(a)))
    const reminded = (a: any) => a.action === 'remind' && remindedRecently(a.task, a.person)
    const issueRow = (a: any) => {
      const overdue = /^Overdue/.test(a.kind)
      return {
        key: a.key,
        taskId: a.task.id,
        title: a.task.title,
        kind: a.kind,
        icon: overdue ? 'lucide-clock-alert' : 'lucide-circle-dashed',
        tone: overdue ? 'var(--ink-gray-6)' : 'var(--ink-gray-5)',
        person: a.person ? personName(a.person) : '',
        // Personal project: no avatars (it's only you)
        showAvatar: !!a.person && !solo,
        action: a.action === 'remind' && a.person !== state.me ? (reminded(a) ? 'Reminded' : 'Remind') : 'Open',
        disabled: reminded(a),
      }
    }
    const dueText = (mm: any) => {
      if (!mm.m.due) return 'No due date'
      const d = dayjs(mm.m.due).diff(dayjs().startOf('day'), 'day')
      return d < 0 ? `${-d} ${-d === 1 ? 'day' : 'days'} late` : d === 0 ? 'Due today' : `Due ${dayjs(mm.m.due).format('D MMM')} · ${d}d left`
    }
    const WORD: Record<string, string> = { reached: 'Completed', late: 'Late', risk: 'At risk', on: 'On track', notstarted: 'Not started' }
    const needing = s.milestones
      .filter((mm: any) => mm.status !== 'reached' && (issuesOf(mm.m.id).length || mm.status === 'late' || mm.status === 'risk'))
      .sort((a: any, b: any) => RANK[a.status] - RANK[b.status] || issuesOf(b.m.id).length - issuesOf(a.m.id).length)
      .map((mm: any) => {
        const rows = issuesOf(mm.m.id).map(issueRow)
        const why = mm.status === 'late' ? 'Past its due date' : mm.status === 'risk' ? 'Behind where it should be by now' : ''
        return {
          id: mm.m.id,
          name: mm.m.name,
          word: WORD[mm.status],
          dot: color(MILESTONE_STATUS[mm.status]?.dot || ''),
          due: dueText(mm),
          dueColor: mm.status === 'late' ? 'var(--ink-gray-8)' : 'var(--ink-gray-5)',
          why: !rows.length && why ? `${why}: ${mm.stats.pct}% done.` : '',
          issues: rows,
        }
      })
    const loose = issuesOf(null).map(issueRow)
    const attention = { count: issues.length ? String(issues.length) : '', needing, loose, nothing: !needing.length && !loose.length }

    // ── Workload (Variants → "Workload": stacked · bars · donut · share) ──
    const who = (u: string) => (u === state.me ? 'You' : personName(u).split(' ')[0])
    const kind = design.workload
    const stackRows = s.load.slice(0, 8).map((r: any) => ({ person: who(r.user), Open: r.open - r.overdue, Overdue: r.overdue }))
    // donut: each open task counted once (a team task split across its team), rounded to whole tasks
    const openTasks = state.tasks.filter((t: any) => t.space === id && !t.deletedAt && t.status !== 'done' && t.status !== 'cancelled')
    const raw: Record<string, number> = {}
    openTasks.forEach((t: any) => {
      const ppl = taskPeople(t)
      if (!ppl.length) raw['~'] = (raw['~'] || 0) + 1
      else ppl.forEach((u: string) => (raw[u] = (raw[u] || 0) + 1 / ppl.length))
    })
    const keys = Object.keys(raw)
    const whole: Record<string, number> = Object.fromEntries(keys.map((k) => [k, Math.floor(raw[k])]))
    let rest = openTasks.length - keys.reduce((n, k) => n + whole[k], 0)
    keys.sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a]))).forEach((k) => rest-- > 0 && whole[k]++)
    const donutAll = keys.filter((k) => whole[k]).sort((a, b) => whole[b] - whole[a]).map((k) => ({ person: k === '~' ? 'Unassigned' : who(k), open: whole[k] }))
    const others = donutAll.slice(7).reduce((n, r) => n + r.open, 0)
    const donutRows = others ? [...donutAll.slice(0, 7), { person: 'Others', open: others }] : donutAll.slice(0, 7)
    // share: split bars (each person's share of the open work, then of the overdue work)
    const share = s.load.map((r: any, i: number) => ({ user: r.user, open: r.open, overdue: r.overdue, color: i < 7 ? PEOPLE_COLORS[i % PEOPLE_COLORS.length] : MEANING.neutral }))
    const shareTop = share.slice(0, 7)
    const shareRest = share.slice(7)
    if (shareRest.length)
      shareTop.push({ user: '', open: shareRest.reduce((n: number, r: any) => n + r.open, 0), overdue: shareRest.reduce((n: number, r: any) => n + r.overdue, 0), color: MEANING.neutral })
    // bars: one row per person, a bar sized to their load (red part = overdue)
    const bars = s.load.slice(0, 6).map((r: any) => ({
      user: r.user,
      name: r.user === state.me ? 'You' : personName(r.user),
      count: String(r.open),
      countColor: r.open >= 5 ? 'var(--ink-gray-9)' : 'var(--ink-gray-6)',
      openWidth: `${((r.open - r.overdue) / s.maxLoad) * 100}%`,
      overdueWidth: `${(r.overdue / s.maxLoad) * 100}%`,
    }))
    const workload = {
      show: !solo,
      kind,
      sub: kind === 'share' || kind === 'donut' ? 'Who holds the open work' : 'Open tasks per person',
      empty: !s.load.length,
      stackRows,
      stackSeries: { Open: { color: WORK_COLOR.Open }, Overdue: { color: WORK_COLOR.Overdue } },
      donutRows,
      openShare: shareTop.map((r: any) => ({ label: r.user ? who(r.user) : 'Others', value: r.open, color: r.color })),
      overdueShare: shareTop.filter((r: any) => r.overdue).map((r: any) => ({ label: r.user ? who(r.user) : 'Others', value: r.overdue, color: r.color })),
      bars,
      moreBars: s.load.length > 6 ? `+${s.load.length - 6} more people` : '',
      openColor: WORK_COLOR.Open,
      overdueColor: WORK_COLOR.Overdue,
      still: STILL,
    }

    // ── Planned vs actual (Variants → "Plan chart": area · line) ──
    let planRows: any[] | null = null
    if (s.p.start && s.p.target) {
      const start = dayjs(s.p.start).startOf('day')
      const end = dayjs(s.p.target).startOf('day')
      const span = Math.max(1, end.diff(start, 'day'))
      const today = dayjs().startOf('day')
      const tasks = state.tasks.filter((t: any) => t.space === id && !t.deletedAt)
      const total = Math.max(1, tasks.length)
      const step = Math.max(1, Math.round(span / 12))
      const points: any[] = []
      for (let d = start; !d.isAfter(end); d = d.add(step, 'day')) points.push(d)
      if (!points.some((d) => d.isSame(today, 'day')) && today.isAfter(start) && today.isBefore(end)) points.push(today)
      if (!points[points.length - 1].isSame(end, 'day')) points.push(end)
      points.sort((a, b) => a.valueOf() - b.valueOf())
      planRows = points.map((d) => ({
        day: d.isSame(today, 'day') ? 'Today' : d.format('D MMM'),
        Planned: Math.round((d.diff(start, 'day') / span) * 100),
        Actual: d.isAfter(today) ? null : Math.round((tasks.filter((t: any) => t.status === 'done' && t.doneAt && !dayjs(t.doneAt).isAfter(d.endOf('day'))).length / total) * 100),
      }))
    }
    const { planned, actual } = s.plan
    const gap = planned === null ? 0 : planned - actual
    const plan = {
      rows: planRows || [],
      has: !!planRows,
      area: design.planChart === 'area',
      // the Digest headline already says where it stands
      sub: !planRows || layout === 'digest'
        ? ''
        : planned === null
          ? `${actual}% done`
          : gap >= 10
            ? `Behind plan: ${actual}% done, the plan says ${planned}% by today`
            : gap > 0
              ? `Slightly behind: ${actual}% done, the plan says ${planned}% by today`
              : `On plan: ${actual}% done, the plan says ${planned}% by today`,
      series: { Planned: { dashed: true, color: PLAN_COLOR.Planned }, Actual: { color: PLAN_COLOR.Actual } },
      yAxis: { max: 100 },
      // room on the right so the last date label isn't cut when the card is narrow
      options: { ...STILL, grid: { right: 24, containLabel: true } },
    }

    // ── Recent updates ──
    const recent = s.recent.map((r: any, i: number) => ({
      key: String(i),
      actor: personName(r.actor),
      text: `${r.text}${r.task ? ` · ${r.task.title}` : ''}`,
      when: relTime(r.at),
    }))

    // ── Digest headline: where it stands, what's next, this week in numbers ──
    const digest = {
      timeLine: s.daysLeft === null ? 'No end date' : s.daysLeft < 0 ? `${-s.daysLeft} days late` : `${s.daysLeft} days left`,
      headline: `${s.s.pct}% done${planned !== null ? `, the plan says ${planned}% by today` : ''}`,
      next: s.nextLine,
      done: String(s.week.done),
      due: String(s.week.due),
      overdue: String(s.week.overdue),
      overdueDot: s.week.overdue ? 'var(--surface-red-5)' : 'transparent',
    }

    return {
      layout,
      empty: !s.milestones.length && !s.s.total,
      canPlan: can.addMilestone(id) && !archived,
      emptyText: can.addMilestone(id) && !archived
        ? 'Start with a milestone: what has to be ready, and by when. Progress, workload and the plan show up here as the work comes in.'
        : 'When the team adds milestones and tasks, progress shows up here.',
      rail,
      split,
      aboutLast: (['focus', 'path'].includes(layout) && !rail) || layout === 'digest',
      // two chart columns: not in a personal project; with a panel docked only on a wide window
      chartColumns: !solo && !phone && (dockedNow.value ? twoCols : width.value >= 1024) ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)',
      currentColumns: dockedNow.value && twoCols ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)',
      about,
      numbers,
      attention,
      workload,
      plan,
      recent,
      digest,
    }
  })

  // The charts measure themselves on a window resize: nudge them when the layout changes so they fit their cards
  const refit = () => nextTick(() => setTimeout(() => window.dispatchEvent(new Event('resize')), 60))
  watch(() => [design.ovLayout, ov.value?.rail, ov.value?.split, design.workload, design.planChart], refit)
  refit()

  const openTask = (id: string) => router.push({ query: { ...route.query, task: id } })
  function ovAct(taskId: string, key: string) {
    const a: any = x.value?.attention.find((i: any) => i.key === key)
    if (!a) return openTask(taskId)
    if (a.action === 'remind' && remindedRecently(a.task, a.person)) return
    if (a.action === 'remind' && a.person && a.person !== state.me) {
      remindTask(a.task.id, a.person)
      toast.success(`Reminder sent to ${personName(a.person)}.`)
    } else openTask(a.task.id)
  }
  return {
    ov,
    ovOpenTask: openTask,
    ovAct,
    ovEdit: () => (state.ui.editProject = pid()),
    ovAddMilestone: () => (state.ui.milestone = { pid: pid() }),
    ovAddTasks: () => {
      state.ui.quickAddSpace = pid()
      state.ui.quickAdd = true
    },
    ovPlanFromList: () => (state.ui.importTasks = { pid: pid() }),
    ovMilestone: (mid: string) => viewTasks(`ms:${mid}`),
    ovFilter: (f: string) => viewTasks(f),
    taskWord: (v: number) => `${v} ${v === 1 ? 'task' : 'tasks'}`,
    hasMilestones: computed(() => milestonesOf(pid()).length > 0),
  }
}
