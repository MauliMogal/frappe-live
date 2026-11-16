<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Avatar, Progress, Tooltip } from 'frappe-ui'
import { personName, project, milestone } from '../lib/store'
import { isOverdue } from '../lib/dates'
import DueLabel from './DueLabel.vue'
import PriorityIcon from './PriorityIcon.vue'
import { placeCell } from '../lib/place'

// One card on the board. Only what helps you decide at a glance:
// title → priority · deadline · person. Everything else lives in the task panel.
// layout: cards (clean card) · compact (a row in a list) · detailed (adds milestone and subtask progress).
const props = defineProps<{ task: any; layout: string; showAssignee: boolean; showSpace?: boolean; active?: boolean }>()
const t = computed(() => props.task)
const done = computed(() => t.value.status === 'done')
const late = computed(() => isOverdue(t.value))
const subDone = computed(() => t.value.checklist.filter((c: any) => c.done).length)
const pct = computed(() => (t.value.checklist.length ? Math.round((subDone.value / t.value.checklist.length) * 100) : 0))
const ms = computed(() => (t.value.space !== 'general' ? milestone(t.value.space, t.value.milestone) : null))
</script>

<template>
  <!-- Compact: a row, two short lines -->
  <div v-if="layout === 'compact'" class="flex items-start gap-2 px-3 py-2.5">
    <div class="min-w-0 flex-1">
      <p class="truncate text-base" :class="done ? 'text-ink-gray-4' : 'text-ink-gray-9'">{{ t.title }}</p>
      <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <PriorityIcon :priority="t.priority" />
        <span v-if="late" class="inline-flex items-center gap-1 text-ink-red-5"><span class="lucide-circle-alert size-3" aria-hidden="true" />{{ dayjs(t.due).format('D MMM') }}</span>
        <DueLabel v-else-if="t.due" :due="t.due" :status="t.status" class="!text-xs" />
      </p>
    </div>
    <Avatar v-if="showAssignee && t.assignee" class="shrink-0" size="sm" :label="personName(t.assignee)" />
  </div>

  <!-- Cards and Detailed -->
  <div v-else class="space-y-2.5 p-3">
    <p v-if="showSpace && placeCell(t).text" class="truncate text-xs text-ink-gray-5">{{ placeCell(t).text }}</p>
    <p v-if="layout === 'detailed' && ms" class="flex items-center gap-1 truncate text-xs text-ink-gray-5">
      <span class="lucide-flag-triangle-right size-3 shrink-0" aria-hidden="true" />{{ ms.name }}
    </p>
    <p class="line-clamp-2 text-p-base" :class="done ? 'text-ink-gray-4 line-through decoration-ink-gray-3' : 'text-ink-gray-9'">{{ t.title }}</p>

    <div v-if="layout === 'detailed' && t.checklist.length" class="flex items-center gap-2">
      <Progress class="flex-1" size="sm" :value="pct" />
      <span class="text-xs tabular-nums text-ink-gray-5">{{ subDone }}/{{ t.checklist.length }}</span>
    </div>

    <div class="flex items-center gap-2 text-xs">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      <PriorityIcon :priority="t.priority" />
      <span v-if="late" class="inline-flex items-center gap-1 text-ink-red-5"><span class="lucide-circle-alert size-3" aria-hidden="true" />{{ dayjs(t.due).format('D MMM') }}</span>
      <DueLabel v-else-if="t.due" :due="t.due" :status="t.status" class="!text-xs" />
      <span v-if="layout === 'cards' && t.checklist.length" class="inline-flex items-center gap-0.5 tabular-nums text-ink-gray-5">
        <span class="lucide-list-checks size-3" aria-hidden="true" />{{ subDone }}/{{ t.checklist.length }}
      </span>
      </div>
      <span class="shrink-0">
        <Avatar v-if="showAssignee && t.assignee" size="sm" :label="personName(t.assignee)" />
        <span v-else-if="showAssignee" class="lucide-circle-dashed block size-5 text-ink-gray-4" aria-label="No one yet" />
      </span>
    </div>
  </div>
</template>
