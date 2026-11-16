import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import { toast } from 'frappe-ui'
import { state, myNotifications, markAllRead, markRead, prefs, myProjects, project, task, personName, spaceName, isLead, answerJoinRequest, notificationSpace, milestonesOf } from './store'
import { org, wsOf, wsById, currentWs, myWorkspaces, switchWorkspace, isWsMember, answerWsInvite, myProjectInvite, answerProjectInvite } from './store'
import { notificationParts, HEALTH } from './meta'
import { relTime } from './dates'
import { design } from './look'
import { markInboxSeen } from './onboarding'

// The Notifications pop-up: the Studio Component `notifications_panel` (a Frappe UI Dialog with Studio blocks, so it
// can be edited on its own canvas in the Studio editor). Every page with the sidebar places it and spreads this into
// its setup:  return { ...notificationsPanel(router, route), ... }   Everything it binds to starts with `nt`.
// What it shows (same as the prototype's NotificationsPanel + NotificationItem):
//   header: Notifications · Mark all read · settings · ×
//   one list, newest first, in Today / Yesterday / Earlier (Frappe UI List). Each row: avatar (or a bell for reminders),
//   "[Who] [did what] [which task]", then where · when; a status update's health and note; join requests and invites
//   answered right in the row. Opening one takes you to the thing and closes the pop-up.
//   The gear swaps the list for notification settings: ping for Action needed, muted projects.
// Variants → "Notification list": feed with full / inset / no dividers, or a table (Notification · Project · When).
export function notificationsPanel(router: any, route: any) {
  const ntOpen = computed({ get: () => !!state.ui.notifications, set: (v: boolean) => (state.ui.notifications = v) })
  const ntClose = () => (state.ui.notifications = false)
  // Settings can be opened straight from elsewhere (state.ui.notifSettings)
  const view = ref<'list' | 'settings'>('list')
  watch(
    () => state.ui.notifications,
    (v) => {
      if (!v) return
      view.value = state.ui.notifSettings ? 'settings' : 'list'
      state.ui.notifSettings = false
      markInboxSeen()
    },
    { immediate: true },
  )
  // Going somewhere closes it
  watch(() => route?.fullPath, ntClose)

  // ── Rows ──
  const table = computed(() => design.notifList === 'table')
  const ntDivider = computed(() => ({ inset: 'inset', full: 'full', none: 'none', table: 'full' } as Record<string, string>)[design.notifList] || 'full')
  // First column = avatar, so an inset divider lines up with the text
  const ntColumns = computed(() => (table.value ? ['1.25rem', 'minmax(0,1fr)', '5.5rem', '3.5rem'] : ['1.5rem', 'minmax(0,1fr)']))

  const byId = (id: string) => myNotifications.value.find((n: any) => n.id === id)
  // Which workspace it's from (only worth saying when you're in more than one)
  const wsOfN = (n: any) => {
    if (!org.on) return null
    if (n.ws) return n.ws
    const t = n.task ? task(n.task) : null
    const pid = n.project || (t && t.space !== 'general' ? t.space : null)
    return pid ? wsOf(project(pid)) : null
  }
  const pendingRequest = (n: any) =>
    n.type === 'N13' && isLead(n.project) ? project(n.project)?.joinRequests.find((r: any) => r.user === n.actor && r.status === 'pending') || null : null
  const wsInvite = (n: any) => n.type === 'W1' && !isWsMember(n.ws) && !!wsById(n.ws)?.invites.some((i: any) => i.user === state.me && i.status === 'pending')
  const projInvite = (n: any) => n.type === 'P1' && !!myProjectInvite(n.project)

  function row(n: any) {
    const parts = notificationParts(n)
    const space = notificationSpace(n)
    const gone = !!n.task && (!task(n.task) || !!task(n.task)?.deletedAt)
    const health = n.type === 'N20' ? HEALTH[n.health] : null
    const isUpdate = n.type === 'N20' && (!!health || !!n.note)
    const wsName = wsOfN(n) && myWorkspaces.value.length > 1 ? wsById(wsOfN(n))?.name : ''
    const ask = pendingRequest(n) ? `Let ${personName(n.actor)} in?` : wsInvite(n) || projInvite(n) ? `Join ${parts.target}?` : ''
    // Feed: where · when (and "This task was deleted"). Table: where and when have their own columns.
    const where = space && spaceName(space) !== parts.target ? `${spaceName(space)} · ` : ''
    const meta = table.value ? (gone ? 'This task was deleted' : '') : `${where}${relTime(n.at)}${gone ? ' · This task was deleted' : ''}`
    return {
      id: n.id,
      hasActor: !!n.actor,
      actorName: n.actor ? personName(n.actor) : '',
      avatarSize: table.value ? 'sm' : 'md',
      // Unread is just darker text (no dot); names are always medium weight
      textColor: n.read ? 'var(--ink-gray-6)' : 'var(--ink-gray-8)',
      nameColor: n.read ? 'var(--ink-gray-7)' : 'var(--ink-gray-9)',
      unread: !n.read,
      who: parts.who || '',
      what: ` ${parts.what} `,
      target: parts.target || '',
      after: parts.after && n.type !== 'N20' ? ` ${parts.after}` : '',
      meta,
      showMeta: !!meta,
      // Status update: health badge, then the owner's note, in a box of their own
      isUpdate,
      healthLabel: health?.label || '',
      healthDot: health ? `var(--${health.dot.replace(/^bg-/, '')})` : '',
      note: n.type === 'N20' ? n.note || '' : '',
      // Join request or invite: answered right here (feed: a grey box with the question; table: just the buttons)
      ask,
      showAsk: !!ask,
      askText: table.value ? '' : ask,
      askBox: table.value ? 'transparent' : 'var(--surface-gray-2)',
      where: (space ? spaceName(space) : wsName || (n.ws ? wsById(n.ws)?.name : '')) || '—',
      when: relTime(n.at),
      rowPadding: table.value ? '10px 0px' : '12px 0px',
    }
  }
  const ntGroups = computed(() => {
    const g: Record<string, any[]> = { Today: [], Yesterday: [], Earlier: [] }
    myNotifications.value.forEach((n: any) => {
      const d = dayjs(n.at)
      if (d.isSame(dayjs(), 'day')) g.Today.push(row(n))
      else if (d.isSame(dayjs().subtract(1, 'day'), 'day')) g.Yesterday.push(row(n))
      else g.Earlier.push(row(n))
    })
    return Object.entries(g)
      .filter(([, v]) => v.length)
      .map(([label, items]) => ({ label, items }))
  })
  const ntEmpty = computed(() => !myNotifications.value.length)
  const ntUnread = computed(() => myNotifications.value.filter((n: any) => !n.read).length)
  function ntReadAll() {
    markAllRead('needs')
    markAllRead('updates')
  }

  // Opening a notification takes you to the thing itself, where it lives:
  //   a task → its project's Milestones tab (or My tasks) with the task open · a milestone → that milestone
  //   a join request → the project's People · anything else on a project → the project
  function ntOpenItem(id: string) {
    const n = byId(id)
    if (!n) return
    markRead(n.id)
    const w = wsOfN(n)
    // From another workspace: switch to it first, so the thing is there when you land
    if (w && w !== currentWs.value?.id && isWsMember(w)) switchWorkspace(w)
    if (['W2', 'W3'].includes(n.type)) {
      state.ui.settingsTab = 'workspace'
      state.ui.settings = true
      return ntClose()
    }
    if (n.type === 'W1') return
    const t = n.task ? task(n.task) : null
    if (t) {
      const inProject = t.space !== 'general'
      router.push({ path: inProject ? `/p/${t.space}` : '/', query: { ...(inProject ? { tab: 'tasks' } : {}), task: t.id } })
    } else if (n.task) router.push({ path: '/', query: { task: n.task } }) // gone: the panel says so
    else if (n.milestone && n.project) {
      const m = milestonesOf(n.project).find((x: any) => x.id === n.milestone || x.name === n.milestone)
      router.push({ path: `/p/${n.project}`, query: { tab: 'tasks', ...(m ? { ms: m.id } : {}) } })
    } else if (n.type === 'N13') router.push({ path: `/p/${n.project}`, query: { people: '1' } })
    else if (n.project) router.push(`/p/${n.project}`)
    ntClose()
  }
  // Accept / Decline in a row: a join request (you lead the project), a workspace invite or a project invite
  function ntAnswer(id: string, ok: boolean) {
    const n = byId(id)
    if (!n) return
    const req = pendingRequest(n)
    if (req) {
      answerJoinRequest(n.project, req.id, ok)
      markRead(n.id)
      return toast.success(ok ? `${personName(n.actor)} joined ${project(n.project)!.name}.` : `Request from ${personName(n.actor)} declined.`)
    }
    if (wsInvite(n)) {
      const name = wsById(n.ws)?.name
      answerWsInvite(n.ws, ok)
      markRead(n.id)
      toast.success(ok ? `You joined ${name}.` : `Invite to ${name} declined.`)
      if (ok) router.push('/projects')
      return
    }
    if (projInvite(n)) {
      const name = project(n.project)!.name
      answerProjectInvite(n.project, ok)
      markRead(n.id)
      toast.success(ok ? `You joined ${name}.` : `Invite to ${name} declined.`)
      if (ok) {
        const w = wsOfN(n)
        if (w && w !== currentWs.value?.id) switchWorkspace(w, true)
        router.push(`/p/${n.project}`)
      }
    }
  }

  // ── Settings ──
  const p = computed(() => prefs())
  const ntPing = computed({ get: () => p.value.pingActions !== false, set: (v: boolean) => (p.value.pingActions = v) })
  // Only projects you're in can be muted; the menu lists the ones not muted yet
  const ntMuteMenu = computed(() =>
    myProjects.value.filter((x: any) => !p.value.mutedProjects.includes(x.id)).map((x: any) => ({ label: x.name, onClick: () => p.value.mutedProjects.push(x.id) })),
  )
  const ntMuted = computed(() => p.value.mutedProjects.map((id: string) => ({ id, name: project(id)?.name || id })))
  const ntUnmute = (id: string) => (p.value.mutedProjects = p.value.mutedProjects.filter((x: string) => x !== id))
  const ntMutedText = computed(() =>
    myProjects.value.length ? 'Their updates stay out of here. Anything that needs you still arrives.' : "Once you're in a project, you can mute its updates here.",
  )

  return {
    ntOpen,
    ntClose,
    ntSettings: computed(() => view.value === 'settings'),
    ntShowSettings: () => (view.value = 'settings'),
    ntShowList: () => (view.value = 'list'),
    ntTable: table,
    ntDivider,
    ntColumns,
    ntGroups,
    ntEmpty,
    ntUnread,
    ntReadAll,
    ntOpenItem,
    ntAnswer,
    ntPing,
    ntMuteMenu,
    ntMuted,
    ntUnmute,
    ntMutedText,
  }
}
