<script setup lang="ts">
import { computed } from 'vue'
import { Button, Dropdown, toast } from 'frappe-ui'
import { state, task, personName, setStatus, start, markDone, updateTask, reassign, deleteTask, restoreDeleted } from '../lib/store'
import { can } from '../lib/permissions'
import { STATUS, PRIORITY, PRIORITY_ORDER } from '../lib/meta'
import PriorityIcon from './PriorityIcon.vue'
import StatusIcon from './StatusIcon.vue'

// Shows only after you select tasks. Each change is applied only where you're allowed.
const props = defineProps<{ ids: string[]; members: string[] }>()
const emit = defineEmits<{ (e: 'clear'): void }>()
const tasks = computed(() => props.ids.map((id) => task(id)).filter(Boolean))

function report(done: number, skipped: number, why: string) {
  toast.success(`Updated ${done} ${done === 1 ? 'task' : 'tasks'}.${skipped ? ` ${skipped} skipped: ${why}` : ''}`)
}
function apply(fn: (t: any) => boolean, why = "you can't change them.") {
  let done = 0
  let skipped = 0
  tasks.value.forEach((t: any) => (fn(t) ? done++ : skipped++))
  report(done, skipped, why)
}
const ONLY_ASSIGNEE = 'only the person doing the work can change status.'

const statusOptions = computed(() => [
  {
    label: STATUS.backlog.label,
    status: 'backlog',
    onClick: () => apply((t) => (can.work(t) ? (setStatus(t.id, 'backlog'), true) : false), ONLY_ASSIGNEE),
  },
  {
    label: STATUS.todo.label,
    status: 'todo',
    onClick: () => apply((t) => (can.work(t) ? (setStatus(t.id, 'todo'), true) : false), ONLY_ASSIGNEE),
  },
  {
    label: STATUS.progress.label,
    status: 'progress',
    onClick: () => apply((t) => (can.start(t) ? (start(t.id), true) : false), ONLY_ASSIGNEE),
  },
  {
    label: STATUS.done.label,
    status: 'done',
    onClick: () =>
      apply((t) => (can.markDone(t) ? (markDone(t.id), true) : can.skipReview(t) ? (markDone(t.id, true), true) : false), ONLY_ASSIGNEE),
  },
])
const priorityOptions = computed(() =>
  PRIORITY_ORDER.map((p) => ({
    label: PRIORITY[p].label, // the badge before it already says P1…P5
    priority: p,
    onClick: () => apply((t) => (can.edit(t) ? (updateTask(t.id, { priority: p }), true) : false)),
  })),
)
const assigneeOptions = computed(() =>
  props.members.map((m) => ({
    label: m === state.me ? `${personName(m)} (you)` : personName(m),
    onClick: () => apply((t) => (can.assign(t) ? (t.assignee !== m && reassign(t.id, m), true) : false)),
  })),
)
// Delete: only the tasks you're allowed to remove; one Undo brings them all back (like deleting one task)
function removeAll() {
  const ok = tasks.value.filter((t: any) => can.remove(t))
  const skipped = tasks.value.length - ok.length
  if (!ok.length) {
    toast.error("You can't delete these tasks.")
    return
  }
  ok.forEach((t: any) => deleteTask(t.id))
  const ids = ok.map((t: any) => t.id)
  emit('clear')
  toast.success(`Deleted ${ok.length} ${ok.length === 1 ? 'task' : 'tasks'}.${skipped ? ` ${skipped} skipped: you can't delete them.` : ''}`, {
    duration: 8000,
    action: { label: 'Undo', onClick: () => ids.forEach((id) => restoreDeleted(id)) },
  })
}
</script>

<template>
  <div
    class="fixed inset-x-0 bottom-16 z-20 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-5 border border-outline-gray-2 bg-surface-elevation-2 p-2 shadow-lg md:bottom-6"
    role="toolbar"
    aria-label="Bulk actions"
  >
    <span class="px-2 text-base-medium text-ink-gray-8">{{ ids.length }} selected</span>
    <Dropdown :options="statusOptions">
      <Button variant="subtle" label="Status" icon-right="lucide-chevron-down" />
      <template #item-prefix="{ item }"><StatusIcon v-if="item?.status" :status="item.status" /></template>
    </Dropdown>
    <Dropdown :options="priorityOptions">
      <Button variant="subtle" label="Priority" icon-right="lucide-chevron-down" />
      <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
    </Dropdown>
    <Dropdown :options="assigneeOptions"><Button variant="subtle" label="Assignee" icon-right="lucide-chevron-down" /></Dropdown>
    <!-- Delete: red text (ghost), undoable from the toast -->
    <Button variant="ghost" theme="red" icon-left="lucide-trash-2" label="Delete" @click="removeAll" />
    <Button variant="ghost" label="Clear" @click="emit('clear')" />
  </div>
</template>
