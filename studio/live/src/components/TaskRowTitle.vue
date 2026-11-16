<script setup lang="ts">
import { computed } from 'vue'
import { spaceName } from '../lib/store'
import { relation } from '../lib/taskView'
import DueLabel from './DueLabel.vue'

// Title + second line of a task row.
// flags: where the flag badges go — 'below' (start of line 2), 'inline' (right after the title), 'none' (shown in a column instead)
const props = withDefaults(defineProps<{ task: any; flags?: 'below' | 'inline' | 'none'; showSpace?: boolean }>(), {
  flags: 'below',
  showSpace: true,
})
const t = computed(() => props.task)
const rel = computed(() => relation(t.value))
const closed = computed(() => t.value.status === 'done' || t.value.status === 'cancelled')
const excerpt = computed(() => (t.value.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
const hasFlags = computed(() => false) // (no flag badges any more: Blocked was removed)
</script>

<template>
  <div class="min-w-0 flex-1 md:min-w-48">
    <div class="flex min-w-0 items-center gap-2">
      <p class="truncate" :class="closed ? 'text-base text-ink-gray-4' : 'text-base-medium text-ink-gray-9'">{{ t.title }}</p>
    </div>
    <div
      v-if="excerpt || (flags === 'below' && hasFlags)"
      class="mt-1 hidden min-w-0 items-center gap-2 md:flex"
    >
      <span v-if="excerpt" class="truncate text-p-sm text-ink-gray-5">{{ excerpt }}</span>
    </div>
    <!-- Mobile: flags + meta on one line, whatever the desktop placement -->
    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-gray-5 md:hidden">
      <span v-if="showSpace">{{ spaceName(t.space) }}</span>
      <span v-if="rel" :class="rel.strong ? 'text-ink-gray-9' : ''">{{ rel.text }}</span>
      <DueLabel :due="t.due" :status="t.status" />
    </div>
  </div>
</template>
