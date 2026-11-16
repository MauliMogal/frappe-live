<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TextInput, Button, Dropdown, DatePicker, Avatar, toast } from 'frappe-ui'
import dayjs from 'dayjs'
import { state, addTask, myProjects, spaceName, personName, project, setStatus, milestoneTeam, wsPeople } from '../lib/store'
import { parseQuickAdd } from '../lib/quickAdd'
import { showAddRow, hideAddRow } from '../lib/addRow'
import { useListShape } from '../lib/listShape'
import { STATUS, PRIORITY, PRIORITY_ORDER, DEFAULT_PRIORITY } from '../lib/meta'
import { membersOf } from '../lib/files'
import StatusIcon from './StatusIcon.vue'
import PriorityIcon from './PriorityIcon.vue'

// The add row at the top of a list: a row in the same columns as the tasks, so it shows what you can fill in.
// Title in the Task column; small pickers in the others (status, priority, deadline, assignee on projects).
// Untouched pickers stay faint and use the defaults. Enter adds the task; title shortcuts still work
// (@name, #project, !1, fri) and fill the same fields. The × hides the row (Settings → Appearance brings it back).
// board: the short version at the top of the board's Todo column (title only).
const props = withDefaults(
  defineProps<{ space?: string | null; due?: string | null; board?: boolean; milestone?: string | null }>(),
  { space: null, due: null, board: false, milestone: null },
)
const route = useRoute()
const router = useRouter()
const { showAssignee, priorityCol, grid, boxed, table, check, narrow, cols, rowClass, cellClass } = useListShape()

const text = ref('')
const focused = ref(false)
// No default priority: it stays empty unless you pick one.
const blank = () => ({ status: 'todo', priority: null as string | null, due: props.due || '', assignee: state.me as string | null })
const f = ref(blank())
const touched = ref<Record<string, boolean>>({})
const spaces = computed(() => [
  { id: 'general', name: 'General', code: 'general' },
  ...myProjects.value.map((p) => ({ id: p.id, name: p.name, code: p.code })),
])
const space = computed(() => props.space || 'general')

const statusOptions = computed(() =>
  ['backlog', 'todo', 'progress'].map((s) => ({
    label: STATUS[s].label,
    status: s,
    onClick: () => ((f.value.status = s), (touched.value.status = true)),
  })),
)
const priorityOptions = computed(() =>
  PRIORITY_ORDER.map((p) => ({
    label: PRIORITY[p].label, // the badge before it already says P1…P5
    priority: p,
    onClick: () => ((f.value.priority = p), (touched.value.priority = true)),
  })),
)
const assigneeOptions = computed(() => [
  ...membersOf(space.value, wsPeople.value, project).map((id: string) => ({
    label: id === state.me ? `${personName(id)} (you)` : personName(id),
    person: id,
    onClick: () => ((f.value.assignee = id), (touched.value.assignee = true)),
  })),
  ...(space.value !== 'general'
    ? [{ label: 'Unassigned', icon: 'lucide-circle-dashed', onClick: () => ((f.value.assignee = null), (touched.value.assignee = true)) }]
    : []),
])
const dueModel = computed({
  get: () => f.value.due,
  set: (v: string) => ((f.value.due = v || ''), (touched.value.due = true)),
})

function add() {
  const raw = text.value.trim()
  if (!raw) return
  const p = parseQuickAdd(raw, wsPeople.value, spaces.value)
  const sp = p.space || space.value
  const t = addTask({
    title: p.title || raw,
    space: sp,
    // In a milestone with a team, the team does it (no single assignee)
    assignee: team.value.length ? null : p.assignee || f.value.assignee,
    due: p.due || f.value.due || null,
    priority: p.priority || f.value.priority || null,
    milestone: sp === props.space ? props.milestone : null,
  })
  if (f.value.status !== 'todo' && (t.assignee === state.me || (team.value.length && canSetStatus.value))) setStatus(t.id, f.value.status)
  text.value = ''
  f.value = blank()
  touched.value = {}
  toast.success(`Added to ${spaceName(t.space)}.`, {
    action: { label: 'Open', onClick: () => router.push({ query: { ...route.query, task: t.id } }) },
  })
}

// Project milestones use the same row as My tasks (decided; the compact grey bar was removed).
// The milestone's team does its tasks. Status can be set only if that's you (or there's no team: then it's yours).
const team = computed(() => (space.value !== 'general' && props.milestone ? milestoneTeam(space.value, props.milestone) : []))
const canSetStatus = computed(() => !team.value.length || team.value.includes(state.me))

const active = computed(() => focused.value || !!text.value)
const faint = (k: string) => (touched.value[k] ? 'text-ink-gray-8' : 'text-ink-gray-4')
const boardShell = computed(() => (active.value ? 'rounded-4 bg-surface-base px-2 shadow-sm' : 'rounded-4 px-2 hover:bg-surface-gray-2'))
</script>

