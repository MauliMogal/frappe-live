<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import {
  SettingsDialog,
  SettingsSidebar,
  SettingsNavGroup,
  SettingsNavItem,
  SettingsContent,
  SettingsPanel,
  SettingsHeader,
  SettingsBody,
  SettingsRow,
  FormControl,
  Switch,
  Button,
  Avatar,
  TabButtons,
  Dialog,
  toast,
} from 'frappe-ui'
import { state, me, archivedProjects, archiveProject, isLead, leadsOf, personName } from '../lib/store'
import { theme, setTheme } from '../lib/theme'
import { views } from '../lib/viewState'
import { showAddRow, setAddRow } from '../lib/addRow'
import { org, currentWs, inPersonal } from '../lib/store'
import WorkspaceSettings from './WorkspaceSettings.vue'

// Account: Profile · Appearance · Archived projects (opened from the account menu). No Settings section:
// notification settings live in the Notifications panel (its gear).
// Desktop: Frappe UI SettingsDialog (sidebar + panels). Phones: a modal of its own, because the dialog's side-by-side
// layout doesn't fit: just the picked section, settings stacked (name, help, control).
const isMobile = useMediaQuery('(max-width: 767px)')
const router = useRouter()
// Settings (the sidebar's Settings item): Appearance · Archived projects · Deleted tasks. Profile is its own window
// (ProfileDialog.vue, from the profile item); anything still asking for the profile tab gets that window.
// Workspaces on: a Workspace tab too (people, invites, leave)
// (Not in your personal workspace: it has no people or invites to manage)
const hasWs = computed(() => org.on && !!currentWs.value && !inPersonal.value)
const TABS = computed(() => (hasWs.value ? ['workspace', 'appearance', 'archived'] : ['appearance', 'archived']))
const open = computed({
  get: () => state.ui.settings,
  set: (v) => (state.ui.settings = v),
})
const tab = computed({
  get: () => (TABS.value.includes(state.ui.settingsTab) ? state.ui.settingsTab : 'appearance'),
  set: (v) => {
    // Deleted tasks is a page: the item takes you there
    if (v === 'deleted') {
      state.ui.settings = false
      router.push('/deleted')
      return
    }
    state.ui.settingsTab = v
  },
})
watch(open, (v) => {
  if (v && state.ui.settingsTab === 'profile') {
    state.ui.settings = false
    state.ui.profile = true
  }
})
// Anything still asking for the old Notifications tab gets the Notifications panel's settings instead
watch(open, (v) => {
  if (v && state.ui.settingsTab === 'notifications') {
    state.ui.settings = false
    state.ui.notifSettings = true
    state.ui.notifications = true
  }
})

// Profile
const profile = ref({ name: '', role: '', timezone: 'Asia/Kolkata' })
watch(open, (v) => {
  if (v) profile.value = { name: me.value.name, role: me.value.role, timezone: me.value.timezone || 'Asia/Kolkata' }
})
const profileChanged = computed(
  () => profile.value.name !== me.value.name || profile.value.role !== me.value.role || profile.value.timezone !== (me.value.timezone || 'Asia/Kolkata'),
)
function saveProfile() {
  if (!profile.value.name.trim()) return
  Object.assign(me.value, { name: profile.value.name.trim(), role: profile.value.role.trim(), timezone: profile.value.timezone })
  toast.success('Profile saved.')
}

// Archived projects
function openArchived(id: string) {
  open.value = false
  router.push(`/p/${id}`)
}
function unarchive(ap: any) {
  archiveProject(ap.id, false)
  toast.success(`${ap.name} is back in your sidebar.`)
}

