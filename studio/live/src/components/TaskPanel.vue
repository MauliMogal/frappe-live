<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { Button, Dropdown, Badge, TextInput, Textarea, DatePicker, Tooltip, toast } from 'frappe-ui'
import TaskLayout from './TaskLayout.vue'
import PeopleStack from './PeopleStack.vue'
import AttachmentTiles from './AttachmentTiles.vue'
import { STATUS } from '../lib/meta'
import {
  state,
  task,
  canSee,
  project,
  spaceName,
  personName,
  myProjects,
  isMember,
  markTaskRead,
  updateTask,
  changeReviewer,
  moveTask,
  markDone,
  toggleMute,
  cancelTask,
  restoreCancelled,
  deleteTask,
  restoreDeleted,
  addAttachment,
  removeAttachment,
  requestToJoin,
  myJoinRequest,
  milestonesOf,
  milestone,
  setTaskMilestone,
  setDependsOn,
  slipText,
  milestoneTeam,
} from '../lib/store'
import { wsPeople, isSolo, me } from '../lib/store'
import dayjs from 'dayjs'
import StatusIcon from './StatusIcon.vue'
import { can, needsReview } from '../lib/permissions'
import { now } from '../lib/dates'
import { PRIORITY, PRIORITY_ORDER, prio } from '../lib/meta'
import { textToHtml, htmlToText } from '../lib/text'
import { fileToAttachment, linkToAttachment, membersOf } from '../lib/files'
import StatusControl from './StatusControl.vue'
import PriorityMarker from './PriorityMarker.vue'
import PriorityIcon from './PriorityIcon.vue'
import DueLabel from './DueLabel.vue'
import AssigneePicker from './AssigneePicker.vue'
import ReviewBar from './ReviewBar.vue'
import SuggestionCard from './SuggestionCard.vue'
import ChecklistBlock from './ChecklistBlock.vue'
import AttachmentList from './AttachmentList.vue'
import CommentThread from './CommentThread.vue'
import ActivityLog from './ActivityLog.vue'
import PromptDialog from './PromptDialog.vue'
import EmptyState from './EmptyState.vue'
import HintCard from './HintCard.vue'
import { toneFor, labelVariant } from '../lib/look'
import { panelMode, panelWidth, modalWidth } from '../lib/panelLayout'
import { ownWsName } from '../lib/place'
import { usePanelFocus } from '../lib/focus'

// Task detail. Same layout as New task (components/TaskLayout.vue; Variants → "Task panel"):
// header · title · main action and notices · description · properties · Subtasks / Files / Comments / Activity.
// Side panel on desktop, full screen on mobile.
const route = useRoute()
const router = useRouter()
const isMobile = useMediaQuery('(max-width: 767px)')

const id = computed(() => String(route.query.task || ''))
const t = computed(() => task(id.value))
const viewState = computed(() => {
  if (!t.value) return 'missing'
  if (t.value.deletedAt) return 'deleted'
  if (!canSee(t.value)) return 'noaccess'
  return 'ok'
})

// Remember when I last opened it, for the "New" comments line. Opening clears its notifications.
const lastSeen = ref<string | null>(null)

function close() {
  const q = { ...route.query }
  delete q.task
  router.push({ query: q })
}
function onKey(e: KeyboardEvent) {
  const ui = state.ui
  const overlay = ui.quickAdd || ui.search || ui.settings || ui.submitTask || ui.suggestTask || ui.requestChangesTask || promptOpen.value
  if (e.key === 'Escape' && !overlay && !(document.activeElement as HTMLElement)?.closest?.('[role="dialog"][aria-modal="true"]')) close()
}
onMounted(() => window.addEventListener('keydown', onKey))
// Keyboard: focus lands on the panel when it opens (and goes back to the row on close).
// When it covers the page (modal, phone), Tab stays inside it.
const panelBox = ref<HTMLElement | null>(null)
usePanelFocus(() => true, panelBox, { trap: () => panelMode.value !== 'dock', initial: () => panelBox.value })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const editable = computed(() => !!t.value && can.edit(t.value) && t.value.status !== 'cancelled')
// Title, description, priority belong to whoever assigned it.
const briefEditable = computed(() => !!t.value && can.editBrief(t.value))
const staff = computed(() => !!me.value?.canCreateProjects)
const ownerOptions = computed(() => [
  { label: 'Team', onClick: () => updateTask(t.value.id, { owner: 'team' }) },
  { label: 'Customer', onClick: () => updateTask(t.value.id, { owner: 'customer' }) },
])
const muted = computed(() => t.value?.mutedBy.includes(state.me))

