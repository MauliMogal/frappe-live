<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { Avatar, Button, TextInput, Textarea, DatePicker, Dropdown, Badge, toast } from 'frappe-ui'
import dayjs from 'dayjs'
import { state, project, myProjects, isMember, addTask, addComment, spaceName, personName, makeAttachment, milestonesOf } from '../lib/store'
import { milestone as findMilestone, milestoneTeam, wsPeople, isSolo, org, currentWs, nextMilestone } from '../lib/store'
// Workspaces on, in a company workspace (Frappe): personal tasks live in Personal, so a new task here goes in a project
const inCompany = computed(() => org.on && !!currentWs.value && currentWs.value.kind !== 'personal')
import { parseQuickAdd } from '../lib/quickAdd'
import { panelMode, panelWidth, modalWidth } from '../lib/panelLayout'
import { usePanelFocus } from '../lib/focus'
import { design } from '../lib/look'
import { Variants } from '../lib/variants'
import DesignChoice from './DesignChoice.vue'
import { PRIORITY, PRIORITY_ORDER, prio } from '../lib/meta'
import { membersOf, linkToAttachment } from '../lib/files'
import TaskLayout from './TaskLayout.vue'
import PeopleStack from './PeopleStack.vue'
import AttachmentTiles from './AttachmentTiles.vue'
import PriorityMarker from './PriorityMarker.vue'
import PriorityIcon from './PriorityIcon.vue'
import PromptDialog from './PromptDialog.vue'
import SubtaskDraft from './SubtaskDraft.vue'

// New task. Same layout as the task detail (components/TaskLayout.vue; Variants → "Task panel"):
//   Title → Description → Properties (same order as the detail) → Subtasks · Files · Comment.
// In a project the milestone holds the date, so a task's own deadline is optional.
// Shortcuts in the title still work: @name, #project, !1–!5, "fri".
const route = useRoute()
const router = useRouter()
const isMobile = useMediaQuery('(max-width: 767px)')

const open = computed(() => state.ui.quickAdd)
const asideClass = computed(() =>
  panelMode.value === 'full'
    ? 'fixed inset-0'
    : panelMode.value === 'dock'
      ? 'fixed inset-y-0 right-0 border-l border-outline-gray-2'
      : 'relative h-[min(85vh,760px)] max-w-full overflow-hidden rounded-6 shadow-2xl',
)
const titleBox = ref<HTMLElement | null>(null)

const blank = () => ({
  title: '',
  space: 'general',
  assignee: state.me as string | null,
  start: '',
  due: '',
  // No default: "Set priority" until you pick one.
  priority: '' as string,
  labels: [] as string[],
  description: '',
  attachments: [] as any[],
  checklist: [] as { id: string; text: string; done: boolean; source: string }[],
  comment: '',
  milestone: '' as string,
})
const f = ref(blank())
const touched = ref<Record<string, boolean>>({})
const tried = ref(false)

function defaultSpace() {
  if (state.ui.quickAddSpace) return state.ui.quickAddSpace
  if (route.path.startsWith('/p/') && isMember(String(route.params.id))) return String(route.params.id)
  if (route.path === '/') return 'general'
  // Company workspace: your first project here ('' when you're in none: the panel says so)
  if (inCompany.value) return myProjects.value[0]?.id || ''
  return 'general'
}
// Closing by clicking outside keeps what you typed, so a stray click never loses work.
// Cancel, Esc and creating the task start fresh next time.
const keepDraft = ref(false)
const fromMyTasks = ref(false)
watch(open, (v) => {
  if (!v) return
  if (keepDraft.value && f.value.title.trim()) {
    keepDraft.value = false
    nextTick(() => titleBox.value?.querySelector('input')?.focus())
    return
  }
  keepDraft.value = false
  // Started from My tasks: it's a personal task, so there's no Project (or Milestone) to pick
  // (Not in a company workspace: My tasks there is project work, so you pick the project)
  // (Round 253: in a company workspace too, My tasks has your own tasks, like a Raven post: no project, only you)
  fromMyTasks.value = route.path === '/' && !state.ui.quickAddSpace
  const sp = defaultSpace()
  f.value = { ...blank(), space: sp, milestone: state.ui.quickAddMilestone || firstMs(sp) }
  state.ui.quickAddMilestone = null
  touched.value = {}
  tried.value = false
  tab.value = 'checklist'
  nextTick(() => titleBox.value?.querySelector('input')?.focus())
})