// Appearance
const addRowModel = computed({ get: () => showAddRow.value, set: (v: boolean) => setAddRow(v) })
const themeModel = computed({ get: () => theme.value, set: (v: any) => setTheme(v) })
const ICONS: Record<string, string> = {
  light: 'lucide-sun',
  dark: 'lucide-moon',
  system: 'lucide-monitor',
  list: 'lucide-list',
  board: 'lucide-columns-3',
}
const themeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
]
const viewOptions = [
  { label: 'List', value: 'list' },
  { label: 'Board', value: 'board' },
]
// My tasks only: project pages always open on their Milestones tab, so this choice can't apply there
const defaultView = computed({
  get: () => views.home,
  set: (v: string) => (views.home = v),
})
const TIMEZONES = [
  { label: 'India (IST)', value: 'Asia/Kolkata' },
  { label: 'UTC', value: 'UTC' },
  { label: 'London', value: 'Europe/London' },
  { label: 'New York', value: 'America/New_York' },
]
// Phones: the section shown in the modal = the one picked in the account menu.
const mobileTabs = [
  { label: 'Workspace', value: 'workspace', icon: 'lucide-building-2' },
  { label: 'Profile', value: 'profile', icon: 'lucide-user' },
  { label: 'Appearance', value: 'appearance', icon: 'lucide-sun-moon' },
  { label: 'Archived projects', value: 'archived', icon: 'lucide-archive' },
]
const section = ref<string>('appearance')
watch(open, (v) => v && (section.value = tab.value))
</script>

