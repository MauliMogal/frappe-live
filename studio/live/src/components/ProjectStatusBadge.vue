<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from 'frappe-ui'
import StatusMark from './StatusMark.vue'

// Project status, styled like the priority badge: grey pill, only the dot has colour.
const props = defineProps<{ status: string }>()
// A coloured dot per state: blue active, grey on hold, green completed, light grey archived
const MAP: Record<string, { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-surface-blue-5' },
  onhold: { label: 'On hold', dot: 'bg-surface-gray-5' },
  completed: { label: 'Completed', dot: 'bg-surface-green-5' },
  archived: { label: 'Archived', dot: 'bg-surface-gray-4' },
}
const s = computed(() => MAP[props.status] || MAP.active)
</script>

<template>
  <Badge size="sm" theme="gray" variant="subtle" :label="s.label" class="shrink-0">
    <template #prefix>
      <StatusMark :dot="s.dot" />
    </template>
  </Badge>
</template>
