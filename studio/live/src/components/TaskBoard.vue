<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount } from 'vue'
import { boardsShown, dockedNow } from '../lib/panelLayout'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { state, personName, start, setStatus, markDone } from '../lib/store'
import { can } from '../lib/permissions'
import { STATUS, STATUS_ORDER } from '../lib/meta'
import StatusIcon from './StatusIcon.vue'
import { design } from '../lib/look'
import BoardCard from './BoardCard.vue'

// Board (kanban). Columns per status with a quiet header (icon · name · count, + on Todo).
// Cards show only: title → priority · deadline · person (see BoardCard). No labels, counts or IDs.
// "+ Add task" only in Todo: only the assignee moves a task on, so nothing is added straight into later columns.
// Drag only makes moves you're allowed to make.
const props = withDefaults(defineProps<{ tasks: any[]; showSpace?: boolean; allowAdd?: boolean; space?: string | null }>(), {
  showSpace: false,
  allowAdd: true,
  space: null,
})
// No inline add row on the board: one "+" in the Todo header opens New task. Keeps columns calm.
// Home (General) has no assignee chip: those tasks are yours.
const showAssignee = inject('showAssignee', true)
const route = useRoute()
const router = useRouter()
// The five statuses, always in this order.
const COLS = computed(() => STATUS_ORDER)
const cols = computed(() =>
  COLS.value.map((s) => ({ key: s, label: STATUS[s].label, icon: STATUS[s].icon, tasks: props.tasks.filter((t) => t.status === s) })),
)

// Board layout (Variants → "Board layout"): cards · compact · detailed. No heavy shadows anywhere.
const layout = computed(() => design.board)
const columnClass = (key: string) => {
  const hot = over.value === key
  const pad = dockedNow.value ? 'p-1.5' : 'p-2'
  if (layout.value === 'compact') return ['overflow-hidden rounded-5 border bg-surface-base', hot ? 'border-outline-gray-5' : 'border-outline-gray-2']
  if (layout.value === 'detailed') return ['rounded-5 border bg-surface-base', pad, hot ? 'border-outline-gray-5' : 'border-outline-gray-2']
  return ['rounded-5', pad, hot ? 'bg-surface-gray-3' : 'bg-surface-gray-1']
}
const cardClass = (t: any) => {
  const on = route.query.task === t.id
  if (layout.value === 'compact') return on ? 'bg-surface-gray-2' : 'hover:bg-surface-gray-1'
  if (layout.value === 'detailed') return ['rounded-4', on ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2']
  return ['rounded-4 border bg-surface-base', on ? 'border-outline-gray-5' : 'border-outline-gray-1 hover:border-outline-gray-3']
}

// Side panels: the board shrinks to fit next to a docked panel; too narrow → the panel becomes a modal.
onMounted(() => boardsShown.value++)
onBeforeUnmount(() => boardsShown.value--)

const dragging = ref<any>(null)
const over = ref<string | null>(null)
const open = (id: string) => router.push({ query: { ...route.query, task: id } })

function addTask() {
  state.ui.quickAdd = true
}

function drop(target: string) {
  const t = dragging.value
  over.value = null
  dragging.value = null
  if (!t || t.status === target) return
  if (t.assignee && t.assignee !== state.me && (target === 'backlog' || target === 'todo' || target === 'progress' || (target === 'done' && !can.review(t) && !can.skipReview(t)))) {
    toast.info(`Only ${personName(t.assignee)} can move this.`)
    return
  }
  if (!t.assignee) {
    toast.info('Assign it first, or open it and take it.')
    return
  }
  if (target === 'progress' && can.work(t)) {
    t.status !== 'progress' ? start(t.id) : setStatus(t.id, 'progress')
    return
  }
  if ((target === 'todo' || target === 'backlog') && can.work(t)) return setStatus(t.id, target)
  if (target === 'review' && can.submit(t)) {
    open(t.id)
    state.ui.submitTask = t.id
    return
  }
  if (target === 'done' && can.markDone(t)) {
    markDone(t.id)
    toast.success('Marked done.')
    return
  }
  if (target === 'done' && t.status === 'review' && can.review(t)) {
    open(t.id)
    toast.info('Approve it from the task.')
    return
  }
  if (target === 'done' && t.reviewer && t.reviewer !== state.me) toast.info(`Only ${personName(t.reviewer)} can approve this.`)
  else if (target === 'review' && t.assignee !== state.me) toast.info(`Only ${personName(t.assignee)} can submit this.`)
  else toast.info("You can't move this task there.")
}
</script>

<template>
  <div class="-mx-3 overflow-x-auto px-3 pb-4 sm:-mx-5 sm:px-5">
    <!-- Four equal columns (Backlog · Todo · In Progress · Done) that fill the page width. Next to a docked
         panel they shrink (gap tightens); only below that does the board scroll sideways. -->
    <div class="grid grid-cols-4 items-start" :class="dockedNow ? 'min-w-[40rem] gap-2' : 'min-w-[52rem] gap-3'">
      <section
        v-for="c in cols"
        :key="c.key"
        class="group/col flex min-w-0 flex-col transition-colors"
        :class="columnClass(c.key)"
        :aria-label="c.label"
        @dragover.prevent="over = c.key"
        @dragleave="over = over === c.key ? null : over"
        @drop.prevent="drop(c.key)"
      >
        <!-- Column header: status · name · count (+ on Todo) -->
        <header
          class="flex items-center gap-2"
          :class="layout === 'compact' ? 'h-10 border-b border-outline-gray-1 px-3' : 'h-8 px-1.5'"
        >
          <StatusIcon :status="c.key" />
          <h2 class="text-base-medium text-ink-gray-8">{{ c.label }}</h2>
          <span class="text-sm tabular-nums text-ink-gray-5">{{ c.tasks.length }}</span>
          <Button
            v-if="allowAdd && c.key === 'todo'"
            class="ml-auto"
            variant="ghost"
            size="sm"
            icon="lucide-plus"
            aria-label="Add task"
            tooltip="Add task"
            @click="addTask"
          />
        </header>

        <div
          class="flex flex-col"
          :class="layout === 'compact' ? 'divide-y divide-outline-gray-1' : 'mt-1.5 min-h-24 gap-2'"
        >
          <article
            v-for="t in c.tasks"
            :key="t.id"
            draggable="true"
            tabindex="0"
            class="cursor-pointer outline-none transition-colors focus-visible:ring-1 focus-visible:ring-outline-gray-4"
            :class="[cardClass(t), dragging?.id === t.id ? 'opacity-50' : '']"
            :aria-label="t.title"
            @dragstart="dragging = t"
            @dragend="dragging = null; over = null"
            @click="open(t.id)"
            @keydown.enter="open(t.id)"
          >
            <BoardCard :task="t" :layout="layout" :show-assignee="showAssignee" :show-space="showSpace" />
          </article>

          <p v-if="!c.tasks.length" class="px-3 py-4 text-center text-sm text-ink-gray-4">No tasks</p>
        </div>
      </section>
    </div>
  </div>
</template>
