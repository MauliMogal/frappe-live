<script setup lang="ts">
import { ref, computed } from 'vue'
import { TextInput, DatePicker, toast } from 'frappe-ui'
import dayjs from 'dayjs'
import { saveMilestone } from '../lib/store'
import { design } from '../lib/look'

// Planner: add a milestone right in the list, after the last one. Name, optional date, Enter.
// Same quiet style as "Add a task"; shaped to match the Task list layout.
const props = defineProps<{ pid: string }>()
const name = ref('')
const due = ref('')
function add() {
  const n = name.value.trim()
  if (!n) return
  saveMilestone(props.pid, { name: n, due: due.value || null })
  toast.success(`Milestone “${n}” added.`)
  name.value = ''
  due.value = ''
}
const shell = computed(
  () =>
    ({
      grid: 'h-8 border-x border-b border-outline-gray-2 bg-surface-gray-1 px-2',
      gridRoomy: 'h-11 border-x border-b border-outline-gray-1 bg-surface-gray-1 px-3',
      table: 'mt-4 h-10 border-b border-dashed border-outline-gray-3 px-2',
      single: 'mt-3 h-10 rounded-5 border border-dashed border-outline-gray-3 px-3',
      sheet: 'mt-5 h-10 rounded-5 border border-dashed border-outline-gray-3 px-3',
    })[design.group] || 'mt-4 h-10 px-2',
)
</script>

<template>
  <form class="group flex items-center gap-2 transition-colors hover:bg-surface-gray-1" :class="shell" @submit.prevent="add">
    <span class="lucide-flag-triangle-right size-4 shrink-0 text-ink-gray-4" aria-hidden="true" />
    <TextInput v-model="name" class="min-w-0 flex-1" variant="ghost" aria-label="Add a milestone" placeholder="Add a milestone" />
    <DatePicker v-model="due">
      <template #trigger="{ open, setOpen }">
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-4 px-1.5 py-0.5 text-sm hover:bg-surface-gray-3"
          :class="due ? 'text-ink-gray-8' : 'text-ink-gray-4'"
          aria-label="Milestone date"
          @click="setOpen(!open)"
        >
          <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ due ? dayjs(due).format('D MMM') : 'Add date' }}
        </button>
      </template>
    </DatePicker>
    <span v-if="name.trim()" class="hidden shrink-0 text-xs text-ink-gray-5 md:inline">Enter to add</span>
  </form>
</template>
