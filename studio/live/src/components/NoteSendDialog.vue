<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, provide } from 'vue'
import dayjs from 'dayjs'
import { Dialog, Button, Dropdown, TextInput, FormControl, DatePicker, toast } from 'frappe-ui'
import { useRouter } from 'vue-router'
import { Variants } from '../lib/variants'
import DesignChoice from './DesignChoice.vue'
import { design } from '../lib/look'
import { state, saveMilestone, setMilestonePeople, milestone as findMilestone, project as findProject, task as findTask, isMember, inPersonal, isSolo, wsOf, wsById, myPersonalWs, switchWorkspace, currentWs } from '../lib/store'
import { PRIORITY, PRIORITY_ORDER } from '../lib/meta'
import { can } from '../lib/permissions'
import { milestonesOf, milestoneStatus } from '../lib/store'
import { note, addSuggested, noteWs } from '../lib/notes'
import { suggestTasks } from '../lib/aiNotes'
import AiTaskPlace from './AiTaskPlace.vue'
import PriorityIcon from './PriorityIcon.vue'
import NoteTaskRow from './NoteTaskRow.vue'

// Notes → Create tasks (Round 245: redesigned from scratch). The one question this panel answers: where does each
// task go? AI suggests the tasks and a place for each; you fix what's wrong and press Add. No modes, no extra forms.
//
// A place is: My tasks (your own; from a company workspace they live in Personal) or a milestone in one of your
// projects (open ones only, in projects that aren't archived or completed). Every place picker also offers
// "+ New milestone in <project>…" (projects where you may add milestones): type a name, Enter. A new milestone is
// only made when you press Add, and only if a task still goes there; you're put on it; no due date yet.
//
// Variants → "Create tasks":
//   grouped (default): the tasks sit under where they go (My tasks · Gameplan › Discussions v2 · …). "Move all" on a
//     group moves the whole group (e.g. into a new milestone); the arrow on a row moves just that task.
//   one-place: "Add to [My tasks ▾]" on top for all of them. A task going elsewhere shows its own place under its title.
//     Changing the top moves every task that was following it; tasks you sent elsewhere stay.
//   one-by-one: one task at a time, as a card. Add or Skip, then the next. Each one is added right away.
//
// Edge cases: AI finds nothing (your lines, said so) · only some lines selected (those, no AI unless it's a paragraph)
// · tasks already made from this note (left out: "1 already added · Show") · × removes one (Undo) · nothing left
// (Add turns off) · a date after its milestone's due date (red, with the reason; allowed) · moving a task to a
// project its person isn't in (person cleared) · to My tasks (always yours) · no project you can add to (just
// My tasks) · a new milestone nobody uses (not made) · Personal workspace (no Who; places = My tasks and your
// personal projects; "Ask Ananya to…" stays your own task).
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ noteId: string | null; lines: string[]; autoAi?: boolean; panel?: boolean }>()
const router = useRouter()
const look = computed(() => design.notePanel)

// ws: which workspace's My tasks (Round 254: Personal, or a company's own My tasks); only used with no project.
// A task with no project starts in the note's own workspace (a Frappe note's "just for me" task stays in Frappe).
type Pick = { k: number; title: string; on: boolean; dup?: boolean; done?: 'added' | 'skipped'; desc: string; due: string; priority: string; person: string | null; project: string | null; milestone: string | null; ws: string | null }
let n = 0
const homeWs = () => noteWs(note(props.noteId))
const plain = (text: string): Pick => ({ k: ++n, title: text, on: true, desc: '', due: '', priority: '', person: null, project: null, milestone: null, ws: homeWs() })
// AI's tasks: just the title (its longer "why" isn't shown or saved, Round 247: it crowded the list). A milestone you
// can't put tasks in (you're not on it and don't own the project) becomes the project's first one you can, or My tasks.
function fromAi(s: any): Pick {
  let { project: pr, milestone: ms, person: who } = s
  if (pr && ms && !can.placeIn(pr, ms)) {
    ms = milestonesOf(pr).find((m: any) => milestoneStatus(pr, m) !== 'reached' && can.placeIn(pr, m.id))?.id || null
    if (!ms) (pr = null), (who = null)
  }
  return { k: ++n, title: s.title, on: true, desc: '', due: s.due || '', priority: '', person: who, project: pr, milestone: ms, ws: homeWs() }
}

