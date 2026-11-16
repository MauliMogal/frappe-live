<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import { Button, Select, Checkbox, Switch, Badge, Avatar, TabButtons, toast } from 'frappe-ui'
import GithubProjectImport from './GithubProjectImport.vue'
import { state, project, milestonesOf, saveMilestone, setMilestonePeople, milestoneTeam, addTask, person, personName, isMember } from '../lib/store'
import { github, connectGithub, disconnectGithub, REPOS } from '../lib/github'
import GithubMark from './GithubMark.vue'

// Import from GitHub, inside the Import window (also opened by the GitHub button in New milestone).
// Connect once → pick a repository → its GitHub milestones become milestones here, their issues become tasks.
// A milestone with the same name is reused. Issue assignees who are in the project join the milestone's team.
// "Keep in sync" connects the repo: new and closed issues show up here (simulated).
// Two kinds (Round 237): a GitHub Project (the board: Status, iterations, drafts; GithubProjectImport.vue, the default)
// or a Repository (its milestones and issues, below). Into My tasks ('general'): GitHub Project only.
const props = defineProps<{ pid: string }>()
const emit = defineEmits<{ (e: 'done'): void }>()
const kind = ref<'project' | 'repo'>('project')
const KINDS = [
  { label: 'GitHub Project', value: 'project' },
  { label: 'Repository', value: 'repo' },
]

const repo = ref('')
const onlyOpen = ref(true)
const label = ref('all')
const sync = ref(true)
const skip = ref<Record<string, boolean>>({})

const repoOptions = REPOS.map((r) => ({ label: r.name, value: r.name }))
watch(
  () => props.pid,
  () => {
    repo.value = (REPOS.find((r) => r.project === props.pid) || REPOS[0]).name
    if (props.pid === 'general') kind.value = 'project'
  },
  { immediate: true },
)
const r = computed(() => REPOS.find((x) => x.name === repo.value)!)
const labelOptions = computed(() => [
  { label: 'All labels', value: 'all' },
  ...[...new Set(r.value.milestones.flatMap((m) => m.issues.flatMap((x) => x.labels)))].sort().map((l) => ({ label: l, value: l })),
])
watch(repo, () => {
  label.value = 'all'
  skip.value = {}
})

const existing = (title: string) => milestonesOf(props.pid).find((m: any) => m.name.toLowerCase() === title.toLowerCase())
const groups = computed(() =>
  r.value.milestones
    .map((m) => ({ ...m, issues: m.issues.filter((x) => (!onlyOpen.value || x.open) && (label.value === 'all' || x.labels.includes(label.value))), match: existing(m.title) }))
    .filter((m) => m.issues.length),
)
const picked = computed(() => groups.value.filter((g) => !skip.value[g.title]))
const taskCount = computed(() => picked.value.reduce((n, g) => n + g.issues.length, 0))
const knownPerson = (login: string | null) => (login && person(login) && isMember(props.pid, login) ? login : null)

function run() {
  if (!taskCount.value) return
  let made = 0
  picked.value.forEach((g) => {
    const mid = g.match ? g.match.id : saveMilestone(props.pid, { name: g.title, due: g.due })
    const people = [...new Set(g.issues.map((x) => knownPerson(x.assignee)).filter(Boolean))] as string[]
    if (people.length) setMilestonePeople(props.pid, mid, [...new Set([...milestoneTeam(props.pid, mid), ...people])])
    g.issues.forEach((x) => {
      addTask({
        title: x.title,
        space: props.pid,
        milestone: mid,
        assignee: null,
        priority: null,
        labels: x.labels,
        description: `<p>From GitHub: ${r.value.name}#${x.number}</p>`,
      })
      made++
    })
  })
  const p = project(props.pid)
  if (sync.value && p) p.github = { repo: r.value.name, sync: true }
  toast.success(`Imported ${made} ${made === 1 ? 'task' : 'tasks'} from ${r.value.name}${sync.value ? '. Kept in sync.' : '.'}`)
  emit('done')
}
</script>

