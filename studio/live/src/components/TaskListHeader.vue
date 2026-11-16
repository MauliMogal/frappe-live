<script setup lang="ts">
import { computed, inject } from 'vue'
import { Checkbox } from 'frappe-ui'
import { useListShape } from '../lib/listShape'

// The column header row, once at the top of the list.
// Table: plain small grey labels and a thin line (Frappe UI list).
// Spreadsheet: a grey bar with gridlines between columns. Column titles are words only (no icons, no "#").
// ids: the tasks it covers, for "select all". top: placed at the top of the page (pinned on scroll).
const props = withDefaults(defineProps<{ ids?: string[]; top?: boolean }>(), { ids: () => [], top: false })
const { showAssignee, sel, priorityCol, check, grid, roomy, boxed, narrow, cols, single } = useListShape()
// First column's title: "Task", or what the page says (project pages: "Milestones", the rows sit under milestone bars)
const firstLabel = inject<string>('firstColumnLabel', 'Task')
const allOn = computed(() => !!sel && props.ids.length > 0 && props.ids.every((id) => sel.ids.value.includes(id)))
const toggleAll = () => sel?.setMany(props.ids, !allOn.value)
// While a side panel is open (narrow), Assignee shortens to "Who" to fit its small column.
const labels = computed(() => {
  const n = narrow.value
  const list: any[] = [
    { label: firstLabel, icon: 'lucide-list-checks' },
    { label: 'Status', icon: 'lucide-circle-dashed' },
    priorityCol ? { label: 'Priority', icon: 'lucide-signal' } : null,
    { label: 'Due date', icon: 'lucide-calendar' },
    showAssignee ? { label: n ? 'Who' : 'Assignee', icon: 'lucide-users' } : null,
  ]
  return list.filter(Boolean) as { label: string; icon: string }[]
})
</script>

<template>
  <!-- Spreadsheet -->
  <div
    v-if="grid && (!top || single)"
    role="row"
    class="sticky top-0 z-10 hidden items-center rounded-t-5 border text-sm md:grid"
    :class="[cols, roomy ? 'h-11 border-outline-gray-1 bg-surface-base text-ink-gray-5' : 'h-8 border-outline-gray-2 bg-surface-gray-2 text-ink-gray-6 md:divide-x md:divide-outline-gray-2']"
  >
    <div role="columnheader" class="flex h-full items-center justify-center text-ink-gray-5">
      <Checkbox v-if="sel" :model-value="allOn" :disabled="!ids.length" aria-label="Select all" @update:model-value="toggleAll" />
    </div>
    <div v-for="c in labels" :key="c.icon" role="columnheader" class="flex h-full min-w-0 items-center" :class="roomy ? 'px-3' : 'px-2'">
      <span class="truncate">{{ c.label }}</span>
    </div>
    <div aria-hidden="true" class="h-full" />
  </div>

  <!-- One header (Craftboard reference): icon + label per column, lines between columns -->
  <div
    v-else-if="boxed && (!top || single)"
    role="row"
    class="sticky top-0 z-10 hidden h-10 items-center border-b border-outline-gray-1 bg-surface-base text-sm text-ink-gray-5 md:grid md:divide-x md:divide-outline-gray-1"
    :class="cols"
  >
    <div v-if="check" role="columnheader" class="flex h-full items-center justify-center">
      <Checkbox :model-value="allOn" :disabled="!ids.length" aria-label="Select all" @update:model-value="toggleAll" />
    </div>
    <div v-for="c in labels" :key="c.icon" role="columnheader" class="flex h-full min-w-0 items-center px-3">
      <span class="truncate">{{ c.label }}</span>
    </div>
    <div aria-hidden="true" class="h-full" />
  </div>

  <!-- Table -->
  <div
    v-else-if="!grid && (!top || single)"
    role="row"
    class="hidden h-9 items-center gap-x-4 border-b border-outline-gray-2 px-2 text-sm text-ink-gray-5 md:grid"
    :class="[cols, top ? 'sticky top-0 z-10 bg-surface-base' : '']"
  >
    <!-- Row-number column: no title, no select-all -->
    <div v-if="check" aria-hidden="true" />
    <div role="columnheader">{{ firstLabel }}</div>
    <div role="columnheader" class="pl-2">Status</div>
    <div v-if="priorityCol" role="columnheader">Priority</div>
    <div role="columnheader">Due date</div>
    <div v-if="showAssignee" role="columnheader">{{ narrow ? 'Who' : 'Assignee' }}</div>
    <div aria-hidden="true" />
  </div>
</template>