function close() {
  state.ui.quickAdd = false
  state.ui.quickAddSpace = null
}

// Click outside the panel closes it. Menus, pickers, dialogs and toasts it opens are portaled
// elsewhere in the page, so clicks inside those don't count as "outside".
const panel = ref<HTMLElement | null>(null)
const INSIDE = '[role="dialog"], [role="menu"], [role="listbox"], [data-reka-popper-content-wrapper], [data-slot="content"], [data-sonner-toaster], [data-sketch-ui]'
function onOutside(e: PointerEvent) {
  const el = e.target as HTMLElement
  if (!open.value || !el?.isConnected) return
  if (panel.value?.contains(el) || el.closest(INSIDE)) return
  keepDraft.value = true
  close()
}
// Keyboard: focus goes to the title on open and back to what opened it on close; Tab stays inside when it covers the page
usePanelFocus(() => open.value, panel, { trap: () => panelMode.value !== 'dock', initial: () => titleBox.value?.querySelector('input') })
watch(open, (v) => {
  if (v) setTimeout(() => document.addEventListener('pointerdown', onOutside, true))
  else document.removeEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))

// Milestones of the chosen project. Changing project clears a milestone that doesn't belong to it.
// In a project every task sits in a milestone (Round 253): no "No milestone"; it starts on the next one due.
const milestoneOptions = computed(() => (f.value.space === 'general' ? [] : milestonesOf(f.value.space).map((m: any) => ({ label: m.name, value: m.id }))))
function firstMs(sp: string) {
  if (!sp || sp === 'general') return ''
  return nextMilestone(sp)?.id || milestonesOf(sp)[0]?.id || ''
}
watch(
  () => f.value.space,
  () => {
    // Back to My tasks: it's yours alone again
    if (f.value.space === 'general') f.value.assignee = state.me
    if (!milestoneOptions.value.some((o) => o.value === f.value.milestone)) f.value.milestone = firstMs(f.value.space)
  },
)

// Pickers (all menus on ghost buttons, so every row looks the same)
const spaceOptions = computed(() => [
  { label: 'My tasks (no project, only you)', value: 'general' },
  ...myProjects.value.map((p) => ({ label: p.name, value: p.id })),
])
const people = computed(() =>
  membersOf(f.value.space, wsPeople.value, project).map((id: string) => ({
    label: id === state.me ? `${personName(id)} (you)` : personName(id),
    value: id,
  })),
)
const priorityOptions = computed(() => [
  ...PRIORITY_ORDER.map((p) => ({
    label: PRIORITY[p].label, // the badge before it already says P1…P5
    priority: p,
    selected: f.value.priority === p,
    onClick: () => {
      f.value.priority = p
      touched.value.priority = true
    },
  })),
  ...(f.value.priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => (f.value.priority = '') }] : []),
])
const allLabels = computed(() => [...new Set(state.tasks.flatMap((x) => x.labels))].sort())
const labelOptions = computed(() => [
  ...allLabels.value.filter((l) => !f.value.labels.includes(l)).map((l) => ({ label: l, onClick: () => f.value.labels.push(l) })),
  { label: 'New label…', icon: 'lucide-plus', onClick: () => startNewLabel() },
])
// New label: typed right in the Labels row (no dialog). Enter adds it, Esc cancels.
const newLabel = ref<string | null>(null)
const newLabelBox = ref<HTMLElement | null>(null)
function startNewLabel() {
  newLabel.value = ''
  nextTick(() => newLabelBox.value?.querySelector('input')?.focus())
}
function saveNewLabel() {
  const v = (newLabel.value || '').trim()
  if (v && !f.value.labels.includes(v)) f.value.labels.push(v)
  newLabel.value = null
}
const spaceMenu = computed(() =>
  spaceOptions.value.map((o) => ({ label: o.label, onClick: () => ((f.value.space = o.value), (touched.value.space = true)) })),
)
const milestoneMenu = computed(() => milestoneOptions.value.map((o) => ({ label: o.label, onClick: () => (f.value.milestone = o.value) })))
const assigneeMenu = computed(() => [
  ...people.value.map((o) => ({ label: o.label, person: o.value, onClick: () => ((f.value.assignee = o.value), (touched.value.assignee = true)) })),
  ...(f.value.space !== 'general' ? [{ label: 'Unassigned', icon: 'lucide-circle-dashed', onClick: () => ((f.value.assignee = null), (touched.value.assignee = true)) }] : []),
])
const spaceLabel = computed(() => (f.value.space === 'general' ? 'My tasks (private)' : f.value.space ? spaceName(f.value.space) : empty.value))
const milestoneLabel = computed(() => (f.value.milestone ? findMilestone(f.value.space, f.value.milestone)?.name || 'Milestone' : 'Not set'))
const assigneeLabel = computed(() => (!f.value.assignee ? 'Open' : f.value.assignee === state.me ? 'You' : personName(f.value.assignee)))

