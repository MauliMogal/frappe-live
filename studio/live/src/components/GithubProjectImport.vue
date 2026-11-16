<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import { Button, Select, Checkbox, Switch, Badge, Avatar, toast } from 'frappe-ui'
import { state, project, milestonesOf, saveMilestone, setMilestonePeople, milestoneTeam, addTask, person, personName, isMember } from '../lib/store'
import { GH_PROJECTS } from '../lib/github'
import { STATUS, STATUS_ORDER, PRIORITY } from '../lib/meta'

// Import a GitHub Project (the board, "Projects v2"). Steps, as GitHub works:
//   1 Pick the project (organisation or user project, by number)
//   2 Match its Status options to ours (Backlog · Todo · In Progress · Done). Smart defaults; "In Review" → In Progress.
//   3 Choose what comes over: issues always; draft issues (on by default); pull requests (off: they're code, not tasks);
//     skip what's already Done (on).
//   4 Into a project: iterations (sprints) become milestones, due on the iteration's last day (an existing milestone with
//     the same name is reused); assignees who are in the project join that milestone's team.
//     Into My tasks (Personal): only items assigned to you, no milestones (My tasks have none and are never assigned).
//   5 Priority field: P0 → P1 Urgent · P1 → P2 High · P2 → P3 Medium. People are matched by GitHub username.
//   6 Keep in sync (projects only): new items and Status changes on GitHub come over. One way: edits here stay here.
const props = defineProps<{ pid: string }>()
const emit = defineEmits<{ (e: 'done'): void }>()
const toMine = computed(() => props.pid === 'general')

const which = ref('')
watch(
  () => props.pid,
  () => (which.value = String((GH_PROJECTS.find((x) => x.project === props.pid) || GH_PROJECTS[0]).number)),
  { immediate: true },
)
const gp = computed(() => GH_PROJECTS.find((x) => String(x.number) === which.value)!)
const projectOptions = GH_PROJECTS.map((x) => ({ label: `${x.owner} / ${x.title} (#${x.number})`, value: String(x.number) }))

// 2 · Status matching
const guess = (s: string) => {
  const k = s.toLowerCase()
  if (k.includes('done') || k.includes('closed') || k.includes('shipped')) return 'done'
  if (k.includes('progress') || k.includes('review') || k.includes('doing')) return 'progress'
  if (k.includes('backlog') || k.includes('later') || k.includes('icebox')) return 'backlog'
  return 'todo'
}
const statusMap = ref<Record<string, string>>({})
watch(gp, (g) => (statusMap.value = Object.fromEntries(g.statuses.map((s) => [s, guess(s)]))), { immediate: true })
const ourStatuses = STATUS_ORDER.map((s) => ({ label: STATUS[s].label, value: s }))

// 3 · What comes over
const drafts = ref(true)
const prs = ref(false)
const skipDone = ref(true)
const iterationsAsMs = ref(true)
const sync = ref(true)
const PRIO: Record<string, string> = { P0: 'p1', P1: 'p2', P2: 'p3' }
const items = computed(() =>
  gp.value.items.filter(
    (x) =>
      (x.type === 'issue' || (x.type === 'draft' && drafts.value) || (x.type === 'pr' && prs.value)) &&
      !(skipDone.value && (x.closed || statusMap.value[x.status] === 'done')) &&
      (!toMine.value || x.assignees.includes(state.me)),
  ),
)
// Preview grouped by iteration (projects with "iterations become milestones"), else one list
const groups = computed(() => {
  if (toMine.value || !iterationsAsMs.value) return [{ title: '', end: null as string | null, items: items.value }]
  const its = gp.value.iterations.map((i) => ({ title: i.title, end: i.end, items: items.value.filter((x) => x.iteration === i.title) }))
  return [...its, { title: 'No iteration', end: null, items: items.value.filter((x) => !x.iteration) }].filter((g) => g.items.length)
})
const known = (login: string) => (person(login) && !toMine.value && isMember(props.pid, login) ? login : null)
const TYPE: Record<string, string> = { issue: 'Issue', draft: 'Draft', pr: 'Pull request' }

function run() {
  if (!items.value.length) return
  let made = 0
  groups.value.forEach((g) => {
    let mid: string | null = null
    if (!toMine.value && iterationsAsMs.value && g.title && g.title !== 'No iteration') {
      const ex = milestonesOf(props.pid).find((m: any) => m.name.toLowerCase() === g.title.toLowerCase())
      mid = ex ? ex.id : saveMilestone(props.pid, { name: g.title, due: g.end })
      const people = [...new Set(g.items.flatMap((x) => x.assignees.map(known)).filter(Boolean))] as string[]
      if (people.length) setMilestonePeople(props.pid, mid!, [...new Set([...milestoneTeam(props.pid, mid!), ...people])])
    }
    g.items.forEach((x) => {
      const t = addTask({
        title: x.title,
        space: props.pid,
        milestone: mid,
        // My tasks: yours. A project: people are on the milestone, not the task (same as everywhere in a project)
        assignee: toMine.value ? state.me : null,
        priority: x.priority ? PRIO[x.priority] : null,
        labels: x.labels,
        description: `<p>From GitHub: ${gp.value.owner}/${gp.value.title}${x.number ? ` · ${x.repo}#${x.number}` : ' · draft issue'}</p>`,
      })
      if (t) {
        t.status = statusMap.value[x.status] || 'todo'
        if (t.status === 'done') t.doneAt = new Date().toISOString()
      }
      made++
    })
  })
  const p = project(props.pid)
  if (!toMine.value && sync.value && p) p.github = { ...(p.github || {}), project: `${gp.value.owner}#${gp.value.number}`, sync: true }
  toast.success(`Imported ${made} ${made === 1 ? 'task' : 'tasks'} from ${gp.value.title}${!toMine.value && sync.value ? '. Kept in sync.' : '.'}`)
  emit('done')
}
</script>

