import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { state, me, needsCount } from './store'
import { org, currentWs, myWorkspaces, myWsInvites, switchWorkspace, answerWsInvite, inPersonal } from './store'

// What every page header (Studio blocks) binds to. Each page script spreads it into what setup() returns:
//   return { ...pageHeader(router), ...the page's own values }
// Mirrors components/PageTop.vue: "New task" is the one primary button; on phones the header also carries
// ← back (to the parent crumb), Notifications, Search and the account menu (no sidebar there).
export function pageHeader(router: any) {
  const isMobile = useMediaQuery('(max-width: 767px)')

  const openTab = (t: string) => {
    state.ui.settingsTab = t
    state.ui.settings = true
  }
  // Phone avatar menu: workspaces first (phones have no sidebar), then Profile, then the settings sections
  const accountMenu = computed(() => [
    ...(org.on
      ? [
          {
            group: 'Workspace',
            options: [
              ...myWorkspaces.value.map((w: any) => ({
                label: w.name,
                icon: w.id === currentWs.value?.id ? 'lucide-check' : w.kind === 'personal' ? 'lucide-user' : 'lucide-building-2',
                onClick: () => {
                  if (w.id === currentWs.value?.id) return
                  switchWorkspace(w.id)
                  if (router.currentRoute?.value?.path.startsWith('/p/')) router.push('/projects')
                },
              })),
              ...myWsInvites.value.map((x: any) => ({ label: `Join ${x.w.name}`, icon: 'lucide-mail', onClick: () => answerWsInvite(x.w.id, true) })),
              ...(currentWs.value && !inPersonal.value ? [{ label: 'Workspace settings', icon: 'lucide-settings', onClick: () => openTab('workspace') }] : []),
              { label: 'Create workspace', icon: 'lucide-plus', onClick: () => (state.ui.createWorkspace = true) },
            ],
          },
        ]
      : []),
    { group: 'You', hideLabel: true, options: [{ label: 'Profile', icon: 'lucide-user', onClick: () => (state.ui.profile = true) }] },
    {
      group: 'Settings',
      options: [
        { label: 'Appearance', icon: 'lucide-sun-moon', onClick: () => openTab('appearance') },
        { label: 'Archived projects', icon: 'lucide-archive', onClick: () => openTab('archived') },
        { label: 'Deleted tasks', icon: 'lucide-trash-2', onClick: () => router.push('/deleted') },
      ],
    },
  ])

  return {
    isMobile,
    me,
    needsCount,
    // Bell label on phones: the count of things that need you (9+ past nine)
    needsLabel: computed(() => (needsCount.value > 9 ? '9+' : needsCount.value ? String(needsCount.value) : '')),
    accountMenu,
    newTask: () => (state.ui.quickAdd = true),
    openNotifications: () => (state.ui.notifications = true),
    openSearch: () => (state.ui.search = true),
    go: (path: string) => router.push(path),
  }
}