// In a project the milestone carries the date; a task's own deadline is optional.
const inProject = computed(() => f.value.space !== 'general')
// Milestone team: when the task goes into a milestone with people, they do it (no single assignee).
const team = computed(() => (inProject.value && f.value.milestone ? milestoneTeam(f.value.space, f.value.milestone) : []))
const msDue = computed(() => (f.value.milestone ? findMilestone(f.value.space, f.value.milestone)?.due || null : null))
// Empty values don't repeat the row's label ("Start date · Add start date"). Variants → "Empty values":
// notset = faint "Not set" (still reads as clickable on hover) | dash = a faint "—"
const empty = computed(() => (design.emptyValue === 'dash' ? '—' : 'Not set'))
// In a project the milestone's date applies when the task has none: say so on hover
const dueTip = computed(() => (inProject.value && msDue.value ? `Optional. The milestone is due ${dayjs(msDue.value).format('D MMM')}.` : undefined))

// Title shortcuts → fields (only for fields you haven't set by hand)
const spaces = computed(() => [
  { id: 'general', name: 'General', code: 'general' },
  // From My tasks the task stays personal: "#project" isn't read as a project (the text stays as typed)
  ...(fromMyTasks.value ? [] : myProjects.value.map((p) => ({ id: p.id, name: p.name, code: p.code }))),
])
function applyShortcuts() {
  // From My tasks "@name" isn't read as a person either (the text stays as typed)
  const p = parseQuickAdd(f.value.title, fromMyTasks.value ? [] : wsPeople.value, spaces.value)
  if (p.space && !touched.value.space) f.value.space = p.space
  // @name only gives a task to someone inside a project (My tasks are never assigned)
  if (p.assignee && !touched.value.assignee && f.value.space !== 'general') f.value.assignee = p.assignee
  if (p.due && !touched.value.due) f.value.due = p.due
  if (p.priority && !touched.value.priority) f.value.priority = p.priority
  if (p.space || p.assignee || p.due || p.priority) f.value.title = p.title
}

// Prompts: new label, link
const promptOpen = ref(false)
const promptKind = ref<'label' | 'link'>('label')
function openPrompt(k: 'label' | 'link') {
  promptKind.value = k
  promptOpen.value = true
}
function onPrompt(v: string) {
  if (promptKind.value === 'label') f.value.labels.push(v)
  else f.value.attachments.push(makeAttachment(linkToAttachment(v)))
}

