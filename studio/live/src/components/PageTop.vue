<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { PageHeader, Button, Dropdown, Avatar, Breadcrumbs } from 'frappe-ui'
import { useMediaQuery } from '@vueuse/core'
import { state, me, signOut, needsCount } from '../lib/store'
import { org, currentWs, myWorkspaces, myWsInvites, switchWorkspace, isWsAdmin, answerWsInvite, inPersonal } from '../lib/store'
import { dockedNow } from '../lib/panelLayout'

// Page header: title left, actions right, and "New task" as the one primary button at the far right
// (like ERPNext and Frappe CRM). On mobile the bottom bar's + does that job, and the header carries
// Search and the account menu instead.
// crumbs: show Frappe UI breadcrumbs in place of the plain title (Projects › Gameplan). The last one is the page.
withDefaults(defineProps<{ title: string; subtitle?: string; icon?: string; hideNewTask?: boolean; crumbs?: { label: string; route?: string }[] }>(), {
  hideNewTask: false,
})
const isMobile = useMediaQuery('(max-width: 767px)')
const router = useRouter()

// Phone avatar menu: Profile on its own (Log out inside), then the settings. Phones show one settings section per
// window (no list or back step), so the sections are listed here: Appearance · Archived projects · Deleted tasks.
const openTab = (t: string) => {
  state.ui.settingsTab = t
  state.ui.settings = true
}
// Workspaces on (phones have no sidebar): the workspace switcher sits first in this menu
const wsGroup = computed(() =>
  org.on
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
                if (router.currentRoute.value.path.startsWith('/p/')) router.push('/projects')
              },
            })),
            ...myWsInvites.value.map((x: any) => ({ label: `Join ${x.w.name}`, icon: 'lucide-mail', onClick: () => answerWsInvite(x.w.id, true) })),
            ...(currentWs.value && !inPersonal.value ? [{ label: 'Workspace settings', icon: 'lucide-settings', onClick: () => openTab('workspace') }] : []),
            { label: 'Create workspace', icon: 'lucide-plus', onClick: () => (state.ui.createWorkspace = true) },
          ],
        },
      ]
    : [],
)
const menu = computed(() => [
  ...wsGroup.value,
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
</script>

<template>
  <PageHeader>
    <!-- Narrow page (e.g. next to the task panel): the title side gives way (subtitle hides, title truncates); buttons stay whole -->
    <div class="flex min-w-0 shrink items-center gap-2">
      <!-- Phones: a page inside another (a project inside Projects) gets ← back to its parent -->
      <Button
        v-if="isMobile && crumbs && crumbs.length > 1 && crumbs[crumbs.length - 2].route"
        class="-ml-1.5 shrink-0"
        variant="ghost"
        icon="lucide-arrow-left"
        :aria-label="`Back to ${crumbs[crumbs.length - 2].label}`"
        @click="router.push(crumbs[crumbs.length - 2].route!)"
      />
      <span v-if="icon" :class="icon" class="size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
      <h1 v-if="crumbs?.length && !isMobile" class="min-w-0 text-lg-semibold">
        <Breadcrumbs :items="crumbs.map((c) => (c.route ? { label: c.label, route: c.route } : { label: c.label }))" />
      </h1>
      <!-- Phones, a page inside another: a short breadcrumb (the parent, tappable) above the page's name -->
      <div v-else-if="crumbs && crumbs.length > 1" class="min-w-0 leading-tight">
        <RouterLink v-if="crumbs[crumbs.length - 2].route" :to="crumbs[crumbs.length - 2].route!" class="block truncate text-xs text-ink-gray-5">{{ crumbs[crumbs.length - 2].label }}</RouterLink>
        <h1 class="truncate text-base-semibold text-ink-gray-9">{{ crumbs[crumbs.length - 1].label }}</h1>
      </div>
      <!-- Phones, a top page (My tasks, Notes, Projects: the bottom bar gets you there): just its name -->
      <h1 v-else class="truncate text-lg-semibold text-ink-gray-9">{{ crumbs?.length ? crumbs[crumbs.length - 1].label : title }}</h1>
      <span v-if="subtitle && !dockedNow" class="hidden truncate text-sm text-ink-gray-5 sm:inline">{{ subtitle }}</span>
    </div>
    <div class="ml-auto flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pl-2 [scrollbar-width:none]">
      <slot name="actions" />
      <Button
        v-if="!isMobile && !hideNewTask"
        data-tour="new-task"
        variant="solid"
        theme="gray"
        icon-left="lucide-plus"
        label="New task"
        tooltip="New task (C)"
        @click="state.ui.quickAdd = true"
      />
      <template v-if="isMobile">
        <!-- Notifications (not in the bottom bar): bell with the count of things that need you -->
        <span class="relative inline-flex">
          <Button variant="ghost" icon="lucide-bell" :aria-label="needsCount ? `Notifications, ${needsCount} need you` : 'Notifications'" @click="state.ui.notifications = true" />
          <span v-if="needsCount" class="pointer-events-none absolute right-0.5 top-0.5 text-2xs-semibold tabular-nums text-ink-gray-9">{{ needsCount > 9 ? '9+' : needsCount }}</span>
        </span>
        <Button variant="ghost" icon="lucide-search" aria-label="Search" @click="state.ui.search = true" />
        <Dropdown :options="menu" align="end">
          <button type="button" class="rounded-full" aria-label="Account menu" data-tour="account">
            <Avatar :label="me.name" size="md" />
          </button>
        </Dropdown>
      </template>
    </div>
  </PageHeader>
</template>