const picks = ref<Pick[]>([])
const removed = ref<Pick[]>([])
const ai = ref<'off' | 'loading' | 'on' | 'none'>('off')
const chosen = computed(() => picks.value.filter((p) => p.on && !p.done && p.title.trim()))
const dups = computed(() => picks.value.filter((p) => p.dup && !p.on))

// ── New milestones (drafts until Add) ──
const newMs = ref<{ id: string; pid: string; name: string }[]>([])
let draftN = 0
provide('noteDrafts', {
  on: computed(() => true),
  list: newMs,
  add: (pid: string, name: string) => {
    const id = `draft-${++draftN}`
    newMs.value = [...newMs.value, { id, pid, name }]
    return id
  },
})
const draft = (id: string | null) => newMs.value.find((d) => d.id === id) || null
// One notebook (Round 246): places in all your workspaces, the note's own workspace first. Who shows by where a task
// goes (a team project), not by where you are: a Personal note can send a task to Frappe and pick its person.
provide('placeScope', { all: true, first: computed(() => noteWs(note(props.noteId))) })

// ── Places ──
const keyOf = (p: { project: string | null; milestone: string | null; ws?: string | null }) => (p.project ? `${p.project}|${p.milestone || ''}` : `me|${p.ws || ''}`)
// Each place says its workspace: "Personal" under My tasks, "Frappe › Gameplan" under a milestone
function placeOf(p: { project: string | null; milestone: string | null; ws?: string | null }) {
  if (!p.project) return { name: 'My tasks', sub: `${wsById(p.ws || null)?.name || 'Personal'} · only you`, icon: 'lucide-circle-check-big', isNew: false }
  const d = draft(p.milestone)
  const m = d || findMilestone(p.project, p.milestone)
  const pr = findProject(p.project)
  return { name: m?.name || pr?.name || '', sub: `${wsById(wsOf(pr))?.name || ''} › ${pr?.name || ''}`, icon: 'lucide-flag-triangle-right', isNew: !!d }
}
const limitOf = (p: Pick) => (p.project && p.milestone ? findMilestone(p.project, p.milestone)?.due || null : null)
// Moving tasks: the person goes if they aren't in the new project; My tasks are always yours
function moveTo(list: Pick[], project: string | null, milestone: string | null, ws: string | null = null) {
  list.forEach((p) => {
    p.project = project
    p.milestone = milestone
    if (!project) p.ws = ws || p.ws
    if (p.person && (!project || !isMember(project, p.person))) p.person = null
  })
}
// A group's "Move all" (and the top "Add to"): the picker sends project, then milestone. Wait for both, then move.
function mover(get: () => Pick[], after?: (pr: string | null, ms: string | null, ws: string | null) => void) {
  const to = { project: null as string | null, milestone: null as string | null, ws: null as string | null }
  let queued = false
  return (field: 'project' | 'milestone' | 'ws', v: string | null) => {
    to[field] = v
    if (field === 'project' && !v) to.milestone = null
    if (queued) return
    queued = true
    const list = get()
    queueMicrotask(() => {
      queued = false
      moveTo(list, to.project, to.milestone, to.ws)
      after?.(to.project, to.milestone, to.ws)
    })
  }
}