// Subtasks · Files · Comment
const tab = ref('checklist')
const tabs = computed(() => [
  { key: 'checklist', label: 'Subtasks', icon: 'lucide-list-checks', count: f.value.checklist.length ? String(f.value.checklist.length) : '' },
  { key: 'files', label: 'Files', icon: 'lucide-paperclip', count: f.value.attachments.length ? String(f.value.attachments.length) : '' },
  { key: 'comments', label: 'Comment', icon: 'lucide-message-square', count: f.value.comment.trim() ? '1' : '' },
])
// Properties, in the same order as the task detail (no Status: a new task starts as To do).
const fields = computed(() =>
  [
    // Personal projects: it's always you, so no Assigned to row
    isSolo(f.value.space)
      ? null
      : team.value.length
      ? { key: 'team', label: 'Assigned to', icon: 'lucide-users', wide: true }
      : f.value.space !== 'general' // My tasks are personal: never assigned, so no Assignee row
        ? { key: 'assignee', label: 'Assignee', icon: 'lucide-user' }
        : null,
    { key: 'start', label: 'Start date', icon: 'lucide-calendar-arrow-up' },
    { key: 'due', label: 'Due date', icon: 'lucide-calendar' },
    { key: 'priority', label: 'Priority', icon: 'lucide-signal' },
    { key: 'labels', label: 'Labels', icon: 'lucide-tag', wide: true },
    fromMyTasks.value ? null : { key: 'project', label: 'Project', icon: f.value.space === 'general' ? 'lucide-lock' : 'lucide-folder' },
    !fromMyTasks.value && milestoneOptions.value.length ? { key: 'milestone', label: 'Milestone', icon: 'lucide-flag-triangle-right' } : null,
  ].filter(Boolean) as any[],
)

// Validation (the footer only speaks up when something is wrong)
const error = computed(() => {
  if (tried.value && !f.value.title.trim()) return 'Give the task a title.'
  // Company workspace and in no project yet: nowhere for it to go
  if (!f.value.space) return `Join a project in ${currentWs.value?.name} first.`
  // A project task needs a milestone; a project with none can't take tasks yet
  if (f.value.space !== 'general' && !f.value.milestone) return 'Add a milestone to this project first.'
  return ''
})

function create() {
  tried.value = true
  applyShortcuts()
  if (!f.value.title.trim() || error.value) return
  const t = addTask({
    title: f.value.title,
    space: f.value.space,
    assignee: f.value.space === 'general' ? state.me : team.value.length ? null : f.value.assignee,
    due: f.value.due || null,
    priority: f.value.priority || null,
    labels: [...f.value.labels],
    description: f.value.description.trim()
      ? f.value.description
          .split(/\n{2,}/)
          .map((p) => `<p>${p.trim().replace(/</g, '&lt;')}</p>`)
          .join('')
      : '',
    attachments: [...f.value.attachments],
    checklist: f.value.checklist.map((c) => ({ ...c })),
    milestone: f.value.milestone || null,
    start: f.value.start || null,
  })
  if (f.value.comment.trim()) addComment(t.id, f.value.comment.trim())
  close()
  router.push({ query: { ...route.query, task: t.id } })
  toast.success(`Task added to ${spaceName(t.space)}.`)
}

// Enter saves the task. Except where Enter already means something: a new line in the
// description/comment, adding a subtask, or pressing a focused button/picker.
// Ctrl/⌘ + Enter saves from anywhere, textareas included.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    create()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.defaultPrevented) {
    const el = e.target as HTMLElement
    const label = el.getAttribute('aria-label')
    if (el.tagName === 'TEXTAREA' || label === 'Add a subtask' || label === 'Task title') return
    if (el.closest('button, a, [role="combobox"], [role="listbox"], [role="menu"]')) return
    e.preventDefault()
    create()
  }
  if (e.key === 'Escape' && !promptOpen.value) close()
}
</script>

