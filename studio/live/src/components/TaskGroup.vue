<script setup lang="ts">
import { ref, watch } from 'vue'
import { Badge, Button } from 'frappe-ui'
import StatusIcon from './StatusIcon.vue'
import TaskListHeader from './TaskListHeader.vue'
import { state } from '../lib/store'
import { listToggle } from '../lib/look'
import { useListShape } from '../lib/listShape'
import { showAddRow } from '../lib/addRow'
// The + on a group header only when the quick add row is turned off (Settings → Appearance):
// with the row on, the + would be a second way to do the same thing.
const showPlus = (space: string | null | undefined) => space !== undefined && !showAddRow.value

// A group of task rows. Two layouts (Variants → "Task list" in App.vue):
// - table (reference: bordered table): a rounded grey bar (chevron · marker · name · count · +),
//   then the column header row and the rows, with lines between cells.
// - sheet: each group is its own white bordered sheet; the grey header strip holds the name and the labels.
// ids: the group's task ids (for "select all"). addSpace: where the + puts a new task (undefined = no +).
const props = withDefaults(
  defineProps<{
    title: string
    count?: number
    collapsible?: boolean
    defaultOpen?: boolean
    icon?: string
    status?: string
    ids?: string[]
    addSpace?: string | null
  }>(),
  { collapsible: false, defaultOpen: true, ids: () => [], addSpace: undefined },
)
const open = ref(props.defaultOpen)
watch(() => listToggle.tick, () => (open.value = listToggle.open))
const { showAssignee, priorityCol, table, grid, roomy, boxed, single, narrow, cols } = useListShape()
function add() {
  state.ui.quickAddSpace = props.addSpace || null
  state.ui.quickAdd = true
}
</script>