// Title
const editingTitle = ref(false)
const titleDraft = ref('')
function editTitle() {
  if (!briefEditable.value) return
  titleDraft.value = t.value.title
  editingTitle.value = true
}
function saveTitle() {
  if (titleDraft.value.trim()) updateTask(t.value.id, { title: titleDraft.value.trim() })
  editingTitle.value = false
}

// Description
const editingDesc = ref(false)
const descDraft = ref('')
function editDesc() {
  descDraft.value = htmlToText(t.value.description)
  editingDesc.value = true
}
function saveDesc() {
  updateTask(t.value.id, { description: textToHtml(descDraft.value) }, 'edited the description')
  editingDesc.value = false
}

// Due date
const due = computed({
  get: () => t.value?.due || '',
  set: (v: string) => updateTask(t.value.id, { due: v || null }),
})

// Date slips: "14 Oct → 17 Oct · 17 Oct → 20 Oct"
const slipHistory = computed(() =>
  (t.value?.slips || []).map((s: any) => `${dayjs(s.from).format('D MMM')} → ${dayjs(s.to).format('D MMM')}`).join(' · '),
)

// Start date
const startDate = computed({
  get: () => t.value?.start || '',
  set: (v: string) => {
    t.value.start = v || null
  },
})

// (No "Depends on" and no Blocked: if you're stuck, say so in a comment.)

// Priority
const priorityOptions = computed(() =>
  PRIORITY_ORDER.map((p) => ({
    label: PRIORITY[p].label, // the badge before it already says P1…P5
    priority: p,
    selected: prio(t.value.priority) === p,
    onClick: () => updateTask(t.value.id, { priority: p }),
  })),
)

// Labels
const allLabels = computed(() => [...new Set(state.tasks.flatMap((x) => x.labels))].sort())
const labelOptions = computed(() => [
  ...allLabels.value
    .filter((l) => !t.value.labels.includes(l))
    .map((l) => ({ label: l, onClick: () => updateTask(t.value.id, { labels: [...t.value.labels, l] }) })),
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
  if (v && !t.value.labels.includes(v)) updateTask(t.value.id, { labels: [...t.value.labels, v] })
  newLabel.value = null
}
const labelMenu = (l: string) => [
  { label: `Remove “${l}”`, icon: 'lucide-x', onClick: () => updateTask(t.value.id, { labels: t.value.labels.filter((x: string) => x !== l) }) },
]

// Prompt dialog for: new label, link
const promptOpen = ref(false)
const promptKind = ref<'label' | 'link'>('label')
const PROMPTS = {
  label: { title: 'New label', label: 'Label', placeholder: 'Research', confirm: 'Add label', multiline: false },
  link: { title: 'Add link', label: 'Link', placeholder: 'https://figma.com/…', confirm: 'Add link', multiline: false },
}
const prompt = computed(() => PROMPTS[promptKind.value])
function openPrompt(k: 'label' | 'link') {
  promptKind.value = k
  promptOpen.value = true
}
function onPrompt(v: string) {
  if (promptKind.value === 'label') updateTask(t.value.id, { labels: [...t.value.labels, v] })
  if (promptKind.value === 'link') {
    addAttachment(t.value.id, linkToAttachment(v))
  }
}

// Files
const fileInput = ref<HTMLInputElement | null>(null)
function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  files.forEach((f) => addAttachment(t.value.id, fileToAttachment(f)))
  ;(e.target as HTMLInputElement).value = ''
  if (files.length) toast.success(files.length === 1 ? `${files[0].name} added.` : `${files.length} files added.`)
}

const addingChecklist = ref(false)

