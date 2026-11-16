import { computed, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { toast } from 'frappe-ui'
import { state, me, inScope } from './store'
import { org, currentWs, myWorkspaces, myWsInvites, switchWorkspace, answerWsInvite, inPersonal, canInviteToWs } from './store'
import { pinnedProjects, setPinned } from './pins'
import { can } from './permissions'
import { liveWaiting, watchWaiting } from './liveApi'

// What the sidebar (Studio Component `app_sidebar`, Studio's Sidebar blocks) binds to. Every page with the
// sidebar spreads it into what its script's setup() returns:  return { ...appSidebar(router, route), ... }
// Mirrors the prototype's AppSidebar.vue: Search · Notifications · My tasks · Notes · Projects, then Pinned projects.
// The header is Frappe UI's SidebarHeader: the workspace (its first letter as the logo), "Tasks" / "Only you" under
// it, and the account menu (Profile, your workspaces, invites, Invite people, Settings, Create workspace).
export function appSidebar(router: any, route: any) {
  // The current path from the page's `route` (in the Studio editor, `router` has no currentRoute)
  const path = () => route?.path || ''
  const sidebarCollapsed = computed({
    get: () => !!state.ui.sidebarCollapsed,
    set: (v: boolean) => (state.ui.sidebarCollapsed = v),
  })
  // Tablets and phones held sideways (768–1023px): start folded to icons, so the page gets the room
  const narrow = useMediaQuery('(max-width: 1023px)')
  watch(narrow, (v) => v && (sidebarCollapsed.value = true), { immediate: true })

  watchWaiting()
  const openSettings = (tab: string) => {
    state.ui.settingsTab = tab
    state.ui.settings = true
  }
  // Switching from a project page goes to Projects (that project isn't in the other workspace)
  function goSwitch(id: string) {
    if (id === currentWs.value?.id) return
    switchWorkspace(id)
    if (path().startsWith('/p/')) router.push('/projects')
  }
  const headerMenu = computed(() => [
    { group: me.value?.name || 'You', options: [{ label: 'Profile', icon: 'lucide-circle-user', onClick: () => (state.ui.profile = true) }] },
    {
      group: 'Workspaces',
      options: myWorkspaces.value.map((w: any) => ({
        label: w.name,
        icon: w.id === currentWs.value?.id ? 'lucide-check' : w.kind === 'personal' ? 'lucide-user' : 'lucide-building-2',
        onClick: () => goSwitch(w.id),
      })),
    },
    ...(myWsInvites.value.length
      ? [
          {
            group: 'Invited',
            options: myWsInvites.value.map((x: any) => ({
              label: `Join ${x.w.name}`,
              icon: 'lucide-mail',
              onClick: () => (answerWsInvite(x.w.id, true), toast.success(`You joined ${x.w.name}.`), router.push('/projects')),
            })),
          },
        ]
      : []),
    {
      group: 'Manage',
      options: [
        ...(canInviteToWs.value ? [{ label: 'Invite people', icon: 'lucide-user-plus', onClick: () => openSettings('workspace') }] : []),
        // One Settings for everyone: a company workspace opens on its Workspace tab, otherwise on Appearance
        { label: 'Settings', icon: 'lucide-settings', onClick: () => openSettings(currentWs.value && !inPersonal.value ? 'workspace' : 'appearance') },
        { label: 'Create workspace', icon: 'lucide-plus', onClick: () => (state.ui.createWorkspace = true) },
      ],
    },
  ])
  // Header: "Tasks", with the workspace under it (Personal, Frappe…). The mark is the workspace's letter
  // (a person in Personal, a building when you're in none).
  const wsTitle = computed(() => 'Frappe Live')
  const wsSubtitle = computed(() =>
    myWsInvites.value.length && !currentWs.value
      ? `${myWsInvites.value.length} invite waiting`
      : inPersonal.value
        ? 'Personal'
        : currentWs.value?.name || 'No workspace',
  )
  const wsInitial = computed(() => (currentWs.value?.name || '?').trim()[0]?.toUpperCase())
  const wsMarkIcon = computed(() => (inPersonal.value ? 'lucide-user' : !currentWs.value ? 'lucide-building-2' : ''))

  // Pinned projects: the only projects in the sidebar. Only you pin or unpin.
  // `active` is explicit: every /p/<id> link is the same Studio page (Project), so SidebarItem's own route matching
  // would mark all pinned projects active at once
  const pinned = computed(() =>
    pinnedProjects.value.map((p: any) => ({
      id: p.id,
      name: p.name,
      route: `/p/${p.id}`,
      active: path() === `/p/${p.id}`,
    })),
  )
  const inAnyProject = computed(() =>
    state.projects.some((p: any) => p.status !== 'archived' && inScope(p) && p.members.some((m: any) => m.user === state.me)),
  )
  const pinnedHint = computed(() =>
    org.on && !currentWs.value
      ? 'Join a workspace to see its projects.'
      : inAnyProject.value
        ? "Pin the projects you're in from Projects to keep them here."
        : 'Join or create a project, then pin it here.',
  )
  function unpin(id: string) {
    const p: any = pinnedProjects.value.find((x: any) => x.id === id)
    if (!p) return
    setPinned(id, false)
    toast.success(`${p.name} removed from your sidebar.`, { action: { label: 'Undo', onClick: () => setPinned(id, true) } })
  }
  // (The Notifications count, needsLabel, comes from pageHeader.ts, which every page spreads too)
  return {
    sidebarCollapsed,
    headerMenu,
    wsTitle,
    wsSubtitle,
    wsInitial,
    wsMarkIcon,
    notificationsOpen: computed(() => !!state.ui.notifications),
    toggleNotifications: () => (state.ui.notifications = !state.ui.notifications),
    canCreateProject: computed(() => can.createProject()),
    // Frappe Live: Messages for everyone, Reports for the team (super admins and frappe.io admins)
    canSeeReports: computed(() => !!me.value?.canCreateProjects),
    messagesLabel: computed(() => (liveWaiting.value ? String(liveWaiting.value) : '')),
    newProject: () => (state.ui.createProject = true),
    pinned,
    pinnedHint,
    unpin,
  }
}
