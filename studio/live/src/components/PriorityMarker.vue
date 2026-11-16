<script setup lang="ts">
import { Tooltip } from 'frappe-ui'
import { PRIORITY, prio } from '../lib/meta'
import PriorityIcon from './PriorityIcon.vue'

// Priority badge (P1–P5), with its word on hover. showLabel adds the word next to it: "P1 Urgent".
// No priority: "Set priority" in muted ink (pickers), or just the dash.
const props = withDefaults(defineProps<{ priority: string | null; showLabel?: boolean }>(), { showLabel: false })
</script>

<template>
  <span v-if="!props.priority" class="text-sm text-ink-gray-5">{{ showLabel ? 'Set priority' : '–' }}</span>
  <Tooltip v-else :text="`${PRIORITY[prio(props.priority)].short} · ${PRIORITY[prio(props.priority)].label}`">
    <span class="inline-flex shrink-0 items-center gap-1.5">
      <PriorityIcon :priority="props.priority" />
      <span v-if="showLabel" class="text-sm text-ink-gray-7">{{ PRIORITY[prio(props.priority)].label }}</span>
    </span>
  </Tooltip>
</template>
