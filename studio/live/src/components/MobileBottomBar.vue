<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { state, attention, myProjects } from '../lib/store'
import AttentionDot from './AttentionDot.vue'

// Mobile bottom bar (decided order): My tasks · Notes · New task · Projects.
// Notifications live in the page header (bell, next to Search), not here.
// Only the current place is dark; New task is dark only while the New task panel is open.
const route = useRoute()
const projectsDot = computed(() => myProjects.value.some((p) => attention(p.id)))
const isActive = (path: string) =>
  path === '/' ? route.path === '/' : route.path.startsWith(path) || (path === '/projects' && (route.path.startsWith('/p/') || route.path === '/general'))
</script>

<template>
  <nav
    class="grid grid-cols-4 border-t border-outline-gray-1 bg-surface-base pb-[env(safe-area-inset-bottom)]"
    aria-label="Main"
  >
    <RouterLink
      to="/"
      data-tour="nav-home"
      class="flex h-14 flex-col items-center justify-center gap-1"
      :class="isActive('/') ? 'text-ink-gray-9' : 'text-ink-gray-5'"
    >
      <span class="lucide-circle-check-big size-5" aria-hidden="true" />
      <span class="text-xs-medium">My tasks</span>
    </RouterLink>
    <RouterLink
      to="/notes"
      class="flex h-14 flex-col items-center justify-center gap-1"
      :class="isActive('/notes') ? 'text-ink-gray-9' : 'text-ink-gray-5'"
    >
      <span class="lucide-notebook-pen size-5" aria-hidden="true" />
      <span class="text-xs-medium">Notes</span>
    </RouterLink>
    <button
      type="button"
      data-tour="new-task"
      class="flex h-14 flex-col items-center justify-center gap-1"
      :class="state.ui.quickAdd ? 'text-ink-gray-9' : 'text-ink-gray-5'"
      @click="state.ui.quickAdd = true"
    >
      <span class="lucide-circle-plus size-5" aria-hidden="true" />
      <span class="text-xs-medium">New task</span>
    </button>
    <RouterLink
      to="/projects"
      data-tour="nav-project"
      class="relative flex h-14 flex-col items-center justify-center gap-1"
      :class="isActive('/projects') ? 'text-ink-gray-9' : 'text-ink-gray-5'"
    >
      <span class="relative">
        <span class="lucide-folder size-5" aria-hidden="true" />
        <AttentionDot v-if="projectsDot" class="absolute -right-1 -top-0.5" />
      </span>
      <span class="text-xs-medium">Projects</span>
    </RouterLink>
  </nav>
</template>