<template>
  <!-- ════ Phones: a modal showing just the section picked in the account menu. No back button or section list:
       the menu already chose it, so a step back would only add a tap. × closes. ════ -->
  <Dialog v-if="isMobile" v-model:open="open" bare size="md">
    <div class="flex max-h-[min(40rem,calc(100vh-4rem))] flex-col overflow-hidden rounded-6 bg-surface-base" aria-label="Account">
      <header class="flex h-12 shrink-0 items-center gap-1 border-b border-outline-gray-1 px-2">
        <h2 class="pl-2 text-base-semibold text-ink-gray-9">{{ mobileTabs.find((t) => t.value === section)?.label }}</h2>
        <Button class="ml-auto" variant="ghost" icon="lucide-x" aria-label="Close" @click="open = false" />
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
        <WorkspaceSettings v-if="section === 'workspace'" />
        <!-- Appearance: name and help on top, the control under it -->
        <div v-else-if="section === 'appearance'" class="divide-y divide-outline-gray-1">
          <section class="space-y-2.5 pb-4">
            <div>
              <p class="text-base-medium text-ink-gray-9">Theme</p>
              <p class="mt-0.5 text-p-sm text-ink-gray-5">System matches your device.</p>
            </div>
            <TabButtons v-model="themeModel" :options="themeOptions" class="w-full [&_button]:flex-1" aria-label="Theme">
              <template #prefix="{ button }"><span :class="ICONS[button.value]" class="size-3.5" aria-hidden="true" /></template>
            </TabButtons>
          </section>
          <label class="flex cursor-pointer items-start gap-3 py-4">
            <span class="min-w-0 flex-1">
              <span class="block text-base-medium text-ink-gray-9">Quick add row</span>
              <span class="mt-0.5 block text-p-sm text-ink-gray-5">The “Add a task” line at the top of your lists.</span>
            </span>
            <Switch v-model="addRowModel" aria-label="Quick add row" />
          </label>
          <section class="space-y-2.5 pt-4">
            <div>
              <p class="text-base-medium text-ink-gray-9">Task view</p>
              <p class="mt-0.5 text-p-sm text-ink-gray-5">How My tasks opens.</p>
            </div>
            <TabButtons v-model="defaultView" :options="viewOptions" class="w-full [&_button]:flex-1" aria-label="Task view">
              <template #prefix="{ button }"><span :class="ICONS[button.value]" class="size-3.5" aria-hidden="true" /></template>
            </TabButtons>
          </section>
        </div>

        <!-- Archived projects -->
        <div v-else>
          <p v-if="!archivedProjects.length" class="py-10 text-center text-base-medium text-ink-gray-8">No archived projects</p>
          <div v-else class="divide-y divide-outline-gray-1">
            <div v-for="ap in archivedProjects" :key="ap.id" class="flex items-center gap-3 py-3">
              <span class="lucide-archive size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-base text-ink-gray-8">{{ ap.name }}</p>
                <p class="truncate text-xs text-ink-gray-5">Lead {{ leadsOf(ap.id).map(personName).join(', ') }}</p>
              </div>
              <Button variant="ghost" size="sm" label="Open" @click="openArchived(ap.id)" />
              <Button v-if="isLead(ap.id)" variant="subtle" size="sm" label="Unarchive" @click="unarchive(ap)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Dialog>

  <!-- ════ Desktop: Frappe UI SettingsDialog ════ -->
  <SettingsDialog v-else v-model:open="open" v-model:tab="tab">
    <template #title>Settings</template>
    <SettingsSidebar>
      <SettingsNavGroup v-if="hasWs" label="Workspace">
        <SettingsNavItem value="workspace">
          <template #prefix><span class="lucide-building-2 size-4" aria-hidden="true" /></template>
          {{ currentWs?.name }}
        </SettingsNavItem>
      </SettingsNavGroup>
      <SettingsNavGroup label="General">
        <SettingsNavItem value="appearance">
          <template #prefix><span class="lucide-sun-moon size-4" aria-hidden="true" /></template>
          Appearance
        </SettingsNavItem>
      </SettingsNavGroup>
      <SettingsNavGroup label="Projects">
        <SettingsNavItem value="archived">
          <template #prefix><span class="lucide-archive size-4" aria-hidden="true" /></template>
          Archived projects
          <template #suffix><span v-if="archivedProjects.length" class="text-xs tabular-nums text-ink-gray-5">{{ archivedProjects.length }}</span></template>
        </SettingsNavItem>
        <SettingsNavItem value="deleted">
          <template #prefix><span class="lucide-trash-2 size-4" aria-hidden="true" /></template>
          Deleted tasks
          <template #suffix><span class="lucide-arrow-up-right size-3.5 text-ink-gray-4" aria-hidden="true" /></template>
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>

    <SettingsContent>
      <SettingsPanel v-if="hasWs" value="workspace">
        <SettingsHeader :title="currentWs?.name || 'Workspace'" description="The people in this workspace and their invites." />
        <SettingsBody>
          <WorkspaceSettings />
        </SettingsBody>
      </SettingsPanel>
      <SettingsPanel value="appearance">
        <SettingsHeader title="Appearance" description="How Frappe Tasks looks on this device." />
        <SettingsBody>
          <div class="divide-y divide-outline-gray-1">
            <SettingsRow title="Theme" description="System matches your device.">
              <TabButtons v-model="themeModel" :options="themeOptions" aria-label="Theme">
                <template #prefix="{ button }"><span :class="ICONS[button.value]" class="size-3.5" aria-hidden="true" /></template>
              </TabButtons>
            </SettingsRow>
            <SettingsRow title="Quick add row" description="The “Add a task” line at the top of your lists.">
              <Switch v-model="addRowModel" aria-label="Quick add row" />
            </SettingsRow>
            <SettingsRow title="Task view" description="How My tasks opens.">
              <TabButtons v-model="defaultView" :options="viewOptions" aria-label="Task view">
                <template #prefix="{ button }"><span :class="ICONS[button.value]" class="size-3.5" aria-hidden="true" /></template>
              </TabButtons>
            </SettingsRow>
          </div>
        </SettingsBody>
      </SettingsPanel>

      <SettingsPanel value="archived">
        <SettingsHeader title="Archived projects" description="Finished or paused projects. Tasks are read-only." />
        <SettingsBody>
          <div v-if="!archivedProjects.length" class="py-10 text-center">
            <p class="text-base-medium text-ink-gray-8">No archived projects</p>
          </div>
          <div v-else class="divide-y divide-outline-gray-1">
            <div v-for="ap in archivedProjects" :key="ap.id" class="flex flex-wrap items-center gap-3 py-3">
              <span class="lucide-archive size-4 text-ink-gray-5" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="text-base text-ink-gray-8">{{ ap.name }}</p>
                <p class="text-xs text-ink-gray-5">Lead {{ leadsOf(ap.id).map(personName).join(', ') }}</p>
              </div>
              <Button variant="ghost" label="Open" @click="openArchived(ap.id)" />
              <Button v-if="isLead(ap.id)" variant="subtle" label="Unarchive" @click="unarchive(ap)" />
            </div>
          </div>
        </SettingsBody>
      </SettingsPanel>
    </SettingsContent>
  </SettingsDialog>
</template>
