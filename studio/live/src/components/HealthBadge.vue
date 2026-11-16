<script setup lang="ts">
import { computed } from 'vue'
import { Badge, Tooltip } from 'frappe-ui'
import { HEALTH } from '../lib/meta'
import { state, currentHealth, personName, milestonesOf } from '../lib/store'
import { relTime } from '../lib/dates'
import StatusMark from './StatusMark.vue'

// A project's health (On track / At risk / Off track, or On hold / Completed).
// Grey pill, coloured dot (coloured pills were too loud, mostly in dark mode).
// Hover says where it came from: the owner's update, or the app's suggestion.
const props = defineProps<{ pid: string }>()
// A brand-new project (no milestones, no tasks) has no health yet: "On track" would be made up. Show nothing.
const fresh = computed(() => !milestonesOf(props.pid).length && !state.tasks.some((t: any) => t.space === props.pid && !t.deletedAt))
const h = computed(() => currentHealth(props.pid))
const meta = computed(() => HEALTH[h.value.key] || HEALTH.on)
const why = computed(() =>
  h.value.source === 'update'
    ? `${personName(h.value.update.by)} · ${relTime(h.value.update.at)}`
    : h.value.source === 'auto'
      ? 'Suggested from progress vs time. No update from the lead yet.'
      : meta.value.label,
)
</script>

<template>
  <Tooltip v-if="!fresh" :text="why">
    <Badge size="sm" theme="gray" variant="subtle" :label="meta.label" class="shrink-0">
      <template #prefix>
        <StatusMark :dot="meta.dot" />
      </template>
    </Badge>
  </Tooltip>
</template>
