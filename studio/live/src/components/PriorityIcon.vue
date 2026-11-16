<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from 'frappe-ui'
import { PRIORITY, prio } from '../lib/meta'

// Priority as a Frappe UI Badge: a traffic-light dot + the number, P1 (highest) to P5 (lowest).
// Only the dot has colour. The pill and the number stay grey, the same for every priority.
// The word (Urgent, High…) only shows on hover and in pickers.
// No priority set: a muted dash, never a made-up P3.
const props = defineProps<{ priority: string | null }>()
const p = computed(() => PRIORITY[prio(props.priority)])
</script>

<template>
  <span v-if="!priority" class="shrink-0 text-sm text-ink-gray-4" aria-label="No priority">–</span>
  <!-- Ghost (no background), everywhere -->
  <Badge v-else size="sm" theme="gray" variant="ghost" :label="p.short" class="shrink-0 tabular-nums" :aria-label="`Priority ${p.short}, ${p.label}`">
    <template #prefix>
      <span class="size-1.5 rounded-full" :class="p.dot" aria-hidden="true" />
    </template>
  </Badge>
</template>
