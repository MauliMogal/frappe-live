<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Checkbox, Dropdown, Button, Progress, Tooltip, TextInput, DatePicker, toast } from 'frappe-ui'
import { design } from '../lib/look'
import { membersOf } from '../lib/files'
import dayjs from 'dayjs'
import StatusControl from './StatusControl.vue'
import StatusIcon from './StatusIcon.vue'
import PriorityMarker from './PriorityMarker.vue'
import DueLabel from './DueLabel.vue'
import {
  state,
  project,
  deleteTask,
  personName,
  spaceName,
  canTickSubtask,
  toggleChecklistItem,
  slipText,
  addSubtask,
  makeSubtask,
  subtaskToTask,
} from '../lib/store'
import { wsPeople } from '../lib/store'
import { placeCell } from '../lib/place'
import { can } from '../lib/permissions'
import { isOverdue, dueInfo } from '../lib/dates'
import { useListShape } from '../lib/listShape'

// One task in a list, one line:
// [☐] · Title (priority badge, project on Home) · Status · Progress or Priority · Deadline · Assignee · ⋯
// Tasks with subtasks get a chevron: open it to see the subtasks as rows underneath.
// Columns come from useListShape(), so rows always line up with the header row.
const props = withDefaults(
  defineProps<{ task: any; showSpace?: boolean; selectable?: boolean; selected?: boolean; index?: number }>(),
  { showSpace: true, selectable: false, selected: false, index: undefined },
)
const emit = defineEmits<{ (e: 'toggle-select', id: string): void }>()

const route = useRoute()
const router = useRouter()
const { showAssignee, sel, priorityCol, table, grid, boxed, check, narrow, cols, rowClass, cellClass } = useListShape()
const t = computed(() => props.task)
const isSelected = computed(() => (sel ? sel.ids.value.includes(t.value.id) : props.selected))
const active = computed(() => route.query.task === t.value.id || isSelected.value)
const closed = computed(() => t.value.status === 'done')
const subDone = computed(() => t.value.checklist.filter((c: any) => c.done).length)
const pct = computed(() => (t.value.checklist.length ? Math.round((subDone.value / t.value.checklist.length) * 100) : 0))
const late = computed(() => isOverdue(t.value))
const expanded = ref(false)

// Planner (Variants → "Adding in projects"): add subtasks from the row, move between levels.
const planner = computed(() => design.projAdd === 'planner' && t.value.space !== 'general')
const canAddSub = computed(() => planner.value && can.edit(t.value) && t.value.status !== 'done')
const addingSub = ref(false)
const subText = ref('')
const subWho = ref<string | null>(null)
const subDue = ref('')
const subInput = ref<any>(null)
function startSubtask() {
  expanded.value = true
  addingSub.value = true
  nextTick(() => subInput.value?.$el?.querySelector?.('input')?.focus())
}
function saveSubtask() {
  const v = subText.value.trim()
  if (!v) return
  addSubtask(t.value.id, v, { assignee: subWho.value, due: subDue.value || null })
  subText.value = ''
  subDue.value = ''
}
function stopSubtask() {
  addingSub.value = false
  subText.value = ''
  subWho.value = null
  subDue.value = ''
}
const subPeople = computed(() =>
  membersOf(t.value.space, wsPeople.value, project).map((id: string) => ({
    label: id === state.me ? `${personName(id)} (you)` : personName(id),
    person: id,
    onClick: () => (subWho.value = id),
  })),
)
function promote(c: any) {
  const nt = subtaskToTask(t.value.id, c.id)
  if (nt) toast.success(`“${nt.title}” is now a task.`)
}

function toggleSelect() {
  if (sel) sel.toggle(t.value.id)
  else emit('toggle-select', t.value.id)
}
function open() {
  if (props.selectable && state.ui.selecting && !check.value) return toggleSelect()
  router.push({ query: { ...route.query, task: t.value.id } })
}

