<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import dayjs from 'dayjs'
import { Button, TextInput, Textarea, DatePicker, Dropdown, Avatar, Progress, toast } from 'frappe-ui'
import StatusIcon from './StatusIcon.vue'
import { state, project, milestone, saveMilestone, deleteMilestone, milestoneStats, slipText, addTask, addSubtask, personName, setMilestonePeople, isSolo } from '../lib/store'
import { PRIORITY, PRIORITY_ORDER } from '../lib/meta'
import PriorityIcon from './PriorityIcon.vue'
import { panelMode, panelWidth, modalWidth } from '../lib/panelLayout'
import { useRoute, useRouter } from 'vue-router'
import MilestoneStatusBadge from './MilestoneStatusBadge.vue'
import PropertyRow from './PropertyRow.vue'
import GithubMark from './GithubMark.vue'
import { usePanelFocus } from '../lib/focus'

// New or edit milestone. A panel docked on the right like New task (the page makes room for it).
// Same look as New task: name (no box) → property rows (Project, Deadline) → Tasks tab.
// In a project the milestone carries the deadline; tasks inside it can have their own, optionally.
// The Tasks tab plans the work right here: type a task, Enter; "+ Subtask" on a task adds steps under it.
// New only: "Already have a plan? Import" opens the same Import window as ▾ → Import.
const open = computed(() => !!state.ui.milestone)
const pid = computed(() => state.ui.milestone?.pid || '')
const mid = computed(() => state.ui.milestone?.id)
const m = computed(() => (mid.value ? milestone(pid.value, mid.value) : null))
const name = ref('')
const due = ref('')
const box = ref<HTMLElement | null>(null)

// Tasks planned in the panel (created when you save)
// Each task can get a person, a priority and a date right on its row (all optional; none pre-filled).
type Draft = { id: string; title: string; subs: string[]; adding: boolean; subDraft: string; assignee: string | null; priority: string; due: string }
const drafts = ref<Draft[]>([])
const taskDraft = ref('')
const tab = ref('tasks')

watch(
  () => state.ui.milestone,
  (v) => {
    if (!v) return
    name.value = m.value?.name || ''
    due.value = m.value?.due || ''
    drafts.value = []
    taskDraft.value = ''
    triedSave.value = false
    // New milestone: you're on its team to start with (if you're in the project), so its tasks belong to someone.
    // Untick yourself if it's for other people.
    team.value = m.value ? [...(m.value.people || [])] : members.value.includes(state.me) ? [state.me] : []
    tab.value = 'tasks'
    nextTick(() => box.value?.querySelector('input')?.focus())
  },
)
// Name and deadline are both required: tasks in a project lean on the milestone's date.
const valid = computed(() => !!name.value.trim() && !!due.value)
const triedSave = ref(false)
// The milestone's team: everyone here works on all its tasks (tasks have no assignee of their own).
const team = ref<string[]>([])
const toggleTeam = (u: string) => (team.value = team.value.includes(u) ? team.value.filter((x) => x !== u) : [...team.value, u])
const members = computed(() => (project(pid.value)?.members || []).map((m: any) => m.user))
const personMenu = (d: Draft) => [
  ...members.value.map((u: string) => ({ label: u === state.me ? `${personName(u)} (you)` : personName(u), person: u, onClick: () => (d.assignee = u) })),
  { label: 'Unassigned', icon: 'lucide-circle-dashed', onClick: () => (d.assignee = null) },
]
const prioMenu = (d: Draft) => [
  ...PRIORITY_ORDER.map((p) => ({ label: PRIORITY[p].label, priority: p, onClick: () => (d.priority = p) })),
  ...(d.priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => (d.priority = '') }] : []),
]
const stats = computed(() => (mid.value ? milestoneStats(pid.value, mid.value) : null))
const subCount = computed(() => drafts.value.reduce((n, d) => n + d.subs.length, 0))