<template>
  <div class="space-y-5">
    <!-- 1 · Which project -->
    <Select v-model="which" label="GitHub project" :options="projectOptions" aria-required="true" />

    <!-- 2 · Status matching -->
    <section>
      <p class="text-sm text-ink-gray-7">Match its statuses</p>
      <div class="mt-2 divide-y divide-outline-gray-1 rounded-5 border border-outline-gray-2">
        <div v-for="s in gp.statuses" :key="s" class="flex items-center gap-3 px-3 py-1.5">
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">{{ s }}</span>
          <span class="lucide-arrow-right size-3.5 text-ink-gray-4" aria-hidden="true" />
          <Select v-model="statusMap[s]" class="w-40" :options="ourStatuses" :aria-label="`${s} becomes`" />
        </div>
      </div>
    </section>

    <!-- 3 · What comes over -->
    <section class="space-y-2">
      <p class="text-sm text-ink-gray-7">Bring in</p>
      <div class="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox :model-value="true" disabled label="Issues" />
        <Checkbox v-model="drafts" label="Draft issues" />
        <Checkbox v-model="prs" label="Pull requests" />
        <Checkbox v-model="skipDone" label="Skip what's done" />
        <Checkbox v-if="!toMine" v-model="iterationsAsMs" label="Iterations become milestones" />
      </div>
      <p class="text-p-xs text-ink-gray-5">
        <template v-if="toMine">Only items assigned to you come over, as your own tasks. </template>
        Priority P0, P1, P2 become {{ PRIORITY.p1.short }}, {{ PRIORITY.p2.short }}, {{ PRIORITY.p3.short }}. People are matched by GitHub username.
      </p>
    </section>

    <!-- Preview -->
    <div class="max-h-64 space-y-2 overflow-y-auto">
      <p v-if="!items.length" class="rounded-5 px-3 py-6 text-center text-p-sm text-ink-gray-5 ring-1 ring-outline-gray-2">
        {{ toMine ? 'Nothing in this project is assigned to you.' : 'No items match.' }}
      </p>
      <section v-for="g in groups" :key="g.title || 'all'" class="overflow-hidden rounded-5 ring-1 ring-outline-gray-2">
        <div v-if="g.title" class="flex items-center gap-2 bg-surface-gray-1 px-3 py-2">
          <span class="lucide-flag-triangle-right size-3.5 text-ink-gray-6" aria-hidden="true" />
          <span class="truncate text-base-medium text-ink-gray-9">{{ g.title }}</span>
          <span v-if="g.end" class="text-xs tabular-nums text-ink-gray-5">due {{ dayjs(g.end).format('D MMM') }}</span>
          <span class="ml-auto text-xs tabular-nums text-ink-gray-5">{{ g.items.length }}</span>
        </div>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="x in g.items" :key="x.title" class="flex items-center gap-2 px-3 py-1.5 text-sm" :class="g.title ? 'pl-9' : ''">
            <span class="w-14 shrink-0 tabular-nums text-ink-gray-5">{{ x.number ? `#${x.number}` : TYPE[x.type] }}</span>
            <span class="min-w-0 flex-1 truncate text-ink-gray-8">{{ x.title }}</span>
            <Badge variant="subtle" theme="gray" :label="STATUS[statusMap[x.status]]?.label" />
            <Avatar v-for="a in x.assignees.map(known).filter(Boolean).slice(0, 1)" :key="a" size="xs" :label="personName(a)" />
          </li>
        </ul>
      </section>
    </div>

    <div v-if="!toMine" class="flex items-start gap-3 rounded-5 bg-surface-gray-1 px-3 py-2.5">
      <Switch v-model="sync" aria-label="Keep in sync" />
      <div>
        <p class="text-sm text-ink-gray-9">Keep in sync</p>
        <p class="text-p-xs text-ink-gray-5">New items and status changes on GitHub come over. Changes made here stay here.</p>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <Button variant="ghost" label="Cancel" @click="emit('done')" />
      <Button variant="solid" theme="gray" :label="items.length ? `Import ${items.length} ${items.length === 1 ? 'task' : 'tasks'}` : 'Import'" :disabled="!items.length" @click="run" />
    </div>
  </div>
</template>