const actions = computed(() => {
  const task = t.value
  const o: any[] = [{ label: 'Open', icon: 'lucide-panel-right-open', onClick: open }]
  if (can.suggest(task))
    o.push({
      label: 'Suggest a change',
      icon: 'lucide-message-circle-question',
      onClick: () => {
        open()
        state.ui.suggestTask = task.id
      },
    })
  o.push({
    label: 'Copy link',
    icon: 'lucide-link',
    onClick: () => {
      navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/?task=${task.id}`)
      toast.success('Link copied.')
    },
  })
  if (planner.value && can.edit(task)) {
    if (task.status !== 'done') o.push({ label: 'Add a subtask', icon: 'lucide-list-plus', onClick: startSubtask })
    const others = state.tasks.filter((x) => x.space === task.space && x.id !== task.id && !x.deletedAt && x.status !== 'done')
    if (others.length)
      o.push({
        label: 'Make it a subtask of…',
        icon: 'lucide-corner-down-right',
        submenu: others.map((x) => ({
          label: x.title,
          onClick: () => {
            makeSubtask(task.id, x.id)
            toast.success(`“${task.title}” is now a subtask of “${x.title}”.`)
          },
        })),
      })
  }
  if (can.remove(task))
    o.push({
      label: 'Delete',
      icon: 'lucide-trash-2',
      theme: 'red',
      onClick: () => {
        deleteTask(task.id)
        toast.success('Task deleted. You can restore it from Deleted tasks for 30 days.')
      },
    })
  return o
})
</script>

<template>
  <div
    role="row"
    tabindex="0"
    class="group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center outline-none transition-colors duration-150 focus-visible:bg-surface-gray-2"
    :class="[cols, rowClass, active ? 'bg-surface-gray-2' : 'hover:bg-surface-gray-1']"
    :aria-label="t.title"
    @click="open"
    @keydown.enter.self="open"
  >
    <!-- Spreadsheet: row number; on pages with bulk actions it turns into a checkbox on hover (or when picked) -->
    <div v-if="grid" role="cell" class="group/num hidden h-full items-center justify-center text-xs tabular-nums text-ink-gray-4 md:flex" @click.stop>
      <template v-if="sel">
        <span :class="isSelected ? 'hidden' : 'group-hover/num:hidden'">{{ index }}</span>
        <span :class="isSelected ? 'inline-flex' : 'hidden group-hover/num:inline-flex'">
          <Checkbox :model-value="isSelected" :aria-label="`Select ${t.title}`" @update:model-value="toggleSelect" />
        </span>
      </template>
      <span v-else>{{ index }}</span>
    </div>

    <!-- List layout: the row number (no select checkbox) -->
    <div v-if="check" role="cell" class="hidden items-center text-xs tabular-nums text-ink-gray-4 md:flex" :class="boxed ? 'h-full justify-center' : ''">
      {{ index }}
    </div>

    <!-- Title -->
    <div role="cell" class="flex min-w-0 items-center gap-2" :class="cellClass">
      <span v-if="!check && selectable && state.ui.selecting" class="inline-flex" @click.stop>
        <Checkbox :model-value="isSelected" :aria-label="`Select ${t.title}`" @update:model-value="toggleSelect" />
      </span>
      <!-- Mobile has no Status column: the status icon sits in front -->
      <span class="md:hidden"><StatusControl :task="t" /></span>
      <PriorityMarker v-if="!priorityCol" :priority="t.priority" />
      <span class="truncate text-base" :class="closed ? 'text-ink-gray-4' : 'text-ink-gray-9'">{{ t.title }}</span>
      <!-- Subtasks toggle sits after the title, so every title starts at the same place -->
      <button
        v-if="t.checklist.length"
        type="button"
        class="inline-flex shrink-0 items-center gap-0.5 rounded-4 px-1 text-xs tabular-nums text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-9"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Hide subtasks' : `Show ${t.checklist.length} subtasks`"
        @click.stop="expanded = !expanded"
      >
        <span class="lucide-list-checks size-3.5" aria-hidden="true" />{{ subDone }}/{{ t.checklist.length }}
        <span :class="expanded ? 'lucide-chevron-up' : 'lucide-chevron-down'" class="size-3" aria-hidden="true" />
      </button>
      <span v-if="showSpace" class="hidden shrink-0 text-sm text-ink-gray-5 sm:inline">{{ placeCell(t).text }}</span>
      <!-- Planner: add a subtask from the row (end of the cell, shows on hover) -->
      <button
        v-if="canAddSub"
        type="button"
        class="ml-auto hidden shrink-0 items-center gap-0.5 rounded-4 px-1 text-xs text-ink-gray-5 opacity-0 hover:bg-surface-gray-3 hover:text-ink-gray-9 focus:opacity-100 group-hover:opacity-100 md:inline-flex"
        aria-label="Add a subtask"
        @click.stop="startSubtask"
      >
        <span class="lucide-plus size-3" aria-hidden="true" />Subtask
      </button>
    </div>

    <!-- Status -->
    <div role="cell" class="hidden min-w-0 items-center md:flex" :class="grid ? 'h-full px-0.5' : boxed ? 'h-full px-1.5' : ''">
      <StatusControl :task="t" cell />
    </div>

    <!-- Priority column on Home only. Project lists have no Progress column: the subtask count by the title says it. -->
    <div v-if="priorityCol" role="cell" class="hidden min-w-0 items-center gap-2.5 md:flex" :class="cellClass">
      <PriorityMarker :priority="t.priority" />
    </div>

    <!-- Deadline: overdue gets an alert icon -->
    <div role="cell" class="hidden min-w-0 items-center gap-1.5 md:flex" :class="cellClass">
      <template v-if="late">
        <span class="lucide-circle-alert size-3.5 shrink-0 text-ink-red-5" aria-hidden="true" />
        <span class="whitespace-nowrap text-sm text-ink-red-5" :title="dueInfo(t.due, t.status)?.text">{{ dayjs(t.due).format('D MMM') }}</span>
      </template>
      <DueLabel v-else-if="t.due" :due="t.due" :status="t.status" />
      <span v-else class="text-sm text-ink-gray-4" aria-label="No deadline">─</span>
      <!-- (No date-slip counter: removed everywhere, Round 232) -->
    </div>

    <!-- Assignee (not on Home: General tasks are yours) -->
    <div v-if="showAssignee" role="cell" class="flex min-w-0 items-center gap-2" :class="cellClass">
      <template v-if="t.assignee">
        <Avatar size="sm" :label="personName(t.assignee)" />
        <span v-if="!narrow" class="hidden truncate text-base text-ink-gray-8 md:inline">{{ t.assignee === state.me ? 'You' : personName(t.assignee) }}</span>
      </template>
      <template v-else>
        <span class="lucide-circle-dashed size-5 shrink-0 text-ink-gray-4" aria-hidden="true" />
        <span v-if="!narrow" class="hidden text-base text-ink-gray-5 md:inline">Open</span>
      </template>
    </div>

    <!-- Actions -->
    <div
      role="cell"
      class="hidden items-center justify-center md:flex md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      :class="grid || boxed ? 'h-full' : ''"
      @click.stop
    >
      <Dropdown :options="actions" align="end">
        <Button variant="ghost" size="sm" icon="lucide-ellipsis" :aria-label="`More actions for ${t.title}`" />
      </Dropdown>
    </div>
  </div>

  <!-- Subtasks, one level down, in the same columns -->
  <template v-if="expanded">
    <div
      v-for="c in t.checklist"
      :key="c.id"
      role="row"
      class="grid grid-cols-[minmax(0,1fr)_auto] items-center bg-surface-gray-1"
      :class="[cols, rowClass]"
    >
      <div v-if="check || grid" role="cell" class="hidden h-full md:block" />
      <div role="cell" class="flex min-w-0 items-center gap-2" :class="grid ? 'h-full pl-6 pr-2' : boxed ? 'h-full pl-9 pr-3' : 'pl-6'">
        <Checkbox :model-value="c.done" :disabled="!canTickSubtask(t, c)" :aria-label="c.text" @update:model-value="toggleChecklistItem(t.id, c.id)" />
        <span class="truncate text-base" :class="c.done ? 'text-ink-gray-4' : 'text-ink-gray-8'">{{ c.text }}</span>
      </div>
      <div role="cell" class="hidden h-full items-center gap-1.5 px-2 md:flex">
        <StatusIcon :status="c.done ? 'done' : 'todo'" />
        <span class="text-base text-ink-gray-7">{{ c.done ? 'Done' : 'Todo' }}</span>
      </div>
      <div v-if="priorityCol" role="cell" class="hidden items-center text-sm text-ink-gray-4 md:flex" :class="cellClass">─</div>
      <!-- Subtask deadline (optional) -->
      <div role="cell" class="hidden items-center text-sm md:flex" :class="cellClass">
        <DueLabel v-if="c.due" :due="c.due" :status="c.done ? 'done' : 'todo'" />
        <span v-else class="text-ink-gray-4">─</span>
      </div>
      <div v-if="showAssignee" role="cell" class="flex min-w-0 items-center gap-2" :class="cellClass">
        <template v-if="c.assignee || t.assignee">
          <Avatar size="sm" :label="personName(c.assignee || t.assignee)" />
          <span v-if="!narrow" class="hidden truncate text-base text-ink-gray-8 md:inline">{{ (c.assignee || t.assignee) === state.me ? 'You' : personName(c.assignee || t.assignee) }}</span>
        </template>
      </div>
      <!-- Planner: turn this subtask into a task -->
      <div role="cell" class="hidden h-full items-center justify-center md:flex">
        <Button
          v-if="canAddSub && c.source !== 'review'"
          variant="ghost"
          size="sm"
          icon="lucide-arrow-up-from-line"
          tooltip="Turn into a task"
          :aria-label="`Turn ${c.text} into a task`"
          @click="promote(c)"
        />
      </div>
    </div>

    <!-- Planner: add a subtask row (name · optional date · person) -->
    <form
      v-if="canAddSub && addingSub"
      role="row"
      class="grid grid-cols-[minmax(0,1fr)_auto] items-center bg-surface-gray-1"
      :class="[cols, rowClass]"
      @submit.prevent="saveSubtask"
    >
      <div v-if="check || grid" role="cell" class="hidden h-full md:block" />
      <div role="cell" class="flex min-w-0 items-center gap-1" :class="grid ? 'h-full pl-5 pr-2' : boxed ? 'h-full pl-8 pr-3' : 'pl-5'">
        <span class="lucide-plus size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
        <TextInput
          ref="subInput"
          v-model="subText"
          class="min-w-0 flex-1"
          variant="ghost"
          aria-label="Add a subtask"
          placeholder="Add a subtask · Enter"
          @keydown.esc="stopSubtask"
        />
      </div>
      <div role="cell" class="hidden md:block" />
      <div v-if="priorityCol" role="cell" class="hidden md:block" />
      <div role="cell" class="hidden items-center md:flex" :class="cellClass">
        <DatePicker v-model="subDue">
          <template #trigger="{ open: isOpen, setOpen }">
            <button type="button" class="inline-flex items-center gap-1.5 rounded-4 px-1 py-0.5 text-sm hover:bg-surface-gray-3" :class="subDue ? 'text-ink-gray-8' : 'text-ink-gray-4'" aria-label="Subtask date" @click="setOpen(!isOpen)">
              <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ subDue ? dayjs(subDue).format('D MMM') : 'Date' }}
            </button>
          </template>
        </DatePicker>
      </div>
      <div v-if="showAssignee" role="cell" class="flex min-w-0 items-center" :class="cellClass">
        <Dropdown :options="subPeople">
          <button type="button" class="inline-flex min-w-0 items-center gap-2 rounded-4 px-1 py-0.5 hover:bg-surface-gray-3" aria-label="Subtask person">
            <template v-if="subWho">
              <Avatar size="sm" :label="personName(subWho)" />
              <span v-if="!narrow" class="hidden truncate text-base text-ink-gray-8 md:inline">{{ subWho === state.me ? 'You' : personName(subWho) }}</span>
            </template>
            <span v-else class="inline-flex items-center gap-1.5 text-sm text-ink-gray-4"><span class="lucide-user-plus size-4" aria-hidden="true" />Person</span>
          </button>
          <template #item-prefix="{ item }"><Avatar v-if="item?.person" size="xs" :label="personName(item.person)" /></template>
        </Dropdown>
      </div>
      <div role="cell" class="hidden h-full items-center justify-center md:flex">
        <Button variant="ghost" size="sm" icon="lucide-x" aria-label="Stop adding subtasks" tooltip="Done" @click="stopSubtask" />
      </div>
    </form>
  </template>
</template>
