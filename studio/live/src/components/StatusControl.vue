<script setup lang="ts">
import { computed } from 'vue'
import { Dropdown, Button, Tooltip, toast } from 'frappe-ui'
import { useRoute, useRouter } from 'vue-router'
import { STATUS } from '../lib/meta'
import { can } from '../lib/permissions'
import { state, start, setStatus, markDone, reopen, personName, takeTask } from '../lib/store'
import StatusIcon from './StatusIcon.vue'

// The status icon. Click shows only the moves you're allowed to make.
// Four statuses only: Backlog · Todo · In Progress · Done. Done by Mark done (no review step).
// cell: the Status column of a task list. Icon + the status name, nothing else.
const props = withDefaults(defineProps<{ task: any; showLabel?: boolean; cell?: boolean }>(), { showLabel: false, cell: false })
const route = useRoute()
const router = useRouter()
const t = computed(() => props.task)
const s = computed(() => STATUS[t.value.status])

const open = () => router.push({ query: { ...route.query, task: t.value.id } })

const cellText = computed(() => ({ text: s.value.label }))
const cellClass = 'text-ink-gray-8'

const options = computed(() => {
  const task = t.value
  const o: any[] = []
  if (can.take(task))
    o.push({
      label: 'Assign to me',
      icon: 'lucide-hand',
      onClick: () => {
        takeTask(task.id)
        toast.success("It's yours. Started.")
      },
    })
  // Backlog ⇄ Todo ⇄ In Progress, for the person doing it
  if (can.work(task) && task.status !== 'backlog' && !task.changesRequested)
    o.push({ label: STATUS.backlog.label, status: 'backlog', onClick: () => setStatus(task.id, 'backlog') })
  if (can.work(task) && task.status !== 'todo' && !task.changesRequested)
    o.push({ label: STATUS.todo.label, status: 'todo', onClick: () => setStatus(task.id, 'todo') })
  if (can.start(task)) o.push({ label: STATUS.progress.label, status: 'progress', onClick: () => start(task.id) })
  if (can.markDone(task))
    o.push({
      label: 'Mark as done',
      status: 'done',
      onClick: () => {
        markDone(task.id)
        toast.success('Marked as done.')
      },
    })
  if (can.reopen(task)) o.push({ label: 'Reopen', status: 'progress', onClick: () => reopen(task.id) })
  return o
})

const why = computed(() => {
  const task = t.value
  if (task.assignee && task.assignee !== state.me)
    return `${s.value.label}. Only ${personName(task.assignee)} can change the status.`
  return s.value.label
})
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1.5" @click.stop>
    <Dropdown v-if="options.length" :options="options">
      <Button v-if="cell" variant="ghost" size="sm" :aria-label="`Status: ${cellText.text}. Change status`">
        <template #prefix><StatusIcon :status="t.status" /></template>
        <span class="truncate" :class="cellClass">{{ cellText.text }}</span>
      </Button>
      <Button
        v-else-if="showLabel"
        variant="subtle"
        :label="s.label"
        :aria-label="`Status: ${s.label}. Change status`"
      >
        <template #prefix><StatusIcon :status="t.status" /></template>
        <template #suffix><span class="lucide-chevron-down size-4 text-ink-gray-5" aria-hidden="true" /></template>
      </Button>
      <Button
        v-else
        variant="ghost"
        size="sm"
        :aria-label="`Status: ${s.label}. Change status`"
      >
        <template #icon><StatusIcon :status="t.status" /></template>
      </Button>
      <template #item-prefix="{ item }">
        <StatusIcon v-if="item?.status" :status="item.status" />
        <span v-else-if="item?.icon" :class="item.icon" class="size-4" aria-hidden="true" />
      </template>
    </Dropdown>
    <Tooltip v-else :text="why">
      <span class="inline-flex items-center gap-1.5 py-1" :class="cell ? 'h-7 max-w-full px-2' : 'px-1.5'" role="img" :aria-label="`Status: ${cell ? cellText.text : s.label}`">
        <StatusIcon :status="t.status" />
        <span v-if="cell" class="truncate text-base" :class="cellClass">{{ cellText.text }}</span>
        <span v-else-if="showLabel" class="text-base text-ink-gray-8">{{ s.label }}</span>
      </span>
    </Tooltip>
  </span>
</template>
