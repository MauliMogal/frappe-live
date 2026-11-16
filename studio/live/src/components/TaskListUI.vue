<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, Checkbox, Dropdown, DatePicker, Tooltip, toast } from 'frappe-ui'
import { List, ListHeader, ListHeaderCell, ListGroup, ListRows, ListRow, ListCell } from 'frappe-ui/list'
import { Variants } from '../lib/variants'
import dayjs from 'dayjs'
import DesignChoice from './DesignChoice.vue'
import {
  state,
  project,
  personName,
  updateTask,
  taskPeople,
  deleteTask,
  slipText,
  canTickSubtask,
  toggleChecklistItem,
  addSubtask,
  makeSubtask,
  subtaskToTask,
  setMilestonePeople,
  milestoneTeam,
} from '../lib/store'
import { wsPeople, isSolo, spaceName } from '../lib/store'
import PeoplePick from './PeoplePick.vue'
import { placeCell } from '../lib/place'
import { can } from '../lib/permissions'
import { membersOf } from '../lib/files'
import { STATUS, PRIORITY, PRIORITY_ORDER } from '../lib/meta'
import { design } from '../lib/look'
import StatusIcon from './StatusIcon.vue'
import StatusControl from './StatusControl.vue'
import PriorityMarker from './PriorityMarker.vue'
import PriorityIcon from './PriorityIcon.vue'
import DueLabel from './DueLabel.vue'
import AssigneePicker from './AssigneePicker.vue'
import PeopleStack from './PeopleStack.vue'
import MilestoneTitle from './MilestoneTitle.vue'
import MilestoneDue from './MilestoneDue.vue'

// Task lists drawn only with Frappe UI's List (frappe-ui/list). Variants → "Task list": frappe · feed · table.
//   frappe: column header, 40px rows, Frappe UI's full-width dividers, a divider under each group label.
//   feed:   no columns: the title with one line under it (status · date · priority · subtasks).
//   table:  no column header; on projects an Assigned to column. Group headers: Variants → "Group headers".
// Everything you can do in Roomy works here too (only the look differs):
//   · Status, Priority and Due date change right in the row (only for whoever may: same rules as Roomy)
//   · the row's ⋯: Open · Request a change · Copy link · Add a subtask · Make it a subtask of… · Delete
//   · subtasks: open them under the task (the 1/3 count), tick them, add one (with a date and a person on projects),
//     turn one into a task
//   · milestone groups: rename, date and Assign to right on the label (Variants → "Milestone bar" = inline), or the
//     pencil to the milestone panel (= edit); progress; add rows with priority and date
//   · "Select" for the bulk bar on project pages; the date-moved marker
type Group = {
  key: string
  label: string
  icon?: string
  sub?: string
  subLate?: boolean
  pct?: number | null
  people?: string[]
  tasks: any[]
  collapsed?: boolean
  addInline?: (title: string, extra: { priority: string | null; due: string | null }) => void
  addDue?: string | null
  m?: any
  pid?: string
  editable?: boolean
}
// selecting: the page's Select button (it sits in the page's toolbar, with View / Filter / Sort) turns on the checkboxes
// projectColumn: My tasks in a company workspace (tasks from many projects): a Project column before Status
const props = defineProps<{ groups: Group[]; mode: 'frappe' | 'feed' | 'table'; columns: 'home' | 'project'; selecting?: boolean; projectColumn?: boolean }>()
const selection = defineModel<string[]>('selection', { default: () => [] })
// Two roots (Variants + List): pass the page's class (e.g. mt-4, the gap under the toolbar) to the List itself,
// or Vue drops it and the header sits right under the toolbar
defineOptions({ inheritAttrs: false })
const selecting = computed(() => !!props.selecting)
const route = useRoute()
const router = useRouter()

// Open task = the active row (Frappe UI List's v-model:active)
const active = computed({
  get: () => (route.query.task ? String(route.query.task) : undefined),
  set: (id) => id && router.push({ query: { ...route.query, task: id } }),
})
const openTask = (t: any) => router.push({ query: { ...route.query, task: t.id } })
const closed = reactive<Record<string, boolean>>({})
const isClosed = (g: Group) => closed[g.key] ?? !!g.collapsed
const toggle = (g: Group) => (closed[g.key] = !isClosed(g))

