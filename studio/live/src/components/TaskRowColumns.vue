<script setup lang="ts">
import { computed } from 'vue'
import { Avatar, Badge, Tooltip } from 'frappe-ui'
import { state, personName } from '../lib/store'
import { relation } from '../lib/taskView'
import { toneFor, labelVariant } from '../lib/look'
import PriorityMarker from './PriorityMarker.vue'
import DueLabel from './DueLabel.vue'
import { placeCell } from '../lib/place'

// Right-hand columns of a task row, on one grid so every row lines up with the same gaps.
// flagColumn: adds a "state" column for the flag badges (used by the "own column" variant).
const props = withDefaults(defineProps<{ task: any; showSpace?: boolean; flagColumn?: boolean }>(), {
  showSpace: true,
  flagColumn: false,
})
const t = computed(() => props.task)
const rel = computed(() => relation(t.value))
const checklistDone = computed(() => t.value.checklist.filter((c: any) => c.done).length)
</script>

<template>
  <div
    class="hidden shrink-0 items-center gap-x-6 md:grid"
    :class="
      flagColumn
        ? 'md:grid-cols-[9rem_8rem_7rem_1.25rem_1.5rem] lg:grid-cols-[9rem_8rem_7rem_7.5rem_1.25rem_1.5rem] xl:grid-cols-[9rem_8rem_8.5rem_7rem_7.5rem_1.25rem_1.5rem]'
        : 'md:grid-cols-[8rem_7rem_1.25rem_1.5rem] lg:grid-cols-[8rem_7rem_7.5rem_1.25rem_1.5rem] xl:grid-cols-[8rem_8.5rem_7rem_7.5rem_1.25rem_1.5rem]'
    "
  >
    <!-- State (flags) -->
    <div v-if="flagColumn" class="min-w-0 overflow-hidden" />
    <!-- Where + relation -->
    <div class="min-w-0 leading-tight">
      <p v-if="showSpace" class="truncate text-sm text-ink-gray-7">{{ placeCell(t).text }}</p>
      <p v-if="rel" class="truncate text-xs" :class="rel.strong ? 'text-ink-gray-9' : 'text-ink-gray-5'">{{ rel.text }}</p>
    </div>
    <!-- Labels -->
    <div class="hidden min-w-0 items-center gap-1 overflow-hidden xl:flex">
      <Badge
        v-for="l in t.labels.slice(0, 1)"
        :key="l"
        :variant="labelVariant()"
        :theme="toneFor('label', l)"
        :label="l"
      />
      <span v-if="t.labels.length > 1" class="text-xs text-ink-gray-5">+{{ t.labels.length - 1 }}</span>
    </div>
    <!-- Due -->
    <div class="flex min-w-0 items-center gap-1.5 text-sm">
      <span class="lucide-flag size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
      <DueLabel v-if="t.due" :due="t.due" :status="t.status" />
      <span v-else class="text-ink-gray-4">No due date</span>
    </div>
    <!-- Counts: three fixed slots so each icon stays in the same place on every row -->
    <div class="hidden grid-cols-[3rem_2.25rem_2.25rem] items-center text-xs tabular-nums text-ink-gray-5 lg:grid">
      <span class="inline-flex items-center gap-1" :title="t.checklist.length ? `Subtasks ${checklistDone} of ${t.checklist.length}` : undefined">
        <template v-if="t.checklist.length"><span class="lucide-list-checks size-3.5" aria-hidden="true" />{{ checklistDone }}/{{ t.checklist.length }}</template>
      </span>
      <span class="inline-flex items-center gap-1" :title="t.comments.length ? `${t.comments.length} comments` : undefined">
        <template v-if="t.comments.length"><span class="lucide-message-circle size-3.5" aria-hidden="true" />{{ t.comments.length }}</template>
      </span>
      <span class="inline-flex items-center gap-1" :title="t.attachments.length ? `${t.attachments.length} files and links` : undefined">
        <template v-if="t.attachments.length"><span class="lucide-paperclip size-3.5" aria-hidden="true" />{{ t.attachments.length }}</template>
      </span>
    </div>
    <!-- Priority -->
    <span class="inline-flex justify-center"><PriorityMarker :priority="t.priority" /></span>
    <!-- Assignee -->
    <span class="inline-flex justify-center">
      <Tooltip v-if="t.assignee && t.assignee !== state.me" :text="personName(t.assignee)">
        <Avatar size="sm" :label="personName(t.assignee)" />
      </Tooltip>
      <span v-else-if="!t.assignee" class="lucide-circle-dashed size-5 text-ink-gray-4" aria-label="Unassigned" />
    </span>
  </div>
</template>