// The add bar's own priority and date (applied to the task you add, then cleared)
const newPrio = ref('')
const newDue = ref('')
const newPrioMenu = computed(() => [
  ...PRIORITY_ORDER.map((p) => ({ label: PRIORITY[p].label, priority: p, onClick: () => (newPrio.value = p) })),
  ...(newPrio.value ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => (newPrio.value = '') }] : []),
])
function addDraft() {
  const v = taskDraft.value.trim()
  if (!v) return
  drafts.value.push({ id: `d${Date.now()}`, title: v, subs: [], adding: false, subDraft: '', assignee: null, priority: newPrio.value, due: newDue.value })
  taskDraft.value = ''
  newPrio.value = ''
  newDue.value = ''
}
function addSub(d: Draft) {
  const v = d.subDraft.trim()
  if (!v) return
  d.subs.push(v)
  d.subDraft = ''
}
function startSub(d: Draft) {
  d.adding = true
  nextTick(() => (document.querySelector(`[data-sub="${d.id}"] input`) as HTMLInputElement | null)?.focus())
}
const removeDraft = (id: string) => (drafts.value = drafts.value.filter((d) => d.id !== id))

const saveLabel = computed(() => {
  const base = mid.value ? 'Save' : 'Add milestone'
  if (!drafts.value.length) return base
  return `${base} · ${drafts.value.length} ${drafts.value.length === 1 ? 'task' : 'tasks'}`
})

function close() {
  state.ui.milestone = null
}
function save() {
  triedSave.value = true
  if (!valid.value) return
  const id = saveMilestone(pid.value, { id: mid.value, name: name.value.trim(), due: due.value || null })
  setMilestonePeople(pid.value, id, team.value)
  drafts.value.forEach((d) => {
    const t = addTask({ title: d.title, space: pid.value, assignee: null, due: d.due || null, priority: d.priority || null, milestone: id })
    d.subs.forEach((s) => addSubtask(t.id, s, {}))
  })
  const extra = drafts.value.length ? ` with ${drafts.value.length} ${drafts.value.length === 1 ? 'task' : 'tasks'}` : ''
  toast.success(mid.value ? `Milestone saved${extra}.` : `Milestone “${name.value.trim()}” added${extra}.`)
  close()
}
// Removing is undoable: the toast's Undo puts the milestone and its tasks back.
function remove() {
  // Every project task sits in a milestone (Round 253), so only an empty milestone can go
  const left = state.tasks.filter((t: any) => t.space === pid.value && t.milestone === mid.value && !t.deletedAt).length
  if (left) return toast.error(`Move or delete its ${left} ${left === 1 ? 'task' : 'tasks'} first.`)
  const undo = deleteMilestone(pid.value, mid.value!)
  toast.success(`Milestone “${name.value.trim() || 'Untitled'}” removed.`, {
    duration: 8000,
    action: { label: 'Undo', onClick: () => undo() },
  })
  close()
}
// Same Import window as "▾ → Import": one way to import, two ways in.
function importPlan(source?: 'github') {
  const id = pid.value
  close()
  state.ui.importTasks = { pid: id, source }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
}
// Same as New task and the task detail (lib/panelLayout.ts): docked on the right with the page squeezed beside it
// (nothing dimmed or covered), or a centred modal when the screen is too narrow to dock (and on phones).
const slide = computed(() => panelMode.value === 'dock')
// Keyboard: focus goes to the name and back to what opened it on close; Tab stays inside only when it covers the page
const msBox = ref<HTMLElement | null>(null)
usePanelFocus(() => open.value, msBox, { trap: () => !slide.value, initial: () => box.value?.querySelector('input') })
const asideClass = computed(() =>
  slide.value ? 'fixed inset-y-0 right-0 border-l border-outline-gray-2' : 'relative h-[min(85vh,720px)] max-w-full overflow-hidden rounded-6 shadow-2xl',
)
const asideStyle = computed(() => ({ width: `${slide.value ? panelWidth.value : modalWidth.value}px` }))
const shellClass = computed(() => (slide.value ? 'contents' : 'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4 sm:p-6'))
// One right-hand panel at a time: opening a milestone closes New task and the task detail
const route = useRoute()
const router = useRouter()
watch(open, (v) => {
  if (!v) return
  state.ui.quickAdd = false
  if (route.query.task) {
    const q = { ...route.query }
    delete q.task
    router.replace({ query: q })
  }
})
// ...and opening one of those closes the milestone panel
watch(
  () => [state.ui.quickAdd, route.query.task],
  ([qa, t]) => {
    if (open.value && (qa || t)) close()
  },
)
</script>

