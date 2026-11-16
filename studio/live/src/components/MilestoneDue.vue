<script setup lang="ts">
import { computed } from 'vue'
import { DatePicker } from 'frappe-ui'
import { saveMilestone } from '../lib/store'

// A milestone's due date on its bar: plain text, or (inline editing) a date you click to change.
// Red when overdue, "Completed" once every task is done. Used in the Due date column (md+) and, on phones, by the name.
const props = defineProps<{ pid: string; m: any; finished: boolean; due: any; dueDate: string; inline: boolean }>()
// The due date is required: picking only moves it (moves are kept as slips)
function setDue(v: string) {
  if (v && v !== props.m.due) saveMilestone(props.pid, { id: props.m.id, name: props.m.name, due: v })
}
const tone = computed(() => (props.due?.tone === 'overdue' && !props.finished ? 'text-ink-red-5' : 'text-ink-gray-5'))
</script>

<template>
  <DatePicker v-if="inline && !finished" :model-value="m.due" @update:model-value="setDue">
    <template #trigger="{ open: isOpen, setOpen }">
      <button type="button" class="-ml-1 inline-flex shrink-0 items-center gap-1 rounded-4 px-1 py-0.5 text-sm tabular-nums hover:bg-surface-gray-3" :class="tone" :aria-label="`Due ${dueDate}. Change`" @click="setOpen(!isOpen)">
        <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ dueDate }}
      </button>
    </template>
  </DatePicker>
  <span v-else class="inline-flex shrink-0 items-center gap-1 text-sm tabular-nums" :class="tone">
    <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ finished ? 'Completed' : dueDate }}
  </span>
</template>
