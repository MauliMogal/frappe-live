<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { me } from '../lib/store'
import { liveNeeds } from '../lib/liveApi'

// Phones, the team only: Inbox · My tasks · Projects · Messages · Reports. Customers have one place (Messages), so no bar.
const route = useRoute()
const staff = computed(() => !!me.value?.canCreateProjects)
const LINKS = [
  { to: '/inbox', icon: 'lucide-inbox', label: 'Inbox' },
  { to: '/', icon: 'lucide-circle-check-big', label: 'My tasks' },
  { to: '/projects', icon: 'lucide-folders', label: 'Projects' },
  { to: '/messages', icon: 'lucide-message-circle', label: 'Messages' },
  { to: '/reports', icon: 'lucide-chart-column', label: 'Reports' },
]
const isActive = (path: string) => (path === '/' ? route.path === '/' : route.path.startsWith(path) || (path === '/projects' && route.path.startsWith('/p/')))
</script>

<template>
  <nav v-if="staff" class="grid grid-cols-5 border-t border-outline-gray-1 bg-surface-base pb-[env(safe-area-inset-bottom)]" aria-label="Main">
    <RouterLink
      v-for="l in LINKS"
      :key="l.to"
      :to="l.to"
      class="relative flex h-14 flex-col items-center justify-center gap-1"
      :class="isActive(l.to) ? 'text-ink-gray-9' : 'text-ink-gray-5'"
    >
      <span class="relative">
        <span :class="l.icon" class="size-5" aria-hidden="true" />
        <span v-if="l.to === '/inbox' && liveNeeds" class="absolute -right-1 -top-0.5 size-2 rounded-full bg-surface-red-5" />
      </span>
      <span class="text-xs-medium">{{ l.label }}</span>
    </RouterLink>
  </nav>
</template>