const tabular = computed(() => props.mode !== 'feed')
// The Project column (tabular lists only; the feed says the project in its line)
const showProject = computed(() => !!props.projectColumn && tabular.value)
// (No Assigned to column: like Roomy, people are on the milestone, shown on its group header)
const withAssigned = computed(() => false)
// Columns (the last one, 2rem, holds the row's ⋯). Phones: title · date · ⋯.
const cols = computed(() => {
  if (!tabular.value) return { base: ['minmax(0,1fr)', '2rem'] }
  if (props.columns === 'home' && showProject.value) return { base: ['minmax(0,1fr)', '7rem', '2rem'], md: ['minmax(0,1fr)', '10rem', '9rem', '7rem', '8rem', '2rem'] }
  if (props.columns === 'home') return { base: ['minmax(0,1fr)', '7rem', '2rem'], md: ['minmax(0,1fr)', '9rem', '7rem', '8rem', '2rem'] }
  return withAssigned.value
    ? { base: ['minmax(0,1fr)', '7rem', '2rem'], md: ['minmax(0,1fr)', '9rem', '8rem', '8rem', '2rem'] }
    : { base: ['minmax(0,1fr)', '7rem', '2rem'], md: ['minmax(0,1fr)', '9rem', '8rem', '2rem'] }
})
const divider = computed(() => (tabular.value ? 'full' : 'inset'))
// Milestone headers on projects (Frappe, Table; md+): the same columns as the rows, so the % done sits under Status
// and the date under Due date (not next to the name)
const { width: winW } = useWindowSize()
const alignCols = computed(() => tabular.value && props.columns === 'project' && winW.value >= 768 && !!cols.value.md)
// Same as Frappe UI's ListRow: 12px padding each side, 8px between columns
const headerGrid = computed(() => ({ display: 'grid', gridTemplateColumns: (cols.value.md || []).join(' '), alignItems: 'center', columnGap: '8px', paddingLeft: '12px', paddingRight: '12px' }))
const headerBox = (g: any) => ({
  'pr-1': gstyle.value === 'label',
  'h-8 border-b border-outline-gray-1 pr-1': gstyle.value === 'labelLine',
  'h-8 rounded-4 bg-surface-gray-2 px-2': gstyle.value === 'bar',
  'h-8 border-b border-outline-gray-2 bg-surface-base pr-1': gstyle.value === 'heading',
})
const gstyle = computed(() =>
  props.mode === 'table' ? design.tableGroup : props.mode === 'frappe' ? 'labelLine' : 'label',
)
const groupClass = computed(() =>
  gstyle.value === 'heading'
      ? 'mt-5 first:mt-1'
      : gstyle.value === 'rule'
        ? 'mt-4 first:mt-1'
        : 'mt-2 first:mt-0',
)
const closedTask = (t: any) => t.status === 'done'
const subDone = (t: any) => t.checklist.filter((c: any) => c.done).length

// ── Editing in the row (same rules as Roomy) ──
const prioMenu = (t: any) => [
  ...PRIORITY_ORDER.map((p) => ({ label: PRIORITY[p].label, priority: p, onClick: () => updateTask(t.id, { priority: p }) })),
  ...(t.priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => updateTask(t.id, { priority: null }) }] : []),
]
const setDue = (t: any, v: string) => updateTask(t.id, { due: v || null })
const team = (t: any) => (t.space !== 'general' && !t.assignee ? taskPeople(t) : [])

// ── Subtasks (open under the task, tick, add, turn into a task) ──
const open = reactive<Record<string, boolean>>({})
const planner = (t: any) => design.projAdd === 'planner' && t.space !== 'general'
const canAddSub = (t: any) => can.edit(t) && t.status !== 'done'
const adding = ref<string | null>(null)
const sub = reactive({ text: '', due: '', who: null as string | null })
function startSubtask(t: any) {
  open[t.id] = true
  adding.value = t.id
  sub.text = ''
  sub.due = ''
  sub.who = null
  nextTick(() => (document.querySelector(`[data-subadd="${t.id}"] input`) as HTMLInputElement | null)?.focus())
}
function saveSubtask(t: any) {
  const v = sub.text.trim()
  if (!v) return
  addSubtask(t.id, v, { assignee: t.space === 'general' ? null : sub.who, due: sub.due || null })
  sub.text = ''
  sub.due = ''
}
const subPeople = (t: any) =>
  membersOf(t.space, wsPeople.value, project).map((id: string) => ({ label: id === state.me ? `${personName(id)} (you)` : personName(id), person: id, onClick: () => (sub.who = id) }))
function promote(t: any, c: any) {
  const nt = subtaskToTask(t.id, c.id)
  if (nt) toast.success(`“${nt.title}” is now a task.`)
}