// ── Grouped ──
const groups = computed(() => {
  const out: { key: string; project: string | null; milestone: string | null; ws: string | null; tasks: Pick[] }[] = []
  chosen.value.forEach((p) => {
    const k = keyOf(p)
    let g = out.find((x) => x.key === k)
    if (!g) out.push((g = { key: k, project: p.project, milestone: p.milestone, ws: p.project ? null : p.ws, tasks: [] }))
    g.tasks.push(p)
  })
  return out.sort((a, b) => Number(b.key.startsWith('me|')) - Number(a.key.startsWith('me|')))
})
const movers: Record<string, any> = {}
const moveGroup = (g: any) => (movers[g.key] ||= mover(() => g.tasks))
watch(groups, () => Object.keys(movers).forEach((k) => delete movers[k]))

// ── One place ──
const main = reactive({ project: null as string | null, milestone: null as string | null, ws: null as string | null })
function setMainFromPicks() {
  // Where most of them go (ties: the first one's place)
  const count: Record<string, number> = {}
  chosen.value.forEach((p) => (count[keyOf(p)] = (count[keyOf(p)] || 0) + 1))
  const top = chosen.value.slice().sort((a, b) => count[keyOf(b)] - count[keyOf(a)])[0]
  main.project = top?.project || null
  main.milestone = top?.milestone || null
  main.ws = top && !top.project ? top.ws : homeWs()
}
// Switching to this layout with the panel open: start from where most of them go now
watch(look, (v) => v === 'onePlace' && setMainFromPicks())
let mainMover: any = null
function setMain(field: 'project' | 'milestone' | 'ws', v: string | null) {
  if (!mainMover) {
    const followers = chosen.value.filter((p) => keyOf(p) === keyOf(main))
    mainMover = mover(
      () => followers,
      (pr, ms, w) => {
        main.project = pr
        main.milestone = ms
        if (!pr && w) main.ws = w
        mainMover = null
      },
    )
  }
  mainMover(field, v)
}
const others = computed(() => chosen.value.filter((p) => keyOf(p) !== keyOf(main)).length)

// ── One by one ──
const queue = computed(() => picks.value.filter((p) => p.on && !p.dup))
const at = ref(0)
const cur = computed(() => queue.value[at.value] || null)
const addedN = computed(() => queue.value.filter((p) => p.done === 'added').length)
const prioMenu = (p: Pick) => [
  ...PRIORITY_ORDER.map((k) => ({ label: PRIORITY[k].label, priority: k, onClick: () => (p.priority = k) })),
  ...(p.priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => (p.priority = '') }] : []),
]
function addOne() {
  if (!cur.value?.title.trim()) return
  const p = cur.value
  make([p], true)
  p.done = 'added'
  at.value++
}
function skipOne() {
  if (cur.value) cur.value.done = 'skipped'
  at.value++
}

// ── Start ──
function markDups() {
  const made = (note(props.noteId)?.made || []).filter((m: any) => findTask(m.task) && !findTask(m.task).deletedAt).map((m: any) => m.line.trim().toLowerCase())
  picks.value.forEach((p) => made.includes(p.title.trim().toLowerCase()) && Object.assign(p, { on: false, dup: true }))
}
function fresh(list: Pick[]) {
  picks.value = list
  markDups()
  removed.value = []
  at.value = 0
  setMainFromPicks()
}
watch(open, (v) => v && init())
onMounted(() => open.value && init())
watch([() => props.lines.join('\n'), () => props.noteId], () => open.value && init())
function init() {
  newMs.value = []
  fresh(props.lines.map(plain))
  ai.value = 'off'
  // The whole note: AI suggests. Selected lines: kept as they are (unless it's a paragraph).
  const paragraph = props.lines.some((l) => l.length > 100 && /[.!?]\s+\S/.test(l))
  if (props.autoAi || paragraph) suggest()
}
async function suggest() {
  const nt = note(props.noteId)
  if (!nt) return
  ai.value = 'loading'
  const got = await suggestTasks(nt.body, nt.id)
  if (!open.value) return
  if (got.length) {
    fresh(got.map(fromAi))
    ai.value = 'on'
  } else ai.value = 'none'
}
function drop(p: Pick) {
  p.on = false
  removed.value = [...removed.value, p]
}
function undoDrop() {
  const p = removed.value[removed.value.length - 1]
  if (p) p.on = true
  removed.value = removed.value.slice(0, -1)
}
const showDups = () => dups.value.forEach((p) => (p.on = true))

