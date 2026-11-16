<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Dialog, Textarea, Select, Button, toast } from 'frappe-ui'
import dayjs from 'dayjs'
import {
  state,
  project,
  milestonesOf,
  addTask,
  addSubtask,
  saveMilestone,
  personName,
  importLines,
  parseOutline,
  noteHtml,
  myProjects,
  org,
  currentWs,
} from '../lib/store'
import { can } from '../lib/permissions'
import { design } from '../lib/look'
import { parseQuickAdd } from '../lib/quickAdd'
import PriorityIcon from './PriorityIcon.vue'
import GithubImport from './GithubImport.vue'
import GithubMark from './GithubMark.vue'
import { readImportFile, IMPORT_ACCEPT } from '../lib/importFiles'
import { TabButtons } from 'frappe-ui'

// Import: paste, or upload a file: a sheet (Excel, Numbers, CSV/TSV from Google Sheets, Todoist, Asana, Trello…, OpenDocument)
// or a document (Word, Rich Text from TextEdit, HTML, TXT, Markdown, OpenDocument); lib/importFiles.ts reads them.
// A file is turned into the same outline text, so the preview and edits work the same way.
// Sheet columns are matched by name: Milestone/Section/List/Group · Task/Title/Name/Content · Assignee/Owner/Person
// · Due/Date/Deadline · Priority (1–5, P1–P5, urgent/high/medium/low) · Notes/Description/Details (the task's description).
// Paste to import.
// Current: one task per line (bullets and numbers stripped; @name, !1–!5 and days work per line; "> …" under a task is its notes).
// Planner: "Plan from a list" — an outline becomes milestones, tasks and subtasks in one go:
//   "Deals page polish: 20 Oct" or "# Deals page polish" → milestone
//   "- Design the note dialog" → task · indented "- Empty state" → subtask
//   "  > Match the CRM pattern" → notes for the task above (its description)
// Where the tasks go (pid): a project, or 'general' = My tasks (your own tasks: always yours, never assigned, no milestones).
// Opened without one (from My tasks' empty state):
//   Personal workspace → My tasks.
//   Company workspace → "Add to" asks which of your projects (tasks there always live in a project).
const open = ref(false)
const pid = ref<string | null>(null)
const askProject = ref(false)
const inCompany = computed(() => org.on && !!currentWs.value && currentWs.value.kind !== 'personal')
// Your live projects in this workspace (myProjects is already scoped to it)
const projectChoices = computed(() => myProjects.value.filter((x) => x.status !== 'archived').map((x) => ({ label: x.name, value: x.id })))
const text = ref('')
const ms = ref('')
// Where the plan comes from: a file or pasted text, or a GitHub repository
const source = ref<'file' | 'github'>('file')
const SOURCES = [
  { label: 'File or paste', value: 'file', glyph: 'lucide-file-up' },
  { label: 'GitHub', value: 'github', glyph: 'github' },
]
watch(
  () => state.ui.importTasks,
  (v) => {
    if (!v) return
    source.value = v.source === 'github' ? 'github' : 'file'
    askProject.value = !v.pid && inCompany.value
    pid.value = v.pid || (inCompany.value ? projectChoices.value[0]?.value || null : 'general')
    ms.value = v.milestone || ''
    text.value = ''
    fileName.value = ''
    open.value = true
  },
)
watch(open, (v) => !v && (state.ui.importTasks = null))
const p = computed(() => project(pid.value))
const toMine = computed(() => pid.value === 'general')
const targetName = computed(() => (toMine.value ? 'My tasks' : p.value?.name || ''))