// ── The row's ⋯ (same as Roomy) ──
function actions(task: any) {
  const o: any[] = [{ label: 'Open', icon: 'lucide-panel-right-open', onClick: () => openTask(task) }]
  if (can.suggest(task)) o.push({ label: 'Request a change', icon: 'lucide-message-circle-question', onClick: () => (openTask(task), (state.ui.suggestTask = task.id)) })
  o.push({
    label: 'Copy link',
    icon: 'lucide-link',
    onClick: () => {
      navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/?task=${task.id}`)
      toast.success('Link copied.')
    },
  })
  if (canAddSub(task)) o.push({ label: 'Add a subtask', icon: 'lucide-list-plus', onClick: () => startSubtask(task) })
  if (planner(task) && can.edit(task)) {
    const others = state.tasks.filter((x) => x.space === task.space && x.id !== task.id && !x.deletedAt && x.status !== 'done')
    if (others.length)
      o.push({
        label: 'Make it a subtask of…',
        icon: 'lucide-corner-down-right',
        submenu: others.map((x) => ({ label: x.title, onClick: () => (makeSubtask(task.id, x.id), toast.success(`“${task.title}” is now a subtask of “${x.title}”.`)) })),
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
}

// ── Milestone groups: inline editing (or the pencil), team ──
const inlineMs = (g: Group) => !!g.m && !!g.editable && design.msBar === 'inline'
const editMs = (g: Group) => (state.ui.milestone = { pid: g.pid, id: g.m.id })
const teamOf = (g: Group) => (g.m && g.pid ? milestoneTeam(g.pid, g.m.id) : [])
// Picked in the same card as the People pop-ups (PeoplePick.vue)
const projectPeople = (g: Group) => (project(g.pid!)?.members || []).map((x: any) => x.user)
const setTeam = (g: Group, v: string[]) => setMilestonePeople(g.pid!, g.m.id, v)
const dueShort = (d: string) => dayjs(d).format(dayjs(d).year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')

// ── Add rows: title, and (like Roomy's add row) priority and date before you press Enter ──
const drafts = reactive<Record<string, { text: string; priority: string; due: string | null }>>({})
// One draft per group, made up front (not while drawing)
watch(
  () => props.groups.map((g) => g.key),
  () => props.groups.forEach((g) => (drafts[g.key] ??= { text: '', priority: '', due: g.addDue ?? null })),
  { immediate: true },
)
const draft = (g: Group) => drafts[g.key] || { text: '', priority: '', due: null }
const draftPrio = (g: Group) => [
  ...PRIORITY_ORDER.map((p) => ({ label: PRIORITY[p].label, priority: p, onClick: () => (draft(g).priority = p) })),
  ...(draft(g).priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => (draft(g).priority = '') }] : []),
]
function addIn(g: Group) {
  const d = draft(g)
  const v = d.text.trim()
  if (!v || !g.addInline) return
  g.addInline(v, { priority: d.priority || null, due: d.due || null })
  drafts[g.key] = { text: '', priority: '', due: g.addDue ?? null }
}
</script>

<template>
  <!-- Default for now: Heading (first slot) -->
  <Variants v-if="mode === 'table'" name="Group headers">
    <template #heading><DesignChoice k="tableGroup" v="heading" /></template>
    <template #label><DesignChoice k="tableGroup" v="label" /></template>
    <template #bar><DesignChoice k="tableGroup" v="bar" /></template>
    <template #rule><DesignChoice k="tableGroup" v="rule" /></template>
  </Variants>

  <List v-bind="$attrs" :columns="cols" :row-height="tabular ? 40 : undefined" :divider="divider" :selectable="selecting" v-model:selection="selection" v-model:active="active">
    <!-- Column header: Frappe -->
    <ListHeader v-if="mode === 'frappe'">
      <ListHeaderCell>{{ columns === 'project' ? 'Milestones' : 'Task' }}</ListHeaderCell>
      <ListHeaderCell v-if="showProject" class="hidden md:flex">Project</ListHeaderCell>
      <ListHeaderCell class="hidden md:flex">Status</ListHeaderCell>
      <ListHeaderCell v-if="columns === 'home'" class="hidden md:flex">Priority</ListHeaderCell>
      <ListHeaderCell>Due date</ListHeaderCell>
      <ListHeaderCell />
    </ListHeader>

    <ListGroup
      v-for="g in groups"
      :key="g.key"
      :label="g.label"
      :sticky="gstyle === 'heading'"
      :class="groupClass"
    >
      <template #label>
        <!-- Milestone, aligned to the columns: name (+ people, pencil) · % done under Status · date under Due date -->
        <div v-if="alignCols && g.m" class="w-full min-w-0" :class="headerBox(g)" :style="headerGrid">
          <div class="flex min-w-0 items-center gap-2 pr-3">
            <MilestoneTitle v-if="inlineMs(g)" :pid="g.pid!" :m="g.m" :open="!isClosed(g)" :finished="g.sub === 'Completed'" :due="null" due-date="" inline arrow="chevron" @toggle="toggle(g)" />
            <button v-else type="button" class="flex min-w-0 items-center gap-1.5 rounded-4 text-left" :aria-expanded="!isClosed(g)" @click="toggle(g)">
              <span :class="[isClosed(g) ? 'lucide-chevron-right' : 'lucide-chevron-down', gstyle === 'heading' ? 'size-4 text-ink-gray-6' : 'size-3.5']" class="shrink-0" aria-hidden="true" />
              <span v-if="g.icon" :class="g.icon" class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate font-medium text-ink-gray-8" :class="gstyle === 'heading' ? 'text-lg text-ink-gray-9' : gstyle === 'bar' ? 'text-base text-ink-gray-9' : 'text-sm'">{{ g.label }}</span>
            </button>
            <span class="ml-auto flex shrink-0 items-center gap-1 font-normal">
              <PeoplePick v-if="g.editable && !isSolo(g.pid)" :model-value="teamOf(g)" :people="projectPeople(g)" @update:model-value="setTeam(g, $event)">
                <button type="button" class="inline-flex items-center gap-1 rounded-4 px-1 py-0.5 text-xs hover:bg-surface-gray-3" :aria-label="`Assigned to, ${g.label}. Change`">
                  <span v-if="teamOf(g).length" class="flex -space-x-1">
                    <Avatar v-for="u in teamOf(g).slice(0, 3)" :key="u" size="xs" :label="personName(u)" class="ring-1" :class="gstyle === 'bar' ? 'ring-surface-gray-2' : 'ring-surface-base'" />
                  </span>
                  <span v-else class="inline-flex items-center gap-1 text-ink-gray-5"><span class="lucide-user-plus size-3.5" aria-hidden="true" />Assign to</span>
                </button>
              </PeoplePick>
              <span v-else-if="g.people?.length && !isSolo(g.pid)" class="flex -space-x-1">
                <Avatar v-for="u in g.people.slice(0, 3)" :key="u" size="xs" :label="personName(u)" class="ring-1" :class="gstyle === 'bar' ? 'ring-surface-gray-2' : 'ring-surface-base'" />
              </span>
              <Button v-if="g.editable && design.msBar === 'edit'" variant="ghost" size="sm" icon="lucide-pencil" :aria-label="`Edit ${g.label}`" tooltip="Edit milestone" @click="editMs(g)" />
            </span>
          </div>
          <!-- Status column: % done -->
          <span class="text-xs font-normal tabular-nums text-ink-gray-5">{{ g.pct != null ? `${g.pct}% done` : '' }}</span>
          <!-- Due date column: the milestone's date -->
          <span class="min-w-0 font-normal">
            <MilestoneDue v-if="g.m.due && inlineMs(g)" :pid="g.pid!" :m="g.m" :finished="g.sub === 'Completed'" :due="{ tone: g.subLate ? 'overdue' : '' }" :due-date="dueShort(g.m.due)" inline />
            <span v-else-if="g.sub" class="text-xs tabular-nums" :class="g.subLate ? 'text-ink-red-5' : 'text-ink-gray-5'">{{ g.sub }}</span>
          </span>
          <span aria-hidden="true" />
        </div>
        <div
          v-else
          class="flex w-full min-w-0 items-center gap-2"
          :class="{
            'pr-1': gstyle === 'label',
            'h-8 border-b border-outline-gray-1 pr-1': gstyle === 'labelLine',
            'h-8 rounded-4 bg-surface-gray-2 px-2': gstyle === 'bar',
            'h-8 border-b border-outline-gray-2 bg-surface-base pr-1': gstyle === 'heading',
          }"
        >
          <!-- Milestone you manage, inline: rename / date / Assign to right here -->
          <template v-if="inlineMs(g)">
            <MilestoneTitle :pid="g.pid!" :m="g.m" :open="!isClosed(g)" :finished="g.sub === 'Completed'" :due="null" due-date="" inline arrow="chevron" @toggle="toggle(g)" />
            <MilestoneDue v-if="g.m.due" :pid="g.pid!" :m="g.m" :finished="g.sub === 'Completed'" :due="{ tone: g.subLate ? 'overdue' : '' }" :due-date="dueShort(g.m.due)" inline class="font-normal" />
          </template>
          <template v-else>
            <button type="button" class="flex min-w-0 shrink-0 items-center gap-1.5 rounded-4 text-left" :aria-expanded="!isClosed(g)" @click="toggle(g)">
              <span :class="[isClosed(g) ? 'lucide-chevron-right' : 'lucide-chevron-down', gstyle === 'heading' ? 'size-4 text-ink-gray-6' : 'size-3.5']" class="shrink-0" aria-hidden="true" />
              <span v-if="g.icon" :class="g.icon" class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate font-medium text-ink-gray-8" :class="gstyle === 'heading' ? 'text-lg text-ink-gray-9' : gstyle === 'bar' ? 'text-base text-ink-gray-9' : 'text-sm'">{{ g.label }}</span>
            </button>
            <span v-if="g.sub" class="shrink-0 text-xs font-normal tabular-nums" :class="g.subLate ? 'text-ink-red-5' : 'text-ink-gray-5'">{{ g.sub }}</span>
          </template>
          <span v-if="gstyle === 'rule'" class="min-w-6 flex-1 border-t border-outline-gray-2" aria-hidden="true" />
          <span class="flex shrink-0 items-center gap-2 font-normal" :class="gstyle === 'rule' ? '' : 'ml-auto'">
            <span v-if="g.pct != null" class="hidden text-xs tabular-nums text-ink-gray-5 sm:inline">{{ g.pct }}% done</span>
            <!-- People on the milestone: change them here if you manage it (like Roomy) -->
            <PeoplePick v-if="g.m && g.editable && !isSolo(g.pid)" :model-value="teamOf(g)" :people="projectPeople(g)" @update:model-value="setTeam(g, $event)">
              <button type="button" class="inline-flex items-center gap-1 rounded-4 px-1 py-0.5 text-xs hover:bg-surface-gray-3" :aria-label="`Assigned to, ${g.label}. Change`">
                <span v-if="teamOf(g).length" class="flex -space-x-1">
                  <Avatar v-for="u in teamOf(g).slice(0, 3)" :key="u" size="xs" :label="personName(u)" class="ring-1" :class="gstyle === 'bar' ? 'ring-surface-gray-2' : 'ring-surface-base'" />
                </span>
                <span v-else class="inline-flex items-center gap-1 text-ink-gray-5"><span class="lucide-user-plus size-3.5" aria-hidden="true" />Assign to</span>
              </button>
            </PeoplePick>
            <span v-else-if="g.people?.length && !isSolo(g.pid)" class="flex -space-x-1">
              <Avatar v-for="u in g.people.slice(0, 3)" :key="u" size="xs" :label="personName(u)" class="ring-1" :class="gstyle === 'bar' ? 'ring-surface-gray-2' : 'ring-surface-base'" />
            </span>
            <!-- Edit option: the pencil opens the milestone panel -->
            <Button v-if="g.m && g.editable && design.msBar === 'edit'" variant="ghost" size="sm" icon="lucide-pencil" :aria-label="`Edit ${g.label}`" tooltip="Edit milestone" @click="editMs(g)" />
          </span>
        </div>
      </template>

      <template v-if="!isClosed(g)">
        <ListRows :items="g.tasks" v-slot="{ item: t }">
          <ListRow :value="t.id">
            <!-- Title cell (feed: with its line underneath) -->
            <ListCell :class="mode === 'feed' ? '' : 'gap-2'">
              <div class="flex min-w-0 flex-1 items-center gap-2" :class="mode === 'feed' ? 'items-start py-2.5' : ''">
                <!-- Status: the control itself in the feed and on phones (no Status column there) -->
                <span :class="mode === 'feed' ? 'mt-0.5' : 'md:hidden'" @click.stop><StatusControl :task="t" /></span>
                <!-- Projects: priority before the title (click to change, if you may) -->
                <span v-if="columns === 'project' && mode !== 'feed'" class="inline-flex" @click.stop>
                  <Dropdown v-if="can.editBrief(t)" :options="prioMenu(t)">
                    <button type="button" class="inline-flex rounded-4 hover:opacity-80" :aria-label="t.priority ? `Priority ${PRIORITY[t.priority]?.label}. Change` : 'Set priority'">
                      <PriorityMarker v-if="t.priority" :priority="t.priority" />
                      <span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
                    </button>
                    <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
                  </Dropdown>
                  <PriorityMarker v-else-if="t.priority" :priority="t.priority" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-base" :class="closedTask(t) ? 'text-ink-gray-4' : 'text-ink-gray-9'">{{ t.title }}</span>
                    <!-- My tasks in a company workspace: the project. Its own column on wider screens; here on phones and in the feed -->
                    <span v-if="columns === 'home' && t.space !== 'general'" class="shrink-0 text-sm text-ink-gray-5" :class="showProject ? 'md:hidden' : ''">{{ spaceName(t.space) }}</span>
                    <!-- Subtasks: open them under the task -->
                    <button
                      v-if="t.checklist.length"
                      type="button"
                      class="inline-flex shrink-0 items-center gap-0.5 rounded-4 px-1 text-xs tabular-nums text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-9"
                      :aria-expanded="!!open[t.id]"
                      :aria-label="open[t.id] ? 'Hide subtasks' : `Show ${t.checklist.length} subtasks`"
                      @click.stop="open[t.id] = !open[t.id]"
                    >
                      <span class="lucide-list-checks size-3.5" aria-hidden="true" />{{ subDone(t) }}/{{ t.checklist.length }}
                      <span :class="open[t.id] ? 'lucide-chevron-up' : 'lucide-chevron-down'" class="size-3" aria-hidden="true" />
                    </button>
                    <!-- + Subtask on hover (projects, Planner), like Roomy -->
                    <button
                      v-if="planner(t) && columns === 'project' && canAddSub(t) && mode !== 'feed'"
                      type="button"
                      class="ml-auto hidden shrink-0 items-center gap-0.5 rounded-4 px-1 text-xs text-ink-gray-4 hover:bg-surface-gray-3 hover:text-ink-gray-9 md:inline-flex"
                      aria-label="Add a subtask"
                      @click.stop="startSubtask(t)"
                    >
                      <span class="lucide-plus size-3" aria-hidden="true" />Subtask
                    </button>
                  </div>
                  <!-- feed: one line of details, each one changeable -->
                  <div v-if="mode === 'feed'" class="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-ink-gray-5" @click.stop>
                    <span>{{ STATUS[t.status]?.label }}</span>
                    <span aria-hidden="true">·</span>
                    <DatePicker v-if="can.editDue(t)" :model-value="t.due || ''" @update:model-value="setDue(t, $event)">
                      <template #trigger="{ open: isOpen, setOpen }">
                        <button type="button" class="rounded-4 px-1 hover:bg-surface-gray-3" :aria-label="t.due ? 'Change the date' : 'Add a date'" @click="setOpen(!isOpen)">
                          <DueLabel v-if="t.due" :due="t.due" :status="t.status" /><span v-else class="text-ink-gray-4">Add date</span>
                        </button>
                      </template>
                    </DatePicker>
                    <DueLabel v-else-if="t.due" :due="t.due" :status="t.status" />
                    <span aria-hidden="true">·</span>
                    <Dropdown v-if="can.editBrief(t)" :options="prioMenu(t)">
                      <button type="button" class="rounded-4 px-1 hover:bg-surface-gray-3" :aria-label="t.priority ? 'Change priority' : 'Set priority'">
                        <PriorityMarker v-if="t.priority" :priority="t.priority" show-label /><span v-else class="text-ink-gray-4">Priority</span>
                      </button>
                      <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
                    </Dropdown>
                    <PriorityMarker v-else-if="t.priority" :priority="t.priority" show-label />
                    <template v-if="t.space !== 'general' && taskPeople(t).length && !isSolo(t.space)">
                      <span aria-hidden="true">·</span>
                      <PeopleStack :people="taskPeople(t)" :max="3" size="xs" title="Assigned to" />
                    </template>
                  </div>
                </div>
              </div>
            </ListCell>

            <template v-if="tabular">
              <!-- Project (My tasks): the project's folder, or for your own tasks the My tasks check (or nothing, Variants) -->
              <ListCell v-if="showProject" class="hidden md:flex">
                <span class="inline-flex min-w-0 items-center gap-1.5 text-sm" :style="{ color: placeCell(t).color }">
                  <span v-if="placeCell(t).icon" :class="placeCell(t).icon" class="size-3.5 shrink-0 text-ink-gray-5" aria-hidden="true" />
                  <span class="truncate">{{ placeCell(t).text }}</span>
                </span>
              </ListCell>
              <!-- Status -->
              <ListCell class="hidden md:flex"><StatusControl :task="t" cell /></ListCell>
              <!-- Priority (My tasks) -->
              <ListCell v-if="columns === 'home'" class="hidden md:flex">
                <span v-if="can.editBrief(t)" class="inline-flex" @click.stop>
                  <Dropdown :options="prioMenu(t)">
                    <!-- Pulled left by its own padding, so the dot lines up with rows you can't change (Round 251) -->
                    <button type="button" class="-ml-1.5 inline-flex h-7 items-center rounded-4 px-1.5 text-sm hover:bg-surface-gray-3" :aria-label="t.priority ? `Priority ${PRIORITY[t.priority]?.label}. Change` : 'Set priority'">
                      <!-- Table views: just P1–P5 (the word is in the tooltip) -->
                      <PriorityMarker v-if="t.priority" :priority="t.priority" />
                      <span v-else class="text-ink-gray-4">Set</span>
                    </button>
                    <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
                  </Dropdown>
                </span>
                <PriorityMarker v-else-if="t.priority" :priority="t.priority" />
                <span v-else class="text-sm text-ink-gray-4">—</span>
              </ListCell>
              <!-- Due date (+ the date-moved marker) -->
              <ListCell class="gap-1 text-sm">
                <span v-if="can.editDue(t)" class="inline-flex" @click.stop>
                  <DatePicker :model-value="t.due || ''" @update:model-value="setDue(t, $event)">
                    <template #trigger="{ open: isOpen, setOpen }">
                      <button type="button" class="-ml-1 inline-flex items-center rounded-4 px-1 py-0.5 hover:bg-surface-gray-3" :aria-label="t.due ? `Due ${dayjs(t.due).format('D MMM')}. Change` : 'Add a due date'" @click="setOpen(!isOpen)">
                        <DueLabel v-if="t.due" :due="t.due" :status="t.status" />
                        <span v-else class="text-ink-gray-4">Add date</span>
                      </button>
                    </template>
                  </DatePicker>
                </span>
                <template v-else>
                  <DueLabel v-if="t.due" :due="t.due" :status="t.status" />
                  <span v-else class="text-ink-gray-4">—</span>
                </template>
              </ListCell>
              <!-- Assigned to (table, projects) -->
              <ListCell v-if="withAssigned" class="hidden md:flex">
                <span class="inline-flex min-w-0" @click.stop>
                  <PeopleStack v-if="team(t).length" :people="team(t)" :max="3" size="xs" title="Assigned to (the milestone's team)" />
                  <AssigneePicker v-else-if="can.assign(t)" :task="t" />
                  <span v-else-if="t.assignee" class="inline-flex items-center gap-1.5 text-sm text-ink-gray-8"><Avatar size="xs" :label="personName(t.assignee)" />{{ personName(t.assignee) }}</span>
                  <span v-else class="text-sm text-ink-gray-4">—</span>
                </span>
              </ListCell>
            </template>
            <!-- The row's ⋯ -->
            <ListCell class="justify-center">
              <span class="inline-flex" @click.stop>
                <Dropdown :options="actions(t)" align="end">
                  <Button variant="ghost" size="sm" icon="lucide-ellipsis" :aria-label="`More actions for ${t.title}`" />
                </Dropdown>
              </span>
            </ListCell>
          </ListRow>

          <!-- Subtasks, under their task -->
          <div v-if="open[t.id] || adding === t.id" class="ml-7 border-l border-outline-gray-2 pl-3">
            <div v-for="c in t.checklist" :key="c.id" class="group/sub flex h-9 items-center gap-2 rounded-4 px-1.5 hover:bg-surface-gray-1">
              <Checkbox :model-value="c.done" :disabled="!canTickSubtask(t, c)" :aria-label="c.text" @update:model-value="toggleChecklistItem(t.id, c.id)" />
              <span class="min-w-0 flex-1 truncate text-base" :class="c.done ? 'text-ink-gray-4 line-through' : 'text-ink-gray-8'">{{ c.text }}</span>
              <DueLabel v-if="c.due" :due="c.due" :status="c.done ? 'done' : 'todo'" class="text-sm" />
              <Avatar v-if="c.assignee" size="xs" :label="personName(c.assignee)" />
              <Button v-if="planner(t) && canAddSub(t) && c.source !== 'review'" variant="ghost" size="sm" icon="lucide-arrow-up-from-line" tooltip="Turn into a task" :aria-label="`Turn ${c.text} into a task`" class="md:opacity-0 md:group-hover/sub:opacity-100" @click="promote(t, c)" />
            </div>
            <!-- Add a subtask: name · date · person (projects) -->
            <form v-if="adding === t.id" :data-subadd="t.id" class="flex h-9 items-center gap-1.5 px-1.5" @submit.prevent="saveSubtask(t)">
              <span class="lucide-plus size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
              <input v-model="sub.text" class="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0" aria-label="Add a subtask" placeholder="Add a subtask · Enter" @keydown.esc="adding = null" />
              <DatePicker v-model="sub.due">
                <template #trigger="{ open: isOpen, setOpen }">
                  <button type="button" class="inline-flex items-center gap-1 rounded-4 px-1 py-0.5 text-sm hover:bg-surface-gray-3" :class="sub.due ? 'text-ink-gray-8' : 'text-ink-gray-4'" aria-label="Subtask date" @click="setOpen(!isOpen)">
                    <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ sub.due ? dayjs(sub.due).format('D MMM') : 'Date' }}
                  </button>
                </template>
              </DatePicker>
              <Dropdown v-if="t.space !== 'general'" :options="subPeople(t)">
                <button type="button" class="inline-flex items-center gap-1 rounded-4 px-1 py-0.5 text-sm hover:bg-surface-gray-3" aria-label="Subtask person">
                  <Avatar v-if="sub.who" size="xs" :label="personName(sub.who)" />
                  <span v-else class="inline-flex items-center gap-1 text-ink-gray-4"><span class="lucide-user-plus size-3.5" aria-hidden="true" />Person</span>
                </button>
                <template #item-prefix="{ item }"><Avatar v-if="item?.person" size="xs" :label="personName(item.person)" /></template>
              </Dropdown>
              <Button variant="ghost" size="sm" icon="lucide-x" aria-label="Stop adding subtasks" tooltip="Done" @click="adding = null" />
            </form>
          </div>
        </ListRows>

        <!-- Add row (Frappe, Table): a List row on the same columns, so priority and date sit under their columns.
             Projects: priority before the title (as on task rows). The group's date is already filled in. Enter adds. -->
        <ListRow v-if="g.addInline && tabular">
          <ListCell class="gap-2">
            <span class="lucide-plus size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
            <Dropdown v-if="columns === 'project'" :options="draftPrio(g)">
              <button type="button" class="inline-flex shrink-0 rounded-4 hover:opacity-80" :aria-label="draft(g).priority ? 'Change priority' : 'Set priority'">
                <PriorityIcon v-if="draft(g).priority" :priority="draft(g).priority" />
                <span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
              </button>
              <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
            </Dropdown>
            <input
              v-model="draft(g).text"
              class="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
              :aria-label="`Add a task to ${g.label}`"
              placeholder="Add a task"
              maxlength="200"
              @keydown.enter.prevent="addIn(g)"
            />
          </ListCell>
          <ListCell v-if="showProject" class="hidden md:flex" />
          <!-- Status: a new task starts as Todo -->
          <ListCell class="hidden md:flex" />
          <ListCell v-if="columns === 'home'" class="hidden md:flex">
            <Dropdown :options="draftPrio(g)">
              <button type="button" class="-ml-1.5 inline-flex h-7 items-center rounded-4 px-1.5 hover:bg-surface-gray-3" :aria-label="draft(g).priority ? 'Change priority' : 'Set priority'">
                <PriorityIcon v-if="draft(g).priority" :priority="draft(g).priority" />
                <span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
              </button>
              <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
            </Dropdown>
          </ListCell>
          <ListCell>
            <DatePicker v-model="draft(g).due">
              <template #trigger="{ open: isOpen, setOpen }">
                <button type="button" class="inline-flex h-7 items-center gap-1 rounded-4 px-1 text-sm hover:bg-surface-gray-3" :class="draft(g).due ? 'text-ink-gray-7' : 'text-ink-gray-4'" aria-label="Date for the new task" @click="setOpen(!isOpen)">
                  <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ draft(g).due ? dayjs(draft(g).due).format('D MMM') : 'Date' }}
                </button>
              </template>
            </DatePicker>
          </ListCell>
          <ListCell v-if="withAssigned" class="hidden md:flex" />
          <ListCell />
        </ListRow>
        <!-- Add row (Feed: no columns) -->
        <form v-else-if="g.addInline" class="flex h-9 items-center gap-2 rounded-4 px-2 hover:bg-surface-gray-1" @submit.prevent="addIn(g)">
          <span class="lucide-plus size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
          <input
            v-model="draft(g).text"
            class="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
            :aria-label="`Add a task to ${g.label}`"
            placeholder="Add a task"
            maxlength="200"
          />
          <Dropdown :options="draftPrio(g)">
            <button type="button" class="inline-flex h-7 items-center rounded-4 px-1 hover:bg-surface-gray-3" :aria-label="draft(g).priority ? 'Change priority' : 'Set priority'">
              <PriorityMarker v-if="draft(g).priority" :priority="draft(g).priority" />
              <span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
            </button>
            <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
          </Dropdown>
          <DatePicker v-model="draft(g).due">
            <template #trigger="{ open: isOpen, setOpen }">
              <button type="button" class="inline-flex h-7 items-center gap-1 rounded-4 px-1 text-sm hover:bg-surface-gray-3" :class="draft(g).due ? 'text-ink-gray-7' : 'text-ink-gray-4'" aria-label="Date for the new task" @click="setOpen(!isOpen)">
                <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ draft(g).due ? dayjs(draft(g).due).format('D MMM') : 'Date' }}
              </button>
            </template>
          </DatePicker>
        </form>
        <p v-else-if="!g.tasks.length" class="px-2 py-2 text-p-sm text-ink-gray-5">No tasks.</p>
      </template>
    </ListGroup>
  </List>
</template>