function onTileUploaded(a: any) {
  addAttachment(t.value.id, a)
  toast.success(`${a.name} added.`)
}
function copyLink() {
  navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/?task=${t.value.id}`)
  toast.success('Link copied.')
}

// Tabs: open on Checklist when there's work to tick off, otherwise Comments.
const tab = ref('comments')
function pickTab() {
  const x = t.value
  if (!staff.value) return void (tab.value = 'activity')
  tab.value = x && (x.changesRequested || (x.checklist.length && x.status !== 'done')) ? 'checklist' : 'comments'
}
watch(() => state.ui.focusComment, () => (tab.value = 'comments'))
const tabs = computed(() => {
  const x = t.value
  if (!x) return []
  const done = x.checklist.filter((c: any) => c.done).length
  // Customers talk to the team in Messages, so they get Activity only
  if (!staff.value) return [{ key: 'activity', label: 'Activity', icon: 'lucide-history', count: '' }]
  return [
    { key: 'checklist', label: 'Subtasks', icon: 'lucide-list-checks', count: x.checklist.length ? `${done}/${x.checklist.length}` : '' },
    { key: 'files', label: 'Files', icon: 'lucide-paperclip', count: openAttachments.value.length ? String(openAttachments.value.length) : '' },
    { key: 'comments', label: 'Comments', icon: 'lucide-message-square', count: x.comments.length ? String(x.comments.length) : '' },
    { key: 'activity', label: 'Activity', icon: 'lucide-history', count: '' },
  ]
})
// Properties, in the same order as New task. Only the rows that apply.
const fields = computed(() => {
  const x = t.value
  if (!x) return []
  return [
    { key: 'status', label: 'Status', icon: 'lucide-circle-dashed' },
    // Personal projects: it's always you, so no Assigned to row
    isSolo(x.space)
      ? null
      : team.value.length
      ? { key: 'team', label: 'Assigned to', icon: 'lucide-users', wide: true }
      : x.space !== 'general' // My tasks are personal: never assigned, so no Assignee row
        ? { key: 'assignee', label: 'Assignee', icon: 'lucide-user' }
        : null,
    { key: 'start', label: 'Start date', icon: 'lucide-calendar-arrow-up' },
    { key: 'due', label: 'Due date', icon: 'lucide-calendar' },
    // Frappe Live: no priority (order is the priority). Who does the step instead. Labels stay with the team.
    x.space !== 'general' ? { key: 'owner', label: 'Done by', icon: 'lucide-user-round-check' } : null,
    staff.value ? { key: 'labels', label: 'Labels', icon: 'lucide-tag', wide: true } : null,
    // Where it belongs: its project, or your own My tasks (no project) in Personal or a company workspace.
    // Moving it is in ⋯ → Move to.
    { key: 'project', label: 'Belongs to', icon: x.space === 'general' ? 'lucide-circle-check-big' : 'lucide-folder' },
    x.space !== 'general' ? { key: 'milestone', label: 'Milestone', icon: 'lucide-flag-triangle-right' } : null,
  ].filter(Boolean) as any[]
})

// ⋯ menu: only what you're allowed to do
const spaces = computed(() => [{ id: 'general', name: 'My tasks' }, ...myProjects.value.map((p) => ({ id: p.id, name: p.name }))])
const menu = computed(() => {
  const x = t.value
  if (!x) return []
  const members = membersOf(x.space, wsPeople.value, project).filter((m: string) => m !== x.assignee)
  const items: any[] = []
  if (can.suggest(x)) items.push({ label: 'Request a change', icon: 'lucide-message-circle-question', onClick: () => (state.ui.suggestTask = x.id) })
  if (can.move(x))
    items.push({
      label: 'Move to',
      icon: 'lucide-folder-input',
      submenu: spaces.value
        .filter((s) => s.id !== x.space)
        .map((s) => {
          // Into My tasks only when nobody else is on it (it becomes yours alone)
          const ok = s.id === 'general' ? !team.value.length && [x.assignee].filter(Boolean).every((p: string) => p === state.me) : [x.assignee].filter(Boolean).every((p: string) => isMember(s.id, p))
          return {
            label: s.name,
            disabled: !ok,
            description: ok ? undefined : s.id === 'general' ? 'Someone else is on it' : 'The assignee is not in this project',
            onClick: () => {
              moveTask(x.id, s.id)
              toast.success(`Moved to ${s.name}.`)
            },
          }
        }),
    })
  items.push({
    label: muted.value ? 'Unmute' : 'Mute',
    icon: muted.value ? 'lucide-bell' : 'lucide-bell-off',
    onClick: () => {
      toggleMute(x.id)
      toast.success(muted.value ? "Muted. You'll still get anything that needs you." : 'Unmuted.')
    },
  })
  // Copy link lives here (no link button in the header)
  items.push({ label: 'Copy link', icon: 'lucide-link', onClick: copyLink })
  if (can.remove(x))
    items.push({
      label: 'Delete',
      icon: 'lucide-trash-2',
      theme: 'red',
      onClick: () => {
        deleteTask(x.id)
        close()
        toast.success('Task deleted.', { duration: 8000, action: { label: 'Undo', onClick: () => restoreDeleted(x.id) } })
      },
    })
  return items
})

// The milestone's team (project tasks in a milestone). Empty = the task's own assignee is used.
const team = computed(() => (t.value && t.value.space !== 'general' ? milestoneTeam(t.value.space, t.value.milestone) : []))
const fromWho = computed(() => {
  const x = t.value
  if (!x?.assignedBy || x.assignedBy === x.assignee) return ''
  return `from ${personName(x.assignedBy)}`
})
// Milestone (project tasks only). Anyone who can edit the task can move it between milestones.
const currentMilestone = computed(() => (t.value ? milestone(t.value.space, t.value.milestone || null) : null))
const milestoneOptions = computed(() => {
  const x = t.value
  if (!x || x.space === 'general') return []
  return [
    ...milestonesOf(x.space).map((m: any) => ({
      label: m.name,
      selected: x.milestone === m.id,
      onClick: () => {
        setTaskMilestone(x.id, m.id)
        toast.success(`Moved to ${m.name}.`)
      },
    })),
    // (No "No milestone": a project task always sits in a milestone, Round 253)
  ]
})
const spaceLink = computed(() => (t.value?.space === 'general' ? '/general' : `/p/${t.value?.space}`))
// Files already shown in a pending review card aren't repeated below.
const openAttachments = computed(() => {
  const x = t.value
  if (!x) return []
  const r = x.rounds[x.rounds.length - 1]
  const inCard = r && !r.decision ? r.attachments : []
  return x.attachments.filter((a: any) => !inCard.includes(a.id))
})
const joinPending = computed(() => (t.value && t.value.space !== 'general' ? myJoinRequest(t.value.space) : null))
function askToJoin() {
  requestToJoin(t.value.space, `I'd like to see “${t.value.title}”.`)
  toast.success(`Request sent to the ${spaceName(t.value.space)} lead.`)
}