<template>
  <!-- Spreadsheet: the group is a grey row inside the grid (GitHub Projects style) -->
  <section v-if="grid" role="rowgroup" :aria-label="title">
    <div
      class="flex items-center gap-1.5 border-x border-b"
      :class="roomy ? 'h-11 border-outline-gray-1 bg-surface-gray-1 px-3' : 'h-8 border-outline-gray-2 bg-surface-gray-1 px-2'"
    >
      <!-- The whole bar height is the tap area (it was only the 20px of text) -->
      <button
        type="button"
        class="flex min-w-0 items-center gap-1.5 self-stretch rounded-4 text-left"
        :aria-expanded="open"
        :aria-label="open ? `Collapse ${title}` : `Expand ${title}`"
        @click="open = !open"
      >
        <span :class="open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
        <StatusIcon v-if="status" :status="status" />
        <span class="truncate text-base-medium text-ink-gray-9">{{ title }}</span>
        <Badge v-if="count !== undefined" variant="subtle" theme="gray" :label="String(count)" />
      </button>
      <div class="ml-auto flex items-center gap-1">
        <slot name="actions" />
        <Button v-if="showPlus(addSpace)" variant="ghost" size="sm" icon="lucide-plus" :aria-label="`Add a task to ${title}`" tooltip="Add task" @click="add" />
      </div>
    </div>
    <div v-if="open"><slot /></div>
  </section>

  <!-- One header: a rounded grey bar per group (chevron · name · count badge · +), rows below -->
  <section v-else-if="boxed" class="mt-3" role="rowgroup" :aria-label="title">
    <div class="flex h-10 items-center gap-2 rounded-5 bg-surface-gray-1 pl-2 pr-1.5">
      <button
        type="button"
        class="inline-flex size-6 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-3"
        :aria-expanded="open"
        :aria-label="open ? `Collapse ${title}` : `Expand ${title}`"
        @click="open = !open"
      >
        <span :class="open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4" aria-hidden="true" />
      </button>
      <StatusIcon v-if="status" :status="status" />
      <span class="truncate text-base-medium text-ink-gray-9">{{ title }}</span>
      <Badge v-if="count !== undefined" variant="subtle" theme="gray" :label="String(count)" />
      <div class="ml-auto flex items-center gap-1">
        <slot name="actions" />
        <Button v-if="showPlus(addSpace)" variant="ghost" size="sm" icon="lucide-plus" :aria-label="`Add a task to ${title}`" tooltip="Add task" @click="add" />
      </div>
    </div>
    <Transition name="expand">
      <div v-if="open" class="mt-1"><slot /></div>
    </Transition>
  </section>

  <!-- Table -->
  <section v-else-if="table" class="mt-4 first:mt-1" role="rowgroup" :aria-label="title">
    <!-- Group header (reference: Frappe UI list): filled arrow · name · count, a thin line under it -->
    <!-- Highlighted like Frappe UI list group headers: a soft grey bar (surface-gray-2), rounded, no line -->
    <div class="group/gh flex h-9 items-center gap-2 rounded-4 bg-surface-gray-2 px-2">
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 self-stretch rounded-4 text-left"
        :aria-expanded="open"
        :aria-label="open ? `Collapse ${title}` : `Expand ${title}`"
        @click="open = !open"
      >
        <svg viewBox="0 0 16 16" class="size-3 shrink-0 text-ink-gray-9 transition-transform" :class="open ? '' : '-rotate-90'" aria-hidden="true">
          <path d="M3 5.5h10L8 11.5z" fill="currentColor" />
        </svg>
        <StatusIcon v-if="status" :status="status" />
        <span v-else-if="icon" :class="icon" class="size-4 text-ink-gray-6" aria-hidden="true" />
        <span class="truncate text-base-medium text-ink-gray-9">{{ title }}</span>
        <span v-if="count !== undefined" class="text-sm tabular-nums text-ink-gray-5">{{ count }}</span>
      </button>
      <div class="ml-auto flex items-center gap-1">
        <slot name="actions" />
        <Button v-if="showPlus(addSpace)" variant="ghost" size="sm" icon="lucide-plus" :aria-label="`Add a task to ${title}`" tooltip="Add task" @click="add" />
      </div>
    </div>
    <Transition name="expand">
      <div v-if="open">
        <TaskListHeader v-if="!single" :ids="ids" />
        <slot />
      </div>
    </Transition>
  </section>

  <!-- Sheet -->
  <section
    v-else
    class="mt-5 overflow-hidden rounded-5 border border-outline-gray-2 bg-surface-base first:mt-4"
    role="rowgroup"
    :aria-label="title"
  >
    <div
      class="grid h-10 grid-cols-[minmax(0,1fr)] items-center gap-x-4 bg-surface-gray-1 px-3"
      :class="[cols, !collapsible || open ? 'border-b border-outline-gray-2' : '']"
    >
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class="flex min-w-0 items-center gap-1.5 rounded-4 text-base-medium text-ink-gray-9"
          :class="collapsible ? '' : 'cursor-default'"
          :aria-expanded="collapsible ? open : undefined"
          @click="collapsible && (open = !open)"
        >
          <span v-if="collapsible" :class="open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4 text-ink-gray-5" aria-hidden="true" />
          <span v-if="icon" :class="icon" class="size-4 text-ink-gray-6" aria-hidden="true" />
          <StatusIcon v-if="status" :status="status" />
          <span class="truncate">{{ title }}</span>
          <span v-if="count !== undefined" class="text-sm tabular-nums text-ink-gray-5">{{ count }}</span>
        </button>
        <div class="ml-auto flex items-center gap-2"><slot name="actions" /></div>
      </div>
      <span class="hidden pl-2 text-sm text-ink-gray-5 md:block">Status</span>
      <span v-if="priorityCol" class="hidden text-sm text-ink-gray-5 md:block">Priority</span>
      <span class="hidden text-sm text-ink-gray-5 md:block">Deadline</span>
      <span v-if="showAssignee" class="hidden text-sm text-ink-gray-5 md:block">Assignee</span>
      <span class="hidden md:block" aria-hidden="true" />
    </div>
    <Transition name="expand">
      <div v-if="!collapsible || open" class="divide-y divide-outline-gray-1"><slot /></div>
    </Transition>
  </section>
</template>
