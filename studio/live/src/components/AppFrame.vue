<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../lib/store'
import { panelMode, panelWidth, dockedNow } from '../lib/panelLayout'
import { DesktopShell, MobileShell } from 'frappe-ui'
import MobileBottomBar from './MobileBottomBar.vue'
import CreateTaskPanel from './CreateTaskPanel.vue'
import TaskPanel from './TaskPanel.vue'
import SuggestChangeSheet from './SuggestChangeSheet.vue'
import CreateProjectDialog from './CreateProjectDialog.vue'
import ProjectSettingsDialog from './ProjectSettingsDialog.vue'
import JoinRequestDialog from './JoinRequestDialog.vue'
import SearchOverlay from './SearchOverlay.vue'
import AppSettings from './AppSettings.vue'
import ProfileDialog from './ProfileDialog.vue'
import OfflineBanner from './OfflineBanner.vue'
import MilestoneDialog from './MilestoneDialog.vue'
import ProjectUpdateDialog from './ProjectUpdateDialog.vue'
import ImportTasksDialog from './ImportTasksDialog.vue'
import CreateWorkspaceDialog from './CreateWorkspaceDialog.vue'
import InviteDialog from './InviteDialog.vue'

// The app's shell and overlays. AppShell.vue keeps the logic; this is only the layout.
// The page (a Studio page's blocks) comes in through the default slot, where the prototype had <RouterView>.
defineProps<{ bare: boolean; isMobile: boolean; offline: boolean }>()
const route = useRoute()
// Side panels (task detail, New task, New / edit milestone) dock and the page makes room for them.
const docked = computed(() => panelMode.value === 'dock' && (!!route.query.task || state.ui.quickAdd || !!state.ui.milestone))
watch(docked, (v) => (dockedNow.value = v), { immediate: true })
// Deep links that open a panel: ?new=task (in the current project) or ?new=milestone (project pages)
const router = useRouter()
watch(
  () => route.query.new,
  async (v) => {
    if (!v) return
    await router.isReady()
    const pid = route.path.startsWith('/p/') ? String(route.params.id) : null
    if (v === 'task') {
      state.ui.quickAddSpace = pid
      state.ui.quickAdd = true
    } else if (v === 'milestone' && pid) state.ui.milestone = { pid }
    const q = { ...route.query }
    delete q.new
    router.replace({ query: q })
  },
  { immediate: true },
)
</script>

<template>
  <!-- h-full, not h-screen: 100vh is the browser window, which on the Studio canvas is not the frame's height -->
  <div class="h-full w-full bg-surface-base text-ink-gray-9">
    <slot v-if="bare" />
    <template v-else>
      <!-- <main>: the page itself, so screen readers can jump straight to it -->
      <MobileShell v-if="isMobile">
        <main class="h-full min-h-0"><slot /></main>
        <template #nav>
          <MobileBottomBar />
        </template>
      </MobileShell>
      <!-- When a side panel is docked, the page makes room for it instead of being covered -->
      <div v-else class="h-full transition-[padding] duration-200 ease-out" :style="{ paddingRight: docked ? `${panelWidth}px` : '0px' }">
        <!-- scroll=false: the content area fills the height and pages scroll their own body (header stays put).
             With the default ScrollArea, its inner wrapper is only as tall as the content, so pages couldn't fill it. -->
        <DesktopShell :scroll="false">
          <!-- The sidebar is Studio blocks (the app_sidebar Studio Component), passed in by each page -->
          <template #sidebar>
            <slot name="sidebar" />
          </template>
          <main class="h-full min-h-0 min-w-0"><slot /></main>
        </DesktopShell>
      </div>
      <Transition name="panel">
        <TaskPanel v-if="route.query.task" />
      </Transition>
      <CreateTaskPanel />
      <SuggestChangeSheet />
      <CreateProjectDialog />
      <ProjectSettingsDialog />
      <JoinRequestDialog />
      <SearchOverlay />
      <AppSettings />
      <ProfileDialog />
      <MilestoneDialog />
      <ProjectUpdateDialog />
      <ImportTasksDialog />
      <!-- Notifications: the Studio Component notifications_panel, placed on each sidebar page -->
      <CreateWorkspaceDialog />
      <InviteDialog />
    </template>
    <OfflineBanner :offline="offline" />
  </div>
</template>