// ── Add ──
function make(list: Pick[], quiet = false) {
  // New milestones these tasks use: made now (you're on each), then the tasks point at them
  const real: Record<string, string> = {}
  newMs.value.forEach((d) => {
    if (!list.some((p) => p.milestone === d.id)) return
    real[d.id] = saveMilestone(d.pid, { name: d.name, due: null })
    setMilestonePeople(d.pid, real[d.id], [state.me])
  })
  // Later tasks in this panel that use the same new milestone now use the real one
  picks.value.forEach((p) => p.milestone && real[p.milestone] && (p.milestone = real[p.milestone]))
  newMs.value = newMs.value.filter((d) => !real[d.id])
  const made = list.map((p) => addSuggested(props.noteId!, { ...p, person: p.project ? p.person : null, priority: p.priority || null, due: p.due || null }))
  if (quiet) return made
  const home = made.filter((t: any) => t.space === 'general').length
  const elsewhere = made.length - home
  const nNew = Object.keys(real).length
  // The link opens the place in its own workspace (switching to it if needed)
  const go = (wsId: string | null | undefined, path: any) => () => {
    if (wsId && wsId !== currentWs.value?.id) switchWorkspace(wsId)
    router.push(path)
  }
  toast.success([home && `${home} to My tasks`, elsewhere && `${elsewhere} to projects`, nNew && `${nNew} new ${nNew === 1 ? 'milestone' : 'milestones'}`].filter(Boolean).join(', ') + '.', {
    action: home
      ? { label: 'Open My tasks', onClick: go(made.find((t: any) => t.space === 'general')?.ws || myPersonalWs.value?.id, '/') }
      : { label: 'Open project', onClick: go(wsOf(findProject(made[0].space)), { path: `/p/${made[0].space}`, query: { tab: 'tasks' } }) },
  })
  return made
}
const actionLabel = computed(() => `Add ${chosen.value.length} ${chosen.value.length === 1 ? 'task' : 'tasks'}`)
function send() {
  if (!chosen.value.length) return
  make(chosen.value)
  open.value = false
}
const summary = computed(() => {
  if (ai.value === 'loading') return 'Reading your note…'
  const places = new Set(chosen.value.map(keyOf)).size
  const nNew = newMs.value.filter((d) => chosen.value.some((p) => p.milestone === d.id)).length
  return [places > 1 ? `${places} places` : chosen.value.length ? `All to ${placeOf(chosen.value[0]).name}` : '', nNew && `${nNew} new ${nNew === 1 ? 'milestone' : 'milestones'}`].filter(Boolean).join(' · ')
})
</script>