<template>
  <Transition :name="slide ? 'panel' : 'fade'">
    <div v-if="open" :class="shellClass" @click.self="!slide && close()">
      <aside
        ref="msBox"
        class="z-40 flex flex-col bg-surface-base"
        :class="asideClass"
        :style="asideStyle"
        role="dialog"
        :aria-modal="slide ? 'false' : 'true'"
        :aria-label="mid ? 'Edit milestone' : 'New milestone'"
        @keydown="onKey"
      >
        <header class="flex h-12 shrink-0 items-center gap-1 border-b border-outline-gray-1 px-3">
          <h2 class="px-1.5 text-base-medium text-ink-gray-9">{{ mid ? 'Edit milestone' : 'New milestone' }}</h2>
          <Button class="ml-auto" variant="ghost" icon="lucide-x" aria-label="Close" @click="close" />
        </header>

        <div ref="box" class="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6">
          <!-- New only: bring a whole plan in from a spreadsheet, a document or another to-do app -->
          <!-- (wraps on narrow screens: the buttons move under the text) -->
          <div v-if="!mid" class="mb-4 flex flex-wrap items-center gap-3 rounded-5 border border-dashed border-outline-gray-3 px-3 py-2.5">
            <span class="lucide-file-up size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
            <div class="min-w-[12rem] flex-1">
              <p class="text-sm text-ink-gray-8">Already have a plan?</p>
              <p class="text-xs text-ink-gray-5">Import milestones and tasks from a spreadsheet or a document, or connect a GitHub repository.</p>
            </div>
            <Button variant="subtle" size="sm" label="Import" @click="importPlan()" />
            <Button variant="subtle" size="sm" label="GitHub" @click="importPlan('github')">
              <template #prefix><GithubMark class="!size-3.5" /></template>
            </Button>
          </div>

          <!-- 1 · What: name and what "done" means, no boxes and no headings -->
          <!-- Required (no asterisk): Save stays disabled until it has a name and a due date -->
          <div class="relative">
            <TextInput
              v-model="name"
              size="lg"
              variant="ghost"
              class="-mx-2 [&_input]:text-lg [&_input]:font-semibold"
              aria-label="Milestone name"
              aria-required="true"
              placeholder="Milestone name"
              maxlength="120"
              @keydown.enter.exact.prevent="save"
            />
          </div>

          <!-- 2 · Properties -->
          <div class="mt-3 space-y-0.5 border-t border-outline-gray-1 pt-3">
            <PropertyRow icon="lucide-folder" label="Project">
              <span class="px-2 text-base text-ink-gray-8">{{ project(pid)?.name }}</span>
            </PropertyRow>
            <PropertyRow icon="lucide-calendar" label="Due date">
              <DatePicker v-model="due">
                <template #trigger="{ open: isOpen, setOpen }">
                  <Button variant="ghost" @click="setOpen(!isOpen)">
                    <span v-if="due" class="text-ink-gray-8">{{ dayjs(due).format('ddd D MMM') }}</span>
                    <span v-else :class="triedSave ? 'text-ink-red-5' : 'text-ink-gray-5'">Not set</span>
                  </Button>
                </template>
              </DatePicker>
            </PropertyRow>
            <p v-if="triedSave && !due" class="pl-[7.75rem] text-xs text-ink-red-5">Add a due date. Tasks in this milestone use it.</p>
            <!-- Assigned to: tap people to put them on this milestone -->
            <PropertyRow v-if="!isSolo(pid)" icon="lucide-users" label="Assigned to">
              <div class="flex flex-wrap gap-1 py-1">
                <Button
                  v-for="u in members"
                  :key="u"
                  size="sm"
                  :variant="team.includes(u) ? 'outline' : 'subtle'"
                  :aria-pressed="team.includes(u)"
                  @click="toggleTeam(u)"
                >
                  <template #prefix><Avatar size="xs" :label="personName(u)" /></template>
                  {{ u === state.me ? 'You' : personName(u) }}
                  <template #suffix><span v-if="team.includes(u)" class="lucide-check size-3.5 text-ink-gray-7" aria-hidden="true" /></template>
                </Button>
              </div>
            </PropertyRow>
            <p v-if="!isSolo(pid)" class="pl-[7.75rem] text-xs text-ink-gray-5">{{ team.length ? `${team.length === 1 && team[0] === state.me ? 'You' : team.map((u) => (u === state.me ? 'you' : personName(u))).join(', ').replace(/^you/, 'You')} will work on every task in this milestone.` : 'No one on it yet, so its tasks will be open for anyone in the project to pick up.' }}</p>
            <PropertyRow v-if="m && stats" icon="lucide-activity" label="Progress">
              <div class="flex min-w-0 flex-1 items-center gap-2 px-2">
                <Progress class="flex-1" size="sm" :value="stats.pct" />
                <span class="text-sm tabular-nums text-ink-gray-6">{{ stats.done }}/{{ stats.total }}</span>
                <MilestoneStatusBadge :pid="pid" :m="m" />
              </div>
            </PropertyRow>
          </div>

          <!-- 3 · Tasks, created with the milestone. One line per task (same pieces as everywhere: status · name ·
               priority · date), details faint until set, actions on hover; subtasks indented under it.
               Adding is a plain line (no grey box), like Add a subtask in New task. -->
          <section class="mt-6" aria-label="Tasks">
            <h3 class="flex items-center gap-2 text-base-semibold text-ink-gray-9">
              Tasks<span v-if="drafts.length" class="text-sm font-normal tabular-nums text-ink-gray-5">{{ drafts.length }}<template v-if="subCount"> · {{ subCount }} {{ subCount === 1 ? 'subtask' : 'subtasks' }}</template></span>
            </h3>
            <p v-if="!drafts.length" class="mt-0.5 text-p-sm text-ink-gray-5">Optional. Tasks use the milestone's due date unless you give them one.</p>

            <ul v-if="drafts.length" class="mt-2 divide-y divide-outline-gray-1 border-y border-outline-gray-1">
              <li v-for="d in drafts" :key="d.id">
                <div class="group flex h-10 items-center gap-1.5 px-1">
                  <span class="inline-flex size-7 shrink-0 items-center justify-center"><StatusIcon status="todo" /></span>
                  <span class="min-w-0 flex-1 truncate text-base text-ink-gray-9">{{ d.title }}</span>
                  <!-- Priority: shown when set; a faint icon on hover when not -->
                  <Dropdown :options="prioMenu(d)">
                    <button type="button" class="inline-flex h-7 items-center rounded-4 px-1.5 hover:bg-surface-gray-2" :class="d.priority ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'" :aria-label="`Priority for ${d.title}`">
                      <PriorityIcon v-if="d.priority" :priority="d.priority" />
                      <span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
                    </button>
                    <template #item-prefix="{ item }">
                      <PriorityIcon v-if="item?.priority" :priority="item.priority" />
                      <span v-else-if="item?.icon" :class="item.icon" class="size-4" aria-hidden="true" />
                    </template>
                  </Dropdown>
                  <!-- Date: shown when set; a faint icon on hover when not -->
                  <DatePicker v-model="d.due">
                    <template #trigger="{ open: isOpen, setOpen }">
                      <button type="button" class="inline-flex h-7 items-center gap-1 rounded-4 px-1.5 text-sm tabular-nums text-ink-gray-7 hover:bg-surface-gray-2" :class="d.due ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'" :aria-label="`Date for ${d.title}`" @click="setOpen(!isOpen)">
                        <span v-if="!d.due" class="lucide-calendar size-3.5 text-ink-gray-4" aria-hidden="true" />{{ d.due ? dayjs(d.due).format('MMM D') : '' }}
                      </button>
                    </template>
                  </DatePicker>
                  <!-- Subtasks: count when there are some; + on hover -->
                  <button type="button" class="inline-flex h-7 items-center gap-1 rounded-4 px-1.5 text-sm tabular-nums text-ink-gray-6 hover:bg-surface-gray-2" :class="d.subs.length ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'" :aria-label="`Add a subtask to ${d.title}`" @click="startSub(d)">
                    <span class="lucide-list-checks size-3.5" aria-hidden="true" />{{ d.subs.length || '' }}
                  </button>
                  <Button variant="ghost" size="sm" icon="lucide-x" :aria-label="`Remove ${d.title}`" class="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100" @click="removeDraft(d.id)" />
                </div>
                <!-- Subtasks, indented under their task -->
                <ul v-if="d.subs.length || d.adding" class="mb-2 ml-[1.15rem] space-y-0.5 border-l border-outline-gray-2 pl-3">
                  <li v-for="(s, i) in d.subs" :key="i" class="group flex h-7 items-center gap-2 rounded-4 px-1.5 hover:bg-surface-gray-1">
                    <span class="lucide-square size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-8">{{ s }}</span>
                    <Button variant="ghost" size="sm" icon="lucide-x" :aria-label="`Remove ${s}`" class="md:opacity-0 md:group-hover:opacity-100" @click="d.subs.splice(i, 1)" />
                  </li>
                  <li v-if="d.adding" :data-sub="d.id" class="py-0.5">
                    <TextInput v-model="d.subDraft" size="sm" variant="ghost" aria-label="Add a subtask" placeholder="Subtask · Enter to add" @keydown.enter.prevent="addSub(d)" @keydown.esc.stop="d.adding = false" @blur="!d.subDraft && (d.adding = false)" />
                  </li>
                </ul>
              </li>
            </ul>

            <!-- Add a task: a plain line (status · priority · name · date · ✓) -->
            <form class="mt-2 flex h-9 items-center gap-1 pl-1 pr-1" @submit.prevent="addDraft">
              <span class="inline-flex size-7 shrink-0 items-center justify-center opacity-60"><StatusIcon status="todo" /></span>
              <Dropdown :options="newPrioMenu">
                <button type="button" class="inline-flex h-7 shrink-0 items-center rounded-4 px-1.5 hover:bg-surface-gray-3" :aria-label="newPrio ? `Priority: ${PRIORITY[newPrio].label}` : 'Set priority'">
                  <PriorityIcon v-if="newPrio" :priority="newPrio" />
                  <span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
                </button>
                <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
              </Dropdown>
              <input v-model="taskDraft" class="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0" aria-label="Add a task" placeholder="Add a task" @keydown.enter.prevent="addDraft" />
              <DatePicker v-model="newDue">
                <template #trigger="{ open: isOpen, setOpen }">
                  <button type="button" class="inline-flex h-7 shrink-0 items-center gap-1 rounded-4 px-1.5 text-sm tabular-nums hover:bg-surface-gray-3" :class="newDue ? 'text-ink-gray-8' : 'text-ink-gray-4'" aria-label="Due date" @click="setOpen(!isOpen)">
                    <span v-if="!newDue" class="lucide-calendar size-3.5" aria-hidden="true" />{{ newDue ? dayjs(newDue).format('MMM D') : 'Date' }}
                  </button>
                </template>
              </DatePicker>
              <Button variant="ghost" size="sm" icon="lucide-check" aria-label="Add task" tooltip="Add (Enter)" type="submit" :disabled="!taskDraft.trim()" />
            </form>
          </section>
        </div>

        <footer class="flex shrink-0 items-center gap-2 border-t border-outline-gray-1 px-4 py-3 sm:px-6">
          <Button v-if="mid" variant="ghost" theme="red" label="Remove" @click="remove" />
          <Button class="ml-auto" variant="ghost" label="Cancel" @click="close" />
          <!-- Ready only with a name and a due date (both required), same as Create project -->
          <Button variant="solid" theme="gray" :label="saveLabel" :disabled="!valid" :tooltip="valid ? undefined : 'Add a name and a due date'" @click="save" />
        </footer>
      </aside>
    </div>
  </Transition>
</template>