watch(
  [id, () => state.me],
  () => {
    editingTitle.value = false
    editingDesc.value = false
    addingChecklist.value = false
    pickTab()
    if (viewState.value !== 'ok') return
    const key = `${state.me}:${id.value}`
    lastSeen.value = state.seen[key] || null
    state.seen[key] = now()
    markTaskRead(id.value)
  },
  { immediate: true },
)
</script>

<template>
  <!-- Dock: a column on the right, the page shrinks beside it. Modal (too narrow to dock): centred over a dim page. -->
  <div :class="panelMode === 'modal' ? 'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4 sm:p-6' : 'contents'" @click.self="close">
  <aside
    ref="panelBox"
    tabindex="-1"
    class="z-30 flex flex-col bg-surface-base outline-none"
    :class="
      panelMode === 'full'
        ? 'fixed inset-0'
        : panelMode === 'dock'
          ? 'fixed inset-y-0 right-0 border-l border-outline-gray-2'
          : 'relative h-[min(85vh,760px)] max-w-full overflow-hidden rounded-6 shadow-2xl'
    "
    :style="panelMode === 'dock' ? { width: `${panelWidth}px` } : panelMode === 'modal' ? { width: `${modalWidth}px` } : undefined"
    role="dialog"
    :aria-modal="panelMode === 'dock' ? 'false' : 'true'"
    :aria-label="t?.title || 'Task'"
  >
    <!-- Header -->
    <header class="flex h-12 shrink-0 items-center gap-1 border-b border-outline-gray-1 px-3">
      <!-- No breadcrumb or ID: project and status are right below, in the properties. (Phones: a centred modal too, so × like desktop) -->
      <span v-if="viewState === 'ok' && muted" class="ml-1.5 lucide-bell-off size-3.5 text-ink-gray-4" aria-label="Muted" />
      <div class="ml-auto flex items-center gap-1">
        <Dropdown v-if="viewState === 'ok'" :options="menu" align="end">
          <Button variant="ghost" icon="lucide-ellipsis" aria-label="More actions" />
        </Dropdown>
        <Button variant="ghost" icon="lucide-x" aria-label="Close" @click="close" />
      </div>
    </header>

    <!-- Edge states -->
    <div v-if="viewState === 'missing'" class="flex-1 overflow-y-auto px-5">
      <EmptyState icon="lucide-search-x" title="This task doesn't exist" text="It may have been deleted, or the link is wrong.">
        <Button variant="subtle" label="Go to My tasks" @click="router.push('/')" />
      </EmptyState>
    </div>
    <div v-else-if="viewState === 'deleted'" class="flex-1 overflow-y-auto px-5">
      <EmptyState
        icon="lucide-trash-2"
        title="This task was deleted"
        :text="`${personName(t.deletedBy)} deleted “${t.title}”. Deleted tasks stay for 30 days.`"
      >
        <Button v-if="can.remove(t)" variant="subtle" label="Restore task" @click="restoreDeleted(t.id)" />
        <Button v-else variant="subtle" label="Go to My tasks" @click="router.push('/')" />
      </EmptyState>
    </div>
    <div v-else-if="viewState === 'noaccess'" class="flex-1 overflow-y-auto px-5">
      <EmptyState
        icon="lucide-lock"
        title="You can't see this task"
        :text="t.space === 'general' ? 'It is in someone else’s private space.' : `It is in ${spaceName(t.space)}, and you're not a member yet.`"
      >
        <template v-if="t.space !== 'general'">
          <Button v-if="joinPending" variant="subtle" label="Request sent" disabled />
          <Button v-else variant="subtle" label="Request to join" @click="askToJoin" />
        </template>
        <Button variant="ghost" label="Go to My tasks" @click="router.push('/')" />
      </EmptyState>
    </div>

    <!-- Task: the shared layout places these pieces (components/TaskLayout.vue) -->
    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <TaskLayout v-model:tab="tab" :fields="fields" :sections="tabs">
        <!-- Title -->
        <template #title>
          <form v-if="editingTitle" @submit.prevent="saveTitle">
            <TextInput
              v-model="titleDraft"
              size="lg"
              variant="ghost"
              class="-mx-2 [&_input]:text-2xl [&_input]:font-semibold"
              aria-label="Title"
              autofocus
              @blur="saveTitle"
              @keydown.esc.stop="editingTitle = false"
            />
          </form>
          <h2
            v-else
            class="-mx-2 rounded-4 px-2 py-0.5 text-2xl-semibold text-ink-gray-9"
            :class="[briefEditable ? 'cursor-text hover:bg-surface-gray-2' : '', t.status === 'cancelled' ? 'text-ink-gray-5' : '']"
            :tabindex="briefEditable ? 0 : -1"
            @click="editTitle"
            @keydown.enter.prevent="editTitle"
          >
            {{ t.title }}
          </h2>
        </template>

        <!-- Properties (which ones show: `fields` above) -->
        <template #field-status><StatusControl :task="t" show-label /></template>
        <!-- Project task in a milestone with a team: the team does it (no assignee of its own). Click the avatars for everyone. -->
        <template #field-team>
          <span class="flex flex-wrap items-center gap-1.5 px-1.5">
            <!-- Avatars only, like everywhere else; click them for the names -->
            <PeopleStack :people="team" :max="4" :title="`${currentMilestone?.name || 'Milestone'} team`" />
          </span>
        </template>
        <!-- Home (General) tasks are yours: no Assignee row. It shows only when someone else does it. -->
        <template #field-assignee>
          <AssigneePicker :task="t" :disabled="!can.assign(t)" />
          <span v-if="fromWho" class="text-sm text-ink-gray-5">{{ fromWho }}</span>
        </template>
        <!-- Start date: optional. The Timeline draws the bar from here (otherwise from when the task was added). -->
        <template #field-start>
            <DatePicker v-if="can.editDue(t)" v-model="startDate" placeholder="Not set">
              <template #trigger="{ open, setOpen }">
                <Button variant="ghost" icon-left="lucide-calendar" @click="setOpen(!open)">
                  <span v-if="t.start" class="text-ink-gray-8">{{ dayjs(t.start).format('ddd D MMM') }}</span>
                  <span v-else class="text-ink-gray-5">Not set</span>
                </Button>
              </template>
            </DatePicker>
            <span v-else class="px-1.5 text-sm" :class="t.start ? 'text-ink-gray-8' : 'text-ink-gray-4'">{{ t.start ? dayjs(t.start).format('ddd D MMM') : 'Not set' }}</span>
        </template>
        <template #field-due>
          <DatePicker v-if="can.editDue(t)" v-model="due" placeholder="Not set">
            <template #trigger="{ open, setOpen }">
              <Button variant="ghost" icon-left="lucide-calendar" @click="setOpen(!open)">
                <DueLabel v-if="t.due" :due="t.due" :status="t.status" />
                <span v-else class="text-ink-gray-5">Not set</span>
              </Button>
            </template>
          </DatePicker>
          <!-- Not the assigner: date is read-only. The assignee can propose a new one. -->
          <span v-else class="inline-flex items-center gap-1">
            <!-- Read-only for you: just the date. Asking for a new one is in ⋯ → Request a change (it posts a comment). -->
            <Tooltip :text="`Only ${personName(t.assignedBy || t.createdBy)} can change the due date. To ask for a new one, use ⋯ → Request a change.`">
              <span class="inline-flex items-center gap-1.5 px-1.5 py-1 text-sm">
                <span class="lucide-calendar size-4 text-ink-gray-5" aria-hidden="true" />
                <DueLabel v-if="t.due" :due="t.due" :status="t.status" />
                <span v-else class="text-ink-gray-5">No due date</span>
              </span>
            </Tooltip>
          </span>
        </template>
        <template #field-owner>
            <Dropdown v-if="staff" :options="ownerOptions">
              <Button variant="ghost" :label="t.owner === 'customer' ? 'Customer' : 'Team'" />
            </Dropdown>
            <span v-else class="px-1.5 text-base text-ink-gray-8">{{ t.owner === 'customer' ? 'You' : 'Frappe team' }}</span>
        </template>
        <template #field-labels>
            <template v-for="l in t.labels" :key="l">
              <Dropdown v-if="editable" :options="labelMenu(l)">
                <button type="button" class="rounded-1"><Badge :variant="labelVariant()" :theme="toneFor('label', l)" :label="l" /></button>
              </Dropdown>
              <Badge v-else :variant="labelVariant()" :theme="toneFor('label', l)" :label="l" />
            </template>
            <span v-if="editable && newLabel !== null" ref="newLabelBox" class="inline-flex">
              <TextInput v-model="newLabel" size="sm" class="w-36" aria-label="New label" placeholder="Label name" maxlength="30" @keydown.enter.prevent="saveNewLabel" @keydown.esc.stop.prevent="newLabel = null" @blur="saveNewLabel" />
            </span>
            <Dropdown v-else-if="editable" :options="labelOptions">
              <!-- No labels yet: "Not set" (the row already says Labels); with labels, a small + to add one more -->
              <Button v-if="t.labels.length" variant="ghost" size="sm" icon="lucide-plus" aria-label="Add label" />
              <Button v-else variant="ghost" aria-label="Add label"><span class="text-ink-gray-5">Not set</span></Button>
            </Dropdown>
            <span v-else-if="!t.labels.length" class="px-1.5 text-sm text-ink-gray-4">Not set</span>
        </template>
        <template #field-project>
            <RouterLink :to="spaceLink" class="inline-flex min-w-0 items-center gap-1.5 rounded-4 px-1.5 py-1 text-base text-ink-gray-8 hover:bg-surface-gray-3">
              <span :class="t.space === 'general' ? 'lucide-circle-check-big' : 'lucide-folder'" class="size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
              <span :class="t.space === 'general' ? 'shrink-0' : 'truncate'">{{ t.space === 'general' ? 'My tasks' : spaceName(t.space) }}</span>
              <span v-if="t.space === 'general'" class="truncate text-ink-gray-5">· {{ ownWsName(t) }}, no project</span>
            </RouterLink>
        </template>
        <template #field-milestone>
            <Dropdown v-if="editable && milestoneOptions.length > 1" :options="milestoneOptions">
              <Button variant="ghost" :label="currentMilestone ? currentMilestone.name : 'Not set'" icon-right="lucide-chevron-down" />
            </Dropdown>
            <span v-else class="px-1.5 text-base" :class="currentMilestone ? 'text-ink-gray-8' : 'text-ink-gray-4'">
              {{ currentMilestone ? currentMilestone.name : 'Not set' }}
            </span>
        </template>

        <!-- Under the description: the one main action, and anything that needs a look -->
        <template #notices>
        <div class="space-y-3">

        <!-- (No suggestion card: asking for a new date, a handover or more info is a comment, in Comments) -->

        <!-- First task from an invite: one-time hint -->
        <HintCard
          v-if="state.hints.submitHint === state.me && t.assignee === state.me && (can.start(t) || can.submit(t))"
          icon="lucide-send"
          :text="`Change the Status as you go. ${personName(t.assignedBy)} is notified when it's done.`"
          @dismiss="state.hints.submitHint = null"
        />

        <!-- The one main action -->
        <ReviewBar :task="t" />
        </div>
        </template>

        <!-- Description: plain text under the title (no box, no heading), click to edit -->
        <template #description>
          <div v-if="editingDesc" class="space-y-2">
            <Textarea v-model="descDraft" :rows="5" aria-label="Description" placeholder="What needs to be done, and why?" />
            <div class="flex gap-2">
              <Button variant="subtle" label="Save" @click="saveDesc" />
              <Button variant="ghost" label="Cancel" @click="editingDesc = false" />
            </div>
          </div>
          <div
            v-else
            class="-mx-2 rounded-4 px-2 py-1"
            :class="briefEditable ? 'cursor-text hover:bg-surface-gray-2' : ''"
            :tabindex="briefEditable ? 0 : -1"
            aria-label="Description"
            @click="briefEditable && editDesc()"
            @keydown.enter.prevent="briefEditable && editDesc()"
          >
            <div v-if="t.description" class="space-y-2 text-p-base text-ink-gray-8" v-html="t.description" />
            <p v-else class="text-p-base text-ink-gray-4">{{ briefEditable ? 'Add a description…' : 'No description.' }}</p>
          </div>
        </template>

        <!-- Subtasks · Files · Comments · Activity -->
        <template #section-checklist>
          <ChecklistBlock :task="t" :editable="editable && t.status !== 'done'" :can-tick="can.tick(t)" :adding="true" bare />
        </template>
        <template #section-files>
          <AttachmentTiles
            :items="openAttachments"
            :editable="editable"
            @remove="(aid) => removeAttachment(t.id, aid)"
            @uploaded="onTileUploaded"
            @link="openPrompt('link')"
          />
          <p v-if="!openAttachments.length && !editable" class="text-p-sm text-ink-gray-5">No files.</p>
        </template>
        <template #section-comments><CommentThread :task="t" :last-seen="lastSeen" bare /></template>
        <template #section-activity><ActivityLog :items="t.activity" bare /></template>
      </TaskLayout>
    </div>

    <PromptDialog
      v-model:open="promptOpen"
      :title="prompt.title"
      :label="prompt.label"
      :placeholder="prompt.placeholder"
      :confirm-label="prompt.confirm"
      :multiline="prompt.multiline"
      @confirm="onPrompt"
    />
  </aside>
  </div>
</template>
