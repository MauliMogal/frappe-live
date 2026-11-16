<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Avatar, Badge, Button, Dropdown, Progress, Tooltip, toast } from 'frappe-ui'
import { state, milestoneStats, milestoneTeam, setMilestonePeople, project, personName, isMember, deleteMilestone, isSolo } from '../lib/store'
import MilestoneTitle from './MilestoneTitle.vue'
import MilestoneDue from './MilestoneDue.vue'
import { can } from '../lib/permissions'
import { dueInfo } from '../lib/dates'
import dayjs from 'dayjs'
import { listToggle, design } from '../lib/look'
import { useListShape } from '../lib/listShape'
import TaskRow from './TaskRow.vue'
import TaskListHeader from './TaskListHeader.vue'
import InlineAddRow from './InlineAddRow.vue'
import PeopleStack from './PeopleStack.vue'
import PeoplePick from './PeoplePick.vue'
import { showAddRow } from '../lib/addRow'

// One milestone and its tasks (milestone → task → subtask).
// Table: a rounded grey bar (chevron · flag · name · date · progress · edit · +; no task count), then the
// column header row and the task rows. Sheet: its own bordered sheet with the labels in the header strip.
// m = null is the "No milestone" bucket.
const props = defineProps<{ pid: string; m: any | null; tasks: any[]; archived?: boolean }>()
const open = ref(true)
watch(() => listToggle.tick, () => (open.value = listToggle.open))
const stats = computed(() => milestoneStats(props.pid, props.m?.id || null))
const finished = computed(() => !!stats.value.total && stats.value.done === stats.value.total)
const due = computed(() => (props.m?.due ? dueInfo(props.m.due, finished.value ? 'done' : 'todo') : null))
// The bar shows the date itself ("2 Nov"), not a weekday ("Sun"); the year only when it isn't this year
const dueDate = computed(() => (props.m?.due ? dayjs(props.m.due).format(dayjs(props.m.due).year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY') : ''))
const editable = computed(() => !!props.m && can.manageMilestones(props.pid, props.m) && !props.archived)
const edit = () => (state.ui.milestone = { pid: props.pid, id: props.m.id })
// Variants → "Milestone bar": edit = the pencil opens the milestone panel | inline = change the name, the date and who it's
// assigned to right on the bar (no panel, no pencil, no ⋯).
const inline = computed(() => design.msBar === 'inline' && editable.value)
const ids = computed(() => props.tasks.map((t) => t.id))
// The milestone's team: everyone on it works on its tasks. Tick people in the menu to add or remove them.
const team = computed(() => (props.m ? milestoneTeam(props.pid, props.m.id) : []))
// Personal project: no team to show or assign
const solo = computed(() => isSolo(props.pid))
// Picked in the same card as the People pop-ups (PeoplePick.vue)
const projectPeople = computed(() => (project(props.pid)?.members || []).map((x: any) => x.user))
const teamModel = computed({ get: () => team.value, set: (v: string[]) => setMilestonePeople(props.pid, props.m.id, v) })
// (No Join / Leave on the bar: removed. Whoever manages the milestone sets its team from the avatars.)
const { showAssignee, table, grid, roomy, boxed, single, narrow, cols } = useListShape()
// "No tasks here yet" only when there's no add row already saying so
const emptyNote = computed(() => !props.tasks.length && (props.archived || !showAddRow.value))
// The + on the milestone bar only when the quick add row is turned off (otherwise the row already does it)
const showPlus = computed(() => !props.archived && !showAddRow.value)
function add() {
  state.ui.quickAddSpace = props.pid
  state.ui.quickAddMilestone = props.m ? props.m.id : null
  state.ui.quickAdd = true
}
</script>

<template>
  <!-- Spreadsheet: the milestone is a grey row inside the grid -->
  <section v-if="grid" role="rowgroup" :aria-label="m ? m.name : 'No milestone'">
    <!-- Same columns as the task rows (md+): name and date over Task, progress under Status, the rest on the right -->
    <div
      class="flex items-center gap-1.5 border-x border-b md:grid md:gap-0"
      :class="[cols, roomy ? 'h-11 border-outline-gray-1 bg-surface-gray-1 px-3 md:px-0' : 'h-8 border-outline-gray-2 bg-surface-gray-1 px-2 md:px-0']"
    >
      <div class="min-w-0 md:col-span-2" :class="roomy ? 'md:px-3' : 'md:px-2'">
        <MilestoneTitle :pid="pid" :m="m" :open="open" :finished="finished" :due="due" :due-date="dueDate" :inline="inline" arrow="chevron" @toggle="open = !open" />
      </div>
      <!-- Progress: in the Status column, right under the "Status" heading -->
      <div class="hidden min-w-0 items-center gap-2 md:flex" :class="roomy ? 'px-3' : 'px-2'">
        <template v-if="m && stats.total">
          <span class="min-w-0 flex-1"><Progress size="sm" :value="stats.pct" :aria-label="`${stats.done} of ${stats.total} done`" /></span>
          <span class="shrink-0 text-sm tabular-nums text-ink-gray-6">{{ stats.pct }}%</span>
        </template>
      </div>
      <!-- Due date: in the Due date column, under its heading -->
      <div class="hidden min-w-0 items-center md:flex" :class="roomy ? 'px-3' : 'px-2'">
        <MilestoneDue v-if="m && due" :pid="pid" :m="m" :finished="finished" :due="due" :due-date="dueDate" :inline="inline" />
      </div>
      <div class="ml-auto flex items-center justify-end gap-1 md:col-span-2" :class="roomy ? 'md:pr-1.5' : 'md:pr-1'">
        <!-- Team: avatars (click to change, if you manage milestones) -->
        <template v-if="m && !solo">
          <PeoplePick v-if="editable" v-model="teamModel" :people="projectPeople">
            <button type="button" class="mr-1 inline-flex items-center gap-1.5 rounded-4 px-1.5 py-1 text-sm hover:bg-surface-gray-3" :aria-label="`Assigned to, ${m.name}. Change`" :title="inline ? 'Assigned to' : undefined">
              <span v-if="team.length" class="flex -space-x-1.5">
                <Avatar v-for="u in team.slice(0, 4)" :key="u" size="xs" :label="personName(u)" class="ring-2 ring-surface-gray-1" />
              </span>
              <span v-if="team.length > 4" class="text-xs tabular-nums text-ink-gray-5">+{{ team.length - 4 }}</span>
              <span v-if="!team.length" class="inline-flex items-center gap-1 text-ink-gray-5"><span class="lucide-user-plus size-3.5" aria-hidden="true" />Assign to</span>
            </button>
          </PeoplePick>
          <span v-else-if="team.length" class="mr-1 flex"><PeopleStack :people="team" :max="4" size="xs" ring="ring-surface-gray-1" title="Assigned to" /></span>
        </template>
        <Button v-if="editable && !inline" variant="ghost" size="sm" icon="lucide-pencil" :aria-label="`Edit ${m.name}`" tooltip="Edit milestone" @click="edit" />
        <Button v-if="showPlus" variant="ghost" size="sm" icon="lucide-plus" aria-label="Add a task here" tooltip="Add task" @click="add" />
      </div>
    </div>
    <div v-if="open">
      <InlineAddRow v-if="!archived" :space="pid" :milestone="m ? m.id : null" />
      <TaskRow v-for="(t, i) in tasks" :key="t.id" :task="t" :show-space="false" :index="i + 1" />
      <p v-if="emptyNote" class="border-x border-b py-2 pl-[3.5rem] text-p-sm text-ink-gray-5" :class="roomy ? 'border-outline-gray-1' : 'border-outline-gray-2'">
        No tasks here yet.
        <button v-if="!archived" type="button" class="text-ink-gray-8 underline" @click="add">Add one</button>
      </p>
    </div>
  </section>

  <!-- One header: a rounded grey bar per milestone, rows below -->
  <section v-else-if="boxed" class="mt-3" role="rowgroup" :aria-label="m ? m.name : 'No milestone'">
    <div class="flex h-10 items-center gap-2 rounded-5 bg-surface-gray-1 pl-2 pr-1.5">
      <button type="button" class="inline-flex size-6 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-3" :aria-expanded="open" :aria-label="open ? 'Collapse' : 'Expand'" @click="open = !open">
        <span :class="open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4" aria-hidden="true" />
      </button>
      <span :class="m ? 'lucide-flag-triangle-right' : 'lucide-inbox'" class="size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
      <span class="truncate text-base-medium" :class="m ? 'text-ink-gray-9' : 'text-ink-gray-6'">{{ m ? m.name : 'No milestone' }}</span>
      <span v-if="due" class="ml-1 inline-flex shrink-0 items-center gap-1 text-sm tabular-nums" :class="due.tone === 'overdue' && !finished ? 'text-ink-red-5' : 'text-ink-gray-5'">
        <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ finished ? 'Completed' : dueDate }}
      </span>
      <div class="ml-auto flex items-center gap-1">
        <span v-if="m && stats.total" class="mr-2 hidden items-center gap-2 sm:flex">
          <span class="w-24"><Progress size="sm" :value="stats.pct" :aria-label="`${stats.done} of ${stats.total} done`" /></span>
          <span class="text-sm tabular-nums text-ink-gray-6">{{ stats.pct }}%</span>
        </span>
        <Button v-if="editable" variant="ghost" size="sm" icon="lucide-pencil" :aria-label="`Edit ${m.name}`" tooltip="Edit milestone" @click="edit" />
        <Button v-if="showPlus" variant="ghost" size="sm" icon="lucide-plus" aria-label="Add a task here" tooltip="Add task" @click="add" />
      </div>
    </div>
    <Transition name="expand">
      <div v-if="open" class="mt-1">
        <InlineAddRow v-if="!archived" :space="pid" :milestone="m ? m.id : null" />
        <TaskRow v-for="(t, i) in tasks" :key="t.id" :task="t" :show-space="false" :index="i + 1" />
        <p v-if="emptyNote" class="border-b border-outline-gray-1 px-3 py-3 text-p-sm text-ink-gray-5">
          No tasks here yet.
          <button v-if="!archived" type="button" class="text-ink-gray-8 underline" @click="add">Add one</button>
        </p>
      </div>
    </Transition>
  </section>

  <!-- Table -->
  <section v-else-if="table" class="mt-4 first:mt-1" role="rowgroup" :aria-label="m ? m.name : 'No milestone'">
    <!-- Group header, highlighted like Frappe UI list group headers (soft grey bar, surface-gray-2). Same columns as the
         rows (md+): arrow · flag · name · date over Task, progress under Status, team / edit / + on the right -->
    <div class="flex h-9 items-center gap-2 rounded-4 bg-surface-gray-2 px-2 md:grid md:gap-x-4" :class="cols">
      <div class="min-w-0 md:col-span-2">
        <MilestoneTitle :pid="pid" :m="m" :open="open" :finished="finished" :due="due" :due-date="dueDate" :inline="inline" arrow="triangle" @toggle="open = !open" />
      </div>
      <!-- Progress: in the Status column -->
      <div class="hidden min-w-0 items-center gap-2 md:flex">
        <template v-if="m && stats.total">
          <span class="min-w-0 flex-1"><Progress size="sm" :value="stats.pct" :aria-label="`${stats.done} of ${stats.total} done`" /></span>
          <span class="shrink-0 text-sm tabular-nums text-ink-gray-6">{{ stats.pct }}%</span>
        </template>
      </div>
      <!-- Due date: in the Due date column -->
      <div class="hidden min-w-0 items-center md:flex">
        <MilestoneDue v-if="m && due" :pid="pid" :m="m" :finished="finished" :due="due" :due-date="dueDate" :inline="inline" />
      </div>
      <div class="ml-auto flex items-center justify-end gap-1 md:col-span-2">
        <template v-if="m && !solo">
          <PeoplePick v-if="editable" v-model="teamModel" :people="projectPeople">
            <button type="button" class="mr-1 inline-flex items-center gap-1.5 rounded-4 px-1.5 py-0.5 text-sm hover:bg-surface-gray-3" :aria-label="`Assigned to, ${m.name}. Change`" :title="inline ? 'Assigned to' : undefined">
              <span v-if="team.length" class="flex -space-x-1.5">
                <Avatar v-for="u in team.slice(0, 4)" :key="u" size="xs" :label="personName(u)" class="ring-2 ring-surface-gray-2" />
              </span>
              <span v-if="team.length > 4" class="text-xs tabular-nums text-ink-gray-5">+{{ team.length - 4 }}</span>
              <span v-if="!team.length" class="inline-flex items-center gap-1 text-ink-gray-5"><span class="lucide-user-plus size-3.5" aria-hidden="true" />Assign to</span>
            </button>
          </PeoplePick>
          <span v-else-if="team.length" class="mr-1 flex"><PeopleStack :people="team" :max="4" size="xs" ring="ring-surface-gray-2" title="Assigned to" /></span>
        </template>
        <Button v-if="editable && !inline" variant="ghost" size="sm" icon="lucide-pencil" :aria-label="`Edit ${m.name}`" tooltip="Edit milestone" @click="edit" />
        <Button v-if="showPlus" variant="ghost" size="sm" icon="lucide-plus" aria-label="Add a task here" tooltip="Add task" @click="add" />
      </div>
    </div>
    <Transition name="expand">
      <div v-if="open">
        <TaskListHeader v-if="!single" :ids="ids" />
        <InlineAddRow v-if="!archived" :space="pid" :milestone="m ? m.id : null" />
        <TaskRow v-for="(t, i) in tasks" :key="t.id" :task="t" :show-space="false" :index="i + 1" />
        <p v-if="emptyNote" class="border-b border-outline-gray-1 px-2 py-2 text-p-sm text-ink-gray-5">
          No tasks here yet.
          <button v-if="!archived" type="button" class="text-ink-gray-8 underline" @click="add">Add one</button>
        </p>
      </div>
    </Transition>
  </section>

  <!-- Sheet -->
  <section
    v-else
    role="rowgroup"
    :aria-label="m ? m.name : 'No milestone'"
    class="mt-5 overflow-hidden rounded-5 border border-outline-gray-2 bg-surface-base first:mt-4"
  >
    <div class="grid h-10 grid-cols-[minmax(0,1fr)] items-center gap-x-4 bg-surface-gray-1 px-3" :class="[cols, open ? 'border-b border-outline-gray-2' : '']">
      <div class="flex min-w-0 items-center gap-3">
        <button type="button" class="flex min-w-0 items-center gap-1.5 rounded-4 text-left" :aria-expanded="open" @click="open = !open">
          <span :class="open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
          <span :class="m ? 'lucide-flag-triangle-right' : 'lucide-inbox'" class="size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
          <span class="truncate text-base-medium" :class="m ? 'text-ink-gray-9' : 'text-ink-gray-6'">{{ m ? m.name : 'No milestone' }}</span>
        </button>
        <span v-if="due" class="shrink-0 text-sm tabular-nums" :class="due.tone === 'overdue' ? 'text-ink-red-5' : 'text-ink-gray-5'">{{ finished ? 'Completed' : dueDate }}</span>
        <span v-if="m && stats.total" class="ml-auto flex shrink-0 items-center gap-2">
          <span class="hidden w-20 sm:block"><Progress size="sm" :value="stats.pct" :aria-label="`${stats.done} of ${stats.total} done`" /></span>
          <span class="text-sm tabular-nums text-ink-gray-5">{{ stats.done }}/{{ stats.total }}</span>
        </span>
        <span v-else-if="!m" class="ml-auto text-sm tabular-nums text-ink-gray-5">{{ tasks.length }}</span>
        <Button v-if="editable" :class="stats.total ? '' : 'ml-auto'" variant="ghost" size="sm" icon="lucide-pencil" :aria-label="`Edit ${m.name}`" tooltip="Edit milestone" @click="edit" />
      </div>
      <span class="hidden pl-2 text-sm text-ink-gray-5 md:block">Status</span>
      <span class="hidden text-sm text-ink-gray-5 md:block">Due date</span>
      <span v-if="showAssignee" class="hidden text-sm text-ink-gray-5 md:block">Assignee</span>
      <span class="hidden md:block" aria-hidden="true" />
    </div>
    <Transition name="expand">
      <div v-if="open" class="divide-y divide-outline-gray-1">
        <InlineAddRow v-if="!archived" :space="pid" :milestone="m ? m.id : null" />
        <TaskRow v-for="t in tasks" :key="t.id" :task="t" :show-space="false" />
        <p v-if="emptyNote" class="px-3 py-2.5 text-p-sm text-ink-gray-5">
          No tasks here yet.
          <button v-if="!archived" type="button" class="text-ink-gray-8 underline" @click="add">Add one</button>
        </p>
      </div>
    </Transition>
  </section>
</template>