<template>
  <component
    :is="panel ? 'div' : Dialog"
    v-bind="panel ? { class: 'flex min-h-0 flex-1 flex-col' } : { open, 'onUpdate:open': (v: boolean) => (open = v), title: 'Create tasks', size: 'lg' }"
  >
    <Variants v-if="panel" name="Create tasks">
      <template #grouped><DesignChoice k="notePanel" v="grouped" /></template>
      <template #one-place><DesignChoice k="notePanel" v="onePlace" /></template>
      <template #one-by-one><DesignChoice k="notePanel" v="oneByOne" /></template>
    </Variants>

    <!-- Panel top: its name, how many, × -->
    <header v-if="panel" class="flex h-12 shrink-0 items-center gap-2 border-b border-outline-gray-1 pl-4 pr-3">
      <h2 class="text-base-semibold text-ink-gray-9">Create tasks</h2>
      <Button class="ml-auto" variant="ghost" size="sm" icon="lucide-x" aria-label="Close" @click="open = false" />
    </header>

    <div :class="panel ? 'min-h-0 flex-1 overflow-y-auto px-4 py-3' : 'space-y-3'">
      <!-- Only some lines were picked: AI can still suggest. (AI found nothing: your lines, no extra text.) -->
      <button v-if="ai === 'off'" type="button" class="mb-2 inline-flex items-center gap-1.5 text-sm text-ink-gray-7 underline underline-offset-2" @click="suggest">
        <span class="lucide-sparkles size-3.5" aria-hidden="true" />Suggest with AI
      </button>

      <!-- Thinking -->
      <div v-if="ai === 'loading'" class="space-y-4 pt-1" aria-label="Reading your note">
        <div v-for="i in 3" :key="i" class="space-y-1.5">
          <div class="h-3.5 w-2/3 animate-pulse rounded-full bg-surface-gray-2" />
          <div class="h-2.5 w-1/2 animate-pulse rounded-full bg-surface-gray-2" />
        </div>
      </div>

      <!-- ── Grouped: under where they go ── -->
      <template v-else-if="look === 'grouped' || !panel">
        <section v-for="g in groups" :key="g.key" class="mb-4 last:mb-0" :aria-label="placeOf(g).name">
          <div class="flex items-center gap-2 border-b border-outline-gray-1 pb-1.5">
            <span :class="placeOf(g).icon" class="size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <p class="flex min-w-0 items-center gap-1.5">
                <span class="truncate text-base-medium text-ink-gray-9">{{ placeOf(g).name }}</span>
                <span v-if="placeOf(g).isNew" class="shrink-0 rounded-4 border border-outline-gray-2 px-1 text-xs text-ink-gray-6">New milestone</span>
                <span class="shrink-0 text-sm tabular-nums text-ink-gray-5">{{ g.tasks.length }}</span>
              </p>
              <p class="truncate text-xs text-ink-gray-5">{{ placeOf(g).sub }}</p>
            </div>
            <AiTaskPlace :project="g.project" :milestone="g.milestone" :ws="g.ws" look="move" only="place" :label="g.tasks.length > 1 ? 'Move all' : 'Move'" @update:project="moveGroup(g)('project', $event)" @update:milestone="moveGroup(g)('milestone', $event)" @update:ws="moveGroup(g)('ws', $event)" />
          </div>
          <NoteTaskRow v-for="(p, i) in g.tasks" :key="p.k" :p="p" :index="i" :limit="limitOf(p)" place="move" class="border-b border-outline-gray-1 last:border-b-0" @drop="drop(p)" />
        </section>
      </template>

      <!-- ── One place: "Add to" for all, exceptions show their own place ── -->
      <template v-else-if="look === 'onePlace'">
        <div class="mb-2 flex items-center gap-2">
          <span class="text-sm text-ink-gray-5">Add to</span>
          <AiTaskPlace :project="main.project" :milestone="main.milestone" :ws="main.ws" only="place" @update:project="setMain('project', $event)" @update:milestone="setMain('milestone', $event)" @update:ws="setMain('ws', $event)" />
          <span v-if="others" class="ml-auto text-xs text-ink-gray-5">{{ others }} elsewhere</span>
        </div>
        <NoteTaskRow
          v-for="(p, i) in chosen"
          :key="p.k"
          :p="p"
          :index="i"
          :limit="limitOf(p)"
          :place="keyOf(p) === keyOf(main) ? 'move' : 'chip'"
          class="border-b border-outline-gray-1 last:border-b-0"
          @drop="drop(p)"
        />
      </template>

      <!-- ── One by one: a card per task ── -->
      <template v-else>
        <div v-if="cur" class="space-y-4">
          <p class="text-sm tabular-nums text-ink-gray-5">Task {{ at + 1 }} of {{ queue.length }}</p>
          <div class="space-y-1">
            <TextInput v-model="cur.title" size="lg" aria-label="Task title" maxlength="200" />
            <FormControl v-model="cur.desc" type="textarea" :rows="2" placeholder="Add a description" aria-label="Description" />
          </div>
          <dl class="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-y-2 text-base">
            <dt class="text-ink-gray-5">Goes to</dt>
            <dd class="min-w-0"><AiTaskPlace v-model:project="cur.project" v-model:milestone="cur.milestone" v-model:person="cur.person" v-model:ws="cur.ws" only="place" /></dd>
            <template v-if="cur.project && !isSolo(cur.project)">
              <dt class="text-ink-gray-5">Who</dt>
              <dd><AiTaskPlace v-model:project="cur.project" v-model:milestone="cur.milestone" v-model:person="cur.person" only="person" /></dd>
            </template>
            <dt class="text-ink-gray-5">Due date</dt>
            <dd>
              <DatePicker v-model="cur.due">
                <template #trigger="{ open: o, setOpen }">
                  <Button variant="subtle" size="sm" :label="cur.due ? dayjs(cur.due).format('ddd D MMM') : 'Not set'" :class="limitOf(cur) && cur.due && dayjs(cur.due).isAfter(dayjs(limitOf(cur)), 'day') ? 'text-ink-red-5' : ''" @click="setOpen(!o)" />
                </template>
              </DatePicker>
            </dd>
            <dt class="text-ink-gray-5">Priority</dt>
            <dd>
              <Dropdown :options="prioMenu(cur)">
                <Button variant="subtle" size="sm">
                  <template v-if="cur.priority" #prefix><PriorityIcon :priority="cur.priority" /></template>
                  {{ cur.priority ? PRIORITY[cur.priority].label : 'Not set' }}
                </Button>
                <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
              </Dropdown>
            </dd>
          </dl>
          <div class="flex justify-end gap-2 pt-2">
            <Button variant="ghost" label="Skip" @click="skipOne" />
            <Button variant="subtle" :label="at + 1 < queue.length ? 'Add and next' : 'Add'" :disabled="!cur.title.trim()" @click="addOne" />
          </div>
        </div>
        <!-- All done -->
        <div v-else class="py-10 text-center">
          <span class="lucide-circle-check-big mx-auto block size-6 text-ink-gray-5" aria-hidden="true" />
          <p class="mt-2 text-base-medium text-ink-gray-9">{{ addedN ? `${addedN} ${addedN === 1 ? 'task' : 'tasks'} added` : 'Nothing added' }}</p>
          <p class="mt-1 text-p-sm text-ink-gray-5">{{ queue.length - addedN ? `${queue.length - addedN} skipped.` : 'From this note.' }}</p>
          <Button class="mt-4" variant="subtle" label="Close" @click="open = false" />
        </div>
      </template>

      <!-- The quiet lines: nothing left · removed · already made -->
      <template v-if="ai !== 'loading' && look !== 'oneByOne'">
        <p v-if="!chosen.length" class="py-2 text-p-sm text-ink-gray-5">No tasks left to add.</p>
        <p v-if="removed.length" class="mt-2 text-xs text-ink-gray-5">{{ removed.length }} removed · <button type="button" class="text-ink-gray-8 underline underline-offset-2" @click="undoDrop">Undo</button></p>
        <p v-if="dups.length" class="mt-2 text-xs text-ink-gray-5">
          {{ dups.length }} already added from this note · <button type="button" class="text-ink-gray-8 underline underline-offset-2" @click="showDups">Show</button>
        </p>
      </template>

      <div v-if="!panel" class="flex justify-end gap-2 pt-2">
        <Button variant="ghost" label="Cancel" @click="open = false" />
        <Button variant="solid" theme="gray" :label="actionLabel" :disabled="ai === 'loading' || !chosen.length" @click="send" />
      </div>
    </div>

    <!-- Footer: where they go, and the one action (grey: "Create tasks" on the note is the page's black button) -->
    <footer v-if="panel && look !== 'oneByOne'" class="flex shrink-0 items-center gap-3 border-t border-outline-gray-1 px-4 py-2.5">
      <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-5">{{ summary }}</span>
      <Button variant="subtle" :label="actionLabel" :disabled="ai === 'loading' || !chosen.length" @click="send" />
    </footer>
  </component>
</template>