<template>
  <Transition name="panel">
  <!-- Dock: a column on the right, the page shrinks beside it. Modal (too narrow to dock): centred over a dim page. -->
  <div v-if="open" :class="panelMode === 'modal' ? 'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4 sm:p-6' : 'contents'">
  <aside
    ref="panel"
    class="z-40 flex flex-col bg-surface-base"
    :class="asideClass"
    :style="panelMode === 'dock' ? { width: `${panelWidth}px` } : panelMode === 'modal' ? { width: `${modalWidth}px` } : undefined"
    role="dialog"
    :aria-modal="panelMode === 'modal' ? 'true' : 'false'"
    aria-label="New task"
    @keydown="onKey"
  >
    <!-- Header -->
    <header class="flex h-12 shrink-0 items-center gap-1 border-b border-outline-gray-1 px-3">
      <h2 class="px-1.5 text-base-medium text-ink-gray-9">New task</h2>
      <!-- Shown in the pill only while New task is open. Sketch ties a variant set to the page it was made on, and this panel
           stays open across pages, so it's re-made per page (:key) to follow you. -->
      <Variants :key="route.path" name="Empty values">
        <template #notset><DesignChoice k="emptyValue" v="notset" /></template>
        <template #dash><DesignChoice k="emptyValue" v="dash" /></template>
      </Variants>
      <Button class="ml-auto" variant="ghost" icon="lucide-x" aria-label="Close" @click="close" />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
     <TaskLayout v-model:tab="tab" :fields="fields" :sections="tabs">
      <!-- Title and description: no boxes, no headings -->
      <template #title>
        <!-- Required (no asterisk): Create task with no title says "Give the task a title." -->
        <div ref="titleBox" class="relative">
          <TextInput
            v-model="f.title"
            size="lg"
            variant="ghost"
            class="-mx-2 [&_input]:text-2xl [&_input]:font-semibold"
            aria-required="true"
            aria-label="Task title"
            placeholder="Task title"
            maxlength="200"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? 'new-task-error' : undefined"
            @blur="applyShortcuts"
            @keydown.enter.exact.prevent="create"
          />
        </div>
      </template>
      <template #description>
        <!-- Plain text under the title, like the task detail: no box (grey only on hover) -->
        <Textarea
          v-model="f.description"
          :rows="2"
          class="-mx-2 !border-transparent !bg-transparent text-p-base hover:!bg-surface-gray-2 focus:!bg-transparent [&_textarea]:!border-transparent [&_textarea]:!bg-transparent"
          aria-label="Description"
          placeholder="Add a description…"
        />
      </template>

      <!-- Properties (which ones show: `fields` above) -->
      <template #field-project>
          <Dropdown :options="spaceMenu">
            <Button variant="ghost" :label="spaceLabel" aria-label="Project" />
          </Dropdown>
      </template>
      <template #field-milestone>
          <Dropdown :options="milestoneMenu">
            <Button variant="ghost" aria-label="Milestone">
              <span v-if="f.milestone" class="text-ink-gray-8">{{ milestoneLabel }}</span>
              <span v-else class="text-ink-gray-4">{{ empty }}</span>
            </Button>
          </Dropdown>
      </template>
      <!-- In a milestone with a team, the team does it: shown, not picked. Click the avatars for everyone. -->
      <template #field-team>
          <span class="flex items-center gap-1.5 px-1.5">
            <!-- Avatars only, like everywhere else; click them for the names -->
            <PeopleStack :people="team" :max="4" :title="`${milestoneLabel} team`" />
          </span>
      </template>
      <!-- Home (General) tasks are yours: no Assignee row (typing @name in the title still gives it to someone) -->
      <template #field-assignee>
          <Dropdown :options="assigneeMenu">
            <Button variant="ghost" aria-label="Assignee">
              <template #prefix>
                <Avatar v-if="f.assignee" size="xs" :label="personName(f.assignee)" />
                <span v-else class="lucide-circle-dashed size-4 text-ink-gray-5" aria-hidden="true" />
              </template>
              {{ assigneeLabel }}
            </Button>
            <template #item-prefix="{ item }">
              <Avatar v-if="item?.person" size="xs" :label="personName(item.person)" />
              <span v-else-if="item?.icon" :class="item.icon" class="size-4" aria-hidden="true" />
            </template>
          </Dropdown>
      </template>
      <template #field-start>
          <DatePicker v-model="f.start">
            <template #trigger="{ open: isOpen, setOpen }">
              <Button variant="ghost" aria-label="Start date" @click="setOpen(!isOpen)">
                <span v-if="f.start" class="text-ink-gray-8">{{ dayjs(f.start).format('ddd D MMM') }}</span>
                <span v-else class="text-ink-gray-4">{{ empty }}</span>
              </Button>
            </template>
          </DatePicker>
      </template>
      <template #field-due>
          <DatePicker v-model="f.due" @update:model-value="touched.due = true">
            <template #trigger="{ open: isOpen, setOpen }">
              <Button variant="ghost" aria-label="Due date" :tooltip="dueTip" @click="setOpen(!isOpen)">
                <span v-if="f.due" class="text-ink-gray-8">{{ dayjs(f.due).format('ddd D MMM') }}</span>
                <span v-else class="text-ink-gray-4">{{ empty }}</span>
              </Button>
            </template>
          </DatePicker>
          <Button v-if="f.due && inProject" variant="ghost" size="sm" icon="lucide-x" aria-label="Clear due date" @click="f.due = ''" />
      </template>
      <template #field-priority>
          <Dropdown :options="priorityOptions">
            <Button variant="ghost" :aria-label="f.priority ? `Priority: ${PRIORITY[prio(f.priority)].label}` : 'Set priority'">
              <PriorityMarker v-if="f.priority" :priority="f.priority" show-label />
              <span v-else class="text-ink-gray-4">{{ empty }}</span>
            </Button>
            <template #item-prefix="{ item }">
              <PriorityIcon v-if="item?.priority" :priority="item.priority" />
              <span v-else-if="item?.icon" :class="item.icon" class="size-4" aria-hidden="true" />
            </template>
          </Dropdown>
      </template>
      <template #field-labels>
          <button
            v-for="l in f.labels"
            :key="l"
            type="button"
            class="rounded-1"
            :aria-label="`Remove label ${l}`"
            @click="f.labels = f.labels.filter((x) => x !== l)"
          >
            <Badge variant="outline" theme="gray" :label="l" />
          </button>
          <span v-if="newLabel !== null" ref="newLabelBox" class="inline-flex">
            <TextInput v-model="newLabel" size="sm" class="w-36" aria-label="New label" placeholder="Label name" maxlength="30" @keydown.enter.prevent="saveNewLabel" @keydown.esc.stop.prevent="newLabel = null" @blur="saveNewLabel" />
          </span>
          <Dropdown v-else :options="labelOptions">
            <Button v-if="f.labels.length" variant="ghost" size="sm" icon="lucide-plus" aria-label="Add label" />
            <Button v-else variant="ghost" aria-label="Add label"><span class="text-ink-gray-4">{{ empty }}</span></Button>
          </Dropdown>
      </template>

      <!-- Subtasks · Files · Comment -->
      <template #section-checklist><SubtaskDraft v-model="f.checklist" /></template>
      <template #section-files>
        <AttachmentTiles
          :items="f.attachments"
          editable
          @remove="(id) => (f.attachments = f.attachments.filter((a) => a.id !== id))"
          @uploaded="(a) => f.attachments.push(makeAttachment(a))"
          @link="openPrompt('link')"
        />
      </template>
      <template #section-comments>
        <Textarea v-model="f.comment" :rows="3" aria-label="First comment" placeholder="Add a comment. Use @name to mention someone." />
      </template>
     </TaskLayout>
    </div>

    <!-- Footer -->
    <footer class="flex shrink-0 flex-wrap items-center gap-2 border-t border-outline-gray-1 px-4 py-3 sm:px-6">
      <!-- role=alert: screen readers read the error out as soon as it appears -->
      <p id="new-task-error" role="alert" class="min-w-0 flex-1 text-p-sm text-ink-red-5">{{ error }}</p>
      <Button variant="ghost" label="Cancel" @click="close" />
      <Button variant="solid" theme="gray" label="Create task" tooltip="Enter" @click="create" />
    </footer>

    <PromptDialog
      v-model:open="promptOpen"
      :title="promptKind === 'label' ? 'New label' : 'Add link'"
      :label="promptKind === 'label' ? 'Label' : 'Link'"
      :placeholder="promptKind === 'label' ? 'Research' : 'https://figma.com/…'"
      :confirm-label="promptKind === 'label' ? 'Add label' : 'Add link'"
      @confirm="onPrompt"
    />
  </aside>
  </div>
  </Transition>
</template>