<template>
  <template v-if="showAddRow">
    <!-- Board: title only -->
    <form v-if="board" class="group flex min-h-10 items-center gap-1 py-1 transition-colors" :class="boardShell" @submit.prevent="add">
      <span class="lucide-plus size-4 shrink-0 text-ink-gray-4" aria-hidden="true" />
      <TextInput v-model="text" class="flex-1" variant="ghost" aria-label="Add a task" placeholder="Add a task" @focus="focused = true" @blur="focused = false" @keydown.esc="text = ''" />
    </form>

    <!-- List: a row in the same columns as the tasks -->
    <form
      v-else
      role="row"
      class="group grid grid-cols-[minmax(0,1fr)_auto] items-center transition-colors hover:bg-surface-gray-1"
      :class="[cols, rowClass]"
      @submit.prevent="add"
    >
      <!-- Number / checkbox column -->
      <div v-if="grid || check" class="hidden h-full items-center justify-center md:flex">
        <span class="lucide-plus size-3.5 text-ink-gray-4" aria-hidden="true" />
      </div>

      <!-- Task: (priority on projects) + title -->
      <div class="flex min-w-0 items-center gap-1.5" :class="cellClass">
        <span v-if="!grid && !check" class="lucide-plus size-4 shrink-0 text-ink-gray-4" aria-hidden="true" />
        <Dropdown v-if="!priorityCol" :options="priorityOptions">
          <button type="button" class="inline-flex shrink-0 items-center rounded-4 hover:opacity-80" aria-label="Priority">
            <PriorityIcon v-if="f.priority" :priority="f.priority" />
            <span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
          </button>
          <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
        </Dropdown>
        <!-- On My tasks the title starts the row, so pull the input's own padding back: its text lines up
             with the column title and the task titles below -->
        <TextInput
          v-model="text"
          class="min-w-0 flex-1"
          :class="priorityCol && (grid || check) ? '-ml-2' : ''"
          variant="ghost"
          aria-label="Add a task"
          :placeholder="active ? 'Task name · Enter to add' : 'Add a task'"
          @focus="focused = true"
          @blur="focused = false"
          @keydown.esc="text = ''"
        />
      </div>

      <!-- Status -->
      <div class="hidden min-w-0 items-center md:flex" :class="grid ? 'h-full px-0.5' : boxed ? 'h-full px-1.5' : ''">
        <!-- In a milestone whose team isn't you, it starts as Todo for them (no picker) -->
        <span v-if="!canSetStatus" class="inline-flex items-center gap-1.5 px-2 text-base text-ink-gray-4"><span class="opacity-50"><StatusIcon status="todo" /></span>Todo</span>
        <Dropdown v-else :options="statusOptions">
          <Button variant="ghost" size="sm" aria-label="Status">
            <template #prefix><span :class="touched.status ? '' : 'opacity-50'"><StatusIcon :status="f.status" /></span></template>
            <span :class="faint('status')">{{ STATUS[f.status].label }}</span>
          </Button>
          <template #item-prefix="{ item }"><StatusIcon v-if="item?.status" :status="item.status" /></template>
        </Dropdown>
      </div>

      <!-- Progress (projects: nothing yet) or Priority (Home). Hidden while a side panel is open. -->
      <div v-if="priorityCol" class="hidden min-w-0 items-center md:flex" :class="cellClass">
        <Dropdown :options="priorityOptions">
          <button type="button" class="inline-flex items-center gap-1 rounded-4 px-1 py-0.5 text-sm text-ink-gray-4 hover:bg-surface-gray-3" aria-label="Priority">
            <PriorityIcon v-if="f.priority" :priority="f.priority" />
            <template v-else><span class="lucide-signal size-3.5" aria-hidden="true" />Set</template>
          </button>
          <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
        </Dropdown>
      </div>

      <!-- Deadline -->
      <div class="hidden min-w-0 items-center md:flex" :class="cellClass">
        <DatePicker v-model="dueModel">
          <template #trigger="{ open, setOpen }">
            <button type="button" class="inline-flex items-center gap-1.5 rounded-4 px-1 py-0.5 text-sm hover:bg-surface-gray-3" :class="faint('due')" aria-label="Due date" @click="setOpen(!open)">
              <span class="lucide-calendar size-3.5" aria-hidden="true" />
              {{ f.due ? dayjs(f.due).format('D MMM') : 'Add date' }}
            </button>
          </template>
        </DatePicker>
      </div>

      <!-- Assignee (projects) -->
      <div v-if="showAssignee" class="flex min-w-0 items-center" :class="cellClass">
        <Dropdown :options="assigneeOptions">
          <button type="button" class="inline-flex min-w-0 items-center gap-2 rounded-4 px-1 py-0.5 hover:bg-surface-gray-3" aria-label="Assignee">
            <template v-if="f.assignee">
              <Avatar size="sm" :label="personName(f.assignee)" :class="touched.assignee ? '' : 'opacity-50'" />
              <span v-if="!narrow" class="hidden truncate text-base md:inline" :class="faint('assignee')">{{ f.assignee === state.me ? 'You' : personName(f.assignee) }}</span>
            </template>
            <template v-else>
              <span class="lucide-circle-dashed size-5 text-ink-gray-4" aria-hidden="true" />
              <span v-if="!narrow" class="hidden text-base text-ink-gray-5 md:inline">Open</span>
            </template>
          </button>
          <template #item-prefix="{ item }">
            <Avatar v-if="item?.person" size="xs" :label="personName(item.person)" />
            <span v-else-if="item?.icon" :class="item.icon" class="size-4" aria-hidden="true" />
          </template>
        </Dropdown>
      </div>

      <!-- Hide the row (where ⋯ sits on task rows) -->
      <div class="hidden items-center justify-center md:flex md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" :class="grid || boxed ? 'h-full' : ''">
        <Button variant="ghost" size="sm" icon="lucide-x" aria-label="Hide the add row" tooltip="Hide this row" @mousedown.prevent @click="hideAddRow" />
      </div>
    </form>
  </template>
</template>