// ── Upload a file ──
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const dragging = ref(false)
const PRIO_WORDS: Record<string, string> = { urgent: '1', highest: '1', high: '2', medium: '3', normal: '3', low: '4', lowest: '5', someday: '5' }
function prioToken(v: string) {
  const s = v.toLowerCase().replace(/^p/, '').trim()
  const n = /^[1-5]$/.test(s) ? s : PRIO_WORDS[s]
  return n ? ` !${n}` : ''
}
function personToken(v: string) {
  const who = state.people.find((x) => x.name.toLowerCase() === v.toLowerCase() || x.id === v.toLowerCase())
  return who ? ` @${who.id}` : ''
}
// A table → outline text: "# Milestone" lines, then "- task @who date !n" under each.
function tableToOutline(lines: string[][]) {
  if (!lines.length) return ''
  const head = lines[0].map((h) => h.toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)))
  const cMs = col('milestone', 'section', 'list', 'group', 'epic', 'phase')
  let cTask = col('task', 'title', 'content', 'name')
  if (cTask === cMs) cTask = head.findIndex((h, i) => i !== cMs && ['task', 'title', 'content', 'name'].some((n) => h.includes(n)))
  const cWho = col('assignee', 'owner', 'person', 'responsible', 'assigned')
  const cDue = col('due', 'deadline', 'date')
  const cPri = col('priority')
  const cNote = col('note', 'description', 'details', 'comment')
  const hasHead = cTask >= 0
  const rows = hasHead ? lines.slice(1) : lines
  const out: string[] = []
  let lastMs = ''
  rows.forEach((r) => {
    const title = r[hasHead ? cTask : 0]
    if (!title) return
    const ms = cMs >= 0 ? r[cMs] : ''
    if (ms && ms !== lastMs) {
      out.push(`# ${ms}`)
      lastMs = ms
    }
    const who = cWho >= 0 && r[cWho] ? personToken(r[cWho]) : ''
    const due = cDue >= 0 && r[cDue] && dayjs(r[cDue]).isValid() ? ` ${dayjs(r[cDue]).format('D MMM')}` : ''
    const pri = cPri >= 0 && r[cPri] ? prioToken(r[cPri]) : ''
    out.push(`- ${title}${who}${due}${pri}`)
    if (cNote >= 0 && r[cNote]) out.push(`  > ${r[cNote]}`)
  })
  return out.join('\n')
}
async function readFile(f: File | undefined | null) {
  if (!f) return
  try {
    const r = await readImportFile(f)
    text.value = r.kind === 'table' ? tableToOutline(r.rows) : r.text
    fileName.value = f.name
    if (!text.value.trim()) toast.info(`No tasks found in ${f.name}.`)
  } catch (e: any) {
    toast.error(e?.message || `${f.name} couldn’t be read.`)
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}
const pick = (e: Event) => readFile((e.target as HTMLInputElement).files?.[0])
function drop(e: DragEvent) {
  dragging.value = false
  readFile(e.dataTransfer?.files?.[0])
}
// My tasks have no milestones: always a flat list there
const outline = computed(() => design.projAdd === 'planner' && !toMine.value)
const canMs = computed(() => !!pid.value && can.addMilestone(pid.value))
// Every project task goes into a milestone (Round 253): no "No milestone"; it starts on the project's first one
const milestoneOptions = computed(() => milestonesOf(pid.value || '').map((m: any) => ({ label: m.name, value: m.id })))
watch(milestoneOptions, (o) => !o.some((x: any) => x.value === ms.value) && (ms.value = o[0]?.value || ''), { immediate: true })
const spaces = computed(() => myProjects.value.map((x) => ({ id: x.id, name: x.name, code: x.code })))
const parse = (s: string) => parseQuickAdd(s, state.people, spaces.value)

// Flat list (Current)
const rows = computed(() => importLines(text.value).map((r) => ({ ...parse(r.text), note: r.note })))
// Outline (Planner): milestones only for people who can manage them; otherwise those lines are skipped.
const tree = computed(() =>
  parseOutline(text.value)
    .filter((r) => r.kind !== 'milestone' || canMs.value)
    .map((r) => ({ ...r, q: r.kind === 'milestone' ? null : parse(r.text), due: r.kind === 'milestone' && r.date ? parse(r.date).due : null })),
)
const counts = computed(() => {
  const c = { milestone: 0, task: 0, subtask: 0 } as Record<string, number>
  tree.value.forEach((r) => c[r.kind]++)
  return c
})
const total = computed(() => (outline.value ? tree.value.length : rows.value.length))
const summary = computed(() => {
  if (!outline.value) return `${rows.value.length} ${rows.value.length === 1 ? 'task' : 'tasks'}`
  const c = counts.value
  return [c.milestone && `${c.milestone} ${c.milestone === 1 ? 'milestone' : 'milestones'}`, c.task && `${c.task} ${c.task === 1 ? 'task' : 'tasks'}`, c.subtask && `${c.subtask} ${c.subtask === 1 ? 'subtask' : 'subtasks'}`]
    .filter(Boolean)
    .join(' · ')
})

function run() {
  if (!total.value) return
  if (toMine.value) {
    // Your own tasks: always yours (any @name is ignored), no milestone
    rows.value.forEach((r) => addTask({ title: r.title, description: noteHtml(r.note), space: 'general', assignee: state.me, due: r.due, priority: r.priority || undefined }))
  } else if (!outline.value) {
    rows.value.forEach((r) => addTask({ title: r.title, description: noteHtml(r.note), space: pid.value, assignee: r.assignee || null, due: r.due, priority: r.priority || undefined, milestone: ms.value || null }))
  } else {
    let current: string | null = ms.value || null
    let lastTask: any = null
    tree.value.forEach((r) => {
      if (r.kind === 'milestone') {
        const existing = milestonesOf(pid.value!).find((m: any) => m.name.toLowerCase() === r.text.toLowerCase())
        current = existing ? existing.id : saveMilestone(pid.value!, { name: r.text, due: r.due || null })
        lastTask = null
      } else if (r.kind === 'subtask' && lastTask) {
        addSubtask(lastTask.id, r.q!.title, { assignee: r.q!.assignee, due: r.q!.due })
      } else {
        lastTask = addTask({ title: r.q!.title, description: noteHtml(r.note), space: pid.value, assignee: r.q!.assignee || null, due: r.q!.due, priority: r.q!.priority || undefined, milestone: current || ms.value || null })
      }
    })
  }
  toast.success(`Added to ${targetName.value}: ${summary.value}.`)
  open.value = false
}
const placeholder = computed(() =>
  outline.value
    ? 'Paste a plan. For example:\n\nDeals page polish: 20 Oct\n- Design the note dialog @swarali fri\n  > Match the CRM pattern\n  - Empty state\n  - Mobile layout\n- Review copy !1\nKanban beta: 30 Oct\n- Field picker'
    : 'Paste a list, one task per line:\n- Draft the release notes @swarali fri\n  > Cover the new import\n- Update the pricing page !2\n- Check analytics events',
)
</script>

<template>
  <Dialog v-model:open="open" :title="targetName && !askProject ? `${outline ? 'Import a plan' : 'Import tasks'} · ${targetName}` : 'Import tasks'" size="xl">
    <template #default>
      <!-- Company workspace, opened from My tasks: no project to put them in yet -->
      <div v-if="askProject && !projectChoices.length" class="py-6 text-center">
        <p class="text-base text-ink-gray-8">Join a project in {{ currentWs?.name }} first.</p>
        <p class="mt-1 text-p-sm text-ink-gray-5">Tasks here always live in a project. Your own to-dos go in Personal.</p>
      </div>
      <div v-else-if="p || toMine" class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <TabButtons v-model="source" :options="SOURCES" aria-label="Import from">
            <template #prefix="{ button }"><GithubMark v-if="button.glyph === 'github'" class="!size-3.5" /><span v-else :class="button.glyph" class="size-3.5" aria-hidden="true" /></template>
          </TabButtons>
          <!-- Company My tasks: which project they go into -->
          <div v-if="askProject" class="ml-auto flex items-center gap-2">
            <span class="text-sm text-ink-gray-6">Add to</span>
            <Select v-model="pid" class="w-44" :options="projectChoices" aria-label="Project" />
          </div>
        </div>
        <GithubImport v-if="source === 'github'" :key="pid || ''" :pid="pid" @done="open = false" />
        <template v-else>
        <!-- Upload: drop a file or browse. It fills the box below, so you can check and edit before adding. -->
        <div
          class="flex items-center gap-3 rounded-5 border border-dashed px-3 py-3 transition-colors"
          :class="dragging ? 'border-outline-gray-5 bg-surface-gray-2' : 'border-outline-gray-3'"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="drop"
        >
          <span class="lucide-file-up size-5 shrink-0 text-ink-gray-6" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-ink-gray-8">{{ fileName ? `Loaded ${fileName}` : 'Drop a spreadsheet or document here' }}</p>
            <p class="text-xs text-ink-gray-5">Excel, Numbers, CSV or OpenDocument sheets · Word, Rich Text, TXT, Markdown or HTML docs</p>
          </div>
          <Button variant="subtle" size="sm" :label="fileName ? 'Choose another' : 'Choose file'" @click="fileInput?.click()" />
          <input ref="fileInput" type="file" class="hidden" :accept="IMPORT_ACCEPT" @change="pick" />
        </div>
        <p class="text-center text-xs text-ink-gray-4">or paste it</p>
        <div class="space-y-1.5">
          <Textarea v-model="text" :rows="outline ? 9 : 7" aria-label="Tasks to import" :placeholder="placeholder" />
          <p class="text-p-xs text-ink-gray-5">
            <template v-if="outline">
              A line with a colon (“Name: date”) or # is a milestone. A “-” line is a task; indent it to make it a subtask.
            </template>
            {{ toMine ? 'Add !1–!5 or a day on a line to fill it in.' : 'Add @name, !1–!5 or a day on a line to fill it in.' }}
            A “>” line under a task adds notes to it.
          </p>
        </div>
        <div v-if="!toMine" class="flex items-center gap-2">
          <span class="text-sm text-ink-gray-6">{{ outline ? 'Tasks before the first milestone go to' : 'Put them in' }}</span>
          <Select v-model="ms" class="w-56" :options="milestoneOptions" aria-label="Milestone" />
        </div>

        <!-- Preview -->
        <div v-if="total" class="max-h-64 overflow-y-auto rounded-5 border border-outline-gray-2">
          <div class="flex h-8 items-center border-b border-outline-gray-1 px-3 text-sm text-ink-gray-5">{{ summary }}</div>
          <template v-if="outline">
            <div
              v-for="(r, i) in tree"
              :key="i"
              class="flex min-h-9 items-center gap-2.5 border-b border-outline-gray-1 py-1.5 pr-3 last:border-0"
              :class="r.kind === 'milestone' ? 'bg-surface-gray-1 pl-3' : r.kind === 'task' ? 'pl-7' : 'pl-12'"
            >
              <span
                :class="r.kind === 'milestone' ? 'lucide-flag-triangle-right text-ink-gray-7' : r.kind === 'task' ? 'lucide-circle text-ink-gray-5' : 'lucide-square text-ink-gray-4'"
                class="size-3.5 shrink-0"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate" :class="r.kind === 'milestone' ? 'text-base-medium text-ink-gray-9' : 'text-base text-ink-gray-8'">{{ r.kind === 'milestone' ? r.text : r.q?.title }}</p>
                <p v-if="r.note" class="truncate text-sm text-ink-gray-5" :title="r.note">{{ r.note }}</p>
              </div>
              <template v-if="r.kind === 'milestone'">
                <span class="text-sm text-ink-gray-6">{{ r.due ? dayjs(r.due).format('D MMM') : '' }}</span>
              </template>
              <template v-else>
                <PriorityIcon v-if="r.q?.priority" :priority="r.q.priority" />
                <span v-if="r.q?.due" class="text-sm text-ink-gray-6">{{ dayjs(r.q.due).format('D MMM') }}</span>
                <span class="w-20 truncate text-right text-sm text-ink-gray-6">{{ r.q?.assignee ? personName(r.q.assignee) : r.kind === 'task' ? 'Open' : '' }}</span>
              </template>
            </div>
          </template>
          <template v-else>
            <div v-for="(r, i) in rows" :key="i" class="flex min-h-9 items-center gap-3 border-b border-outline-gray-1 px-3 py-1.5 last:border-0">
              <div class="min-w-0 flex-1">
                <p class="truncate text-base text-ink-gray-9">{{ r.title }}</p>
                <p v-if="r.note" class="truncate text-sm text-ink-gray-5" :title="r.note">{{ r.note }}</p>
              </div>
              <PriorityIcon v-if="r.priority" :priority="r.priority" />
              <span v-if="r.due" class="text-sm text-ink-gray-6">{{ dayjs(r.due).format('D MMM') }}</span>
              <span class="w-20 truncate text-right text-sm text-ink-gray-6">{{ r.assignee ? personName(r.assignee) : 'Open' }}</span>
            </div>
          </template>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" :label="total ? `Add ${summary}` : 'Add'" :disabled="!total" @click="run" />
        </div>
        </template>
      </div>
    </template>
  </Dialog>
</template>