<template>
  <!-- Not connected yet -->
  <div v-if="!github.connected" class="flex flex-col items-center gap-3 rounded-5 border border-dashed border-outline-gray-3 px-6 py-8 text-center">
    <span class="flex size-10 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 [&_svg]:size-5"><GithubMark /></span>
    <div>
      <p class="text-base-medium text-ink-gray-9">Connect GitHub</p>
      <p class="mt-1 max-w-sm text-p-sm text-ink-gray-6">Bring in a GitHub Project (its items, statuses and iterations) or a repository's milestones and issues. Tasks asks GitHub to read your projects and issues; nothing is changed there.</p>
    </div>
    <Button variant="solid" theme="gray" label="Connect GitHub" :loading="github.connecting" @click="connectGithub">
      <template #prefix><GithubMark /></template>
    </Button>
  </div>

  <!-- Connected -->
  <div v-else class="space-y-4">
    <div class="flex items-center gap-2 text-sm">
      <span class="text-ink-gray-7"><GithubMark /></span>
      <span class="text-ink-gray-7">Connected as <span class="text-ink-gray-9">@{{ github.account }}</span></span>
      <Button class="ml-auto" variant="ghost" size="sm" label="Disconnect" @click="disconnectGithub" />
    </div>
    <TabButtons v-if="pid !== 'general'" v-model="kind" :options="KINDS" aria-label="What to import" />
    <GithubProjectImport v-if="kind === 'project'" :pid="pid" @done="emit('done')" />
    <template v-else>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
      <Select v-model="repo" label="Repository" :options="repoOptions" aria-required="true" />
      <Select v-model="label" label="Label" :options="labelOptions" />
    </div>
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      <Checkbox v-model="onlyOpen" label="Only open issues" />
    </div>

    <!-- Preview: one block per GitHub milestone -->
    <div class="max-h-72 space-y-2 overflow-y-auto">
      <p v-if="!groups.length" class="rounded-5 px-3 py-6 text-center text-p-sm text-ink-gray-5 ring-1 ring-outline-gray-2">No issues match.</p>
      <section v-for="g in groups" :key="g.title" class="overflow-hidden rounded-5 ring-1 ring-outline-gray-2" :class="skip[g.title] ? 'opacity-50' : ''">
        <div class="flex items-center gap-2 bg-surface-gray-1 px-3 py-2">
          <Checkbox :model-value="!skip[g.title]" :aria-label="`Import ${g.title}`" @update:model-value="(v) => (skip[g.title] = !v)" />
          <span class="lucide-flag-triangle-right size-3.5 text-ink-gray-6" aria-hidden="true" />
          <span class="truncate text-base-medium text-ink-gray-9">{{ g.title }}</span>
          <span v-if="g.due" class="text-xs tabular-nums text-ink-gray-5">due {{ dayjs(g.due).format('D MMM') }}</span>
          <Badge class="ml-auto" variant="subtle" theme="gray" :label="g.match ? 'Adds to the existing milestone' : 'New milestone'" />
          <span class="text-xs tabular-nums text-ink-gray-5">{{ g.issues.length }}</span>
        </div>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="x in g.issues" :key="x.number" class="flex items-center gap-2 px-3 py-1.5 pl-9 text-sm">
            <span class="w-12 shrink-0 tabular-nums text-ink-gray-5">#{{ x.number }}</span>
            <span class="min-w-0 flex-1 truncate text-ink-gray-8">{{ x.title }}</span>
            <Badge v-for="l in x.labels.slice(0, 2)" :key="l" variant="outline" theme="gray" :label="l" />
            <Avatar v-if="knownPerson(x.assignee)" size="xs" :label="personName(x.assignee)" />
          </li>
        </ul>
      </section>
    </div>

    <div class="flex items-start gap-3 rounded-5 bg-surface-gray-1 px-3 py-2.5">
      <Switch v-model="sync" aria-label="Keep in sync" />
      <div>
        <p class="text-sm text-ink-gray-9">Keep in sync</p>
        <p class="text-p-xs text-ink-gray-5">New issues in these GitHub milestones show up here, and closing one on GitHub marks its task done.</p>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <Button variant="ghost" label="Cancel" @click="emit('done')" />
      <Button
        variant="solid"
        theme="gray"
        :label="taskCount ? `Import ${picked.length} ${picked.length === 1 ? 'milestone' : 'milestones'} · ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}` : 'Import'"
        :disabled="!taskCount"
        @click="run"
      />
    </div>
    </template>
  </div>
</template>
