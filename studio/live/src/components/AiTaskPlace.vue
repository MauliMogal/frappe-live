<script setup lang="ts">
import { ref, computed, watch, nextTick, inject } from 'vue'
import { can } from '../lib/permissions'
import { Button, Dropdown, Avatar, Badge, Tooltip, Popover, TextInput } from 'frappe-ui'
import { state, project as findProject, milestonesOf, milestone as findMilestone, milestoneStatus, isMember, personName, inScope, inPersonal, isSolo, myWorkspaces, isWsMember, wsOf, currentWs } from '../lib/store'

// Where a suggested task goes, and who does it. Two small pickers:
//   place:  "My tasks" (your own task) or "Gameplan › Discussions v2 design" (a project milestone)
//   person: only for project tasks (My tasks are just yours); picks from that project's people
const project = defineModel<string | null>('project', { default: null })
const milestone = defineModel<string | null>('milestone', { default: null })
const person = defineModel<string | null>('person', { default: null })
// Notes (Round 254): which workspace's My tasks (Personal, or a company's own My tasks). Only used with no project.
const ws = defineModel<string | null>('ws', { default: null })
// look: how the two pickers are drawn (the logic is the same)
//   default: subtle buttons · quiet: ghost, grey · tiny: small grey chips (same size as a date chip)
//   icon: just the place icon (name in the tooltip) · text: plain words you click (dotted underline)
// only: draw just one of the two pickers (a table gives each its own column)
//   move: a ghost "Move" button (label) or just an arrow icon (no label), for moving tasks somewhere else
const props = withDefaults(defineProps<{ disabled?: boolean; quiet?: boolean; look?: 'default' | 'quiet' | 'tiny' | 'icon' | 'text' | 'move'; only?: 'place' | 'person'; label?: string }>(), { look: 'default' })
// Notes (one notebook, Round 246) list places in ALL your workspaces, under a heading each (the note's own first):
//   Personal: My tasks · your personal projects    Frappe: its projects
// Elsewhere: just the workspace you're in.
const scope = inject<any>('placeScope', null)
const allWs = computed(() => !!scope?.all)
// "My tasks" are personal tasks: they live in your Personal workspace. From a company workspace the name says so
// (under the "Personal" heading it's just My tasks).
const myLabel = computed(() => (inPersonal.value || allWs.value ? 'My tasks' : 'My tasks (Personal)'))
const kind = computed(() => (props.quiet ? 'quiet' : props.look))

// New milestones made right here (Notes → Create tasks). The panel holds them
// as drafts ({ id, pid, name }) that any task can pick; they're only created when you press Add, and only if a task
// still uses one. Only in projects where you may add milestones. No due date yet (Not set; set it on the milestone).
const drafts = inject<any>('noteDrafts', null)
const draftsOn = computed(() => !!drafts?.on.value)
const draftsOf = (pid: string) => (draftsOn.value ? drafts.list.value.filter((d: any) => d.pid === pid) : [])
const draftById = (id: string | null) => (draftsOn.value && id ? drafts.list.value.find((d: any) => d.id === id) : null)
const canNew = (p: any) => draftsOn.value && can.addMilestone(p.id)
const naming = ref<string | null>(null)
const newName = ref('')
function startNaming(p: any) {
  naming.value = p.id
  newName.value = q.value.trim()
  nextTick(() => (document.querySelector(`[data-newms="${p.id}"] input`) as HTMLInputElement | null)?.focus())
}
function createDraft(p: any) {
  const name = newName.value.trim()
  if (!name) return
  const id = drafts.add(p.id, name)
  naming.value = null
  pick(p, { id })
}

// Where it can go: My tasks, or an open milestone (not completed) in a project you're a member of (not archived or
// completed), and only milestones you're on or in projects you own (can.placeIn, Round 247).
// Compact for people in many projects (Round 247): the list starts with My tasks and one row per project; a project
// opens its milestones (‹ back). Typing searches every milestone at once, each with its project's name.
const mine = computed(() =>
  state.projects.filter((p: any) => isMember(p.id) && (allWs.value ? isWsMember(wsOf(p)) : inScope(p)) && !['archived', 'completed'].includes(p.status)),
)
const placeOpen = ref(false)
const q = ref('')
const searchBox = ref<HTMLElement | null>(null)
const openProject = ref<string | null>(null)
watch(placeOpen, (v) => {
  if (!v) return ((q.value = ''), (naming.value = null), (openProject.value = null))
  nextTick(() => searchBox.value?.querySelector('input')?.focus())
})
const groups = computed(() => {
  const s = q.value.trim().toLowerCase()
  return mine.value
    .map((p: any) => {
      const open = milestonesOf(p.id).filter((m: any) => milestoneStatus(p.id, m) !== 'reached' && can.placeIn(p.id, m.id))
      const hitProject = !s || p.name.toLowerCase().includes(s)
      const hit = (m: any) => hitProject || m.name.toLowerCase().includes(s)
      return { p, items: open.filter(hit), drafts: draftsOf(p.id).filter(hit), canNew: canNew(p) }
    })
    .filter((g) => g.items.length || g.drafts.length || g.canNew)
})
// The popover's sections: one per workspace (Notes), or just one with no heading
const wsGroups = computed(() => {
  if (!allWs.value) return [{ id: 'here', heading: '', mine: true, groups: groups.value }]
  const first = scope.first?.value
  return myWorkspaces.value
    .slice()
    .sort((a: any, b: any) => (a.id === first ? -1 : b.id === first ? 1 : 0))
    // Every workspace has your own My tasks (Round 254: a company's too, for things like a Raven post)
    .map((w: any) => ({ id: w.id, heading: w.name, mine: true, groups: groups.value.filter((g) => wsOf(g.p) === w.id) }))
    .filter((x: any) => (x.mine && showMine.value) || x.groups.length)
})
const drillGroup = computed(() => (openProject.value && !q.value.trim() ? groups.value.find((g) => g.p.id === openProject.value) || null : null))
const showMine = computed(() => !q.value.trim() || myLabel.value.toLowerCase().includes(q.value.trim().toLowerCase()))
function pickMine(wsId?: string) {
  project.value = null
  milestone.value = null
  person.value = null
  if (allWs.value && wsId) ws.value = wsId
  placeOpen.value = false
}
const wsNameOf = (id: string | null) => myWorkspaces.value.find((w: any) => w.id === id)?.name || ''
// Which My tasks is ticked (Notes: per workspace)
const mineHere = (id: string) => !project.value && (!allWs.value || ws.value === id)
function pick(p: any, m: any) {
  if (person.value && !isMember(p.id, person.value)) person.value = null
  project.value = p.id
  milestone.value = m.id
  placeOpen.value = false
}
// Enter picks the first match
function pickFirst() {
  if (showMine.value && !q.value.trim()) return pickMine(wsGroups.value[0]?.id)
  const g = groups.value[0]
  if (g) pick(g.p, g.items[0])
  else if (showMine.value) pickMine(wsGroups.value[0]?.id)
}
const msNow = computed(() => (project.value ? findMilestone(project.value, milestone.value) || draftById(milestone.value) : null))
const myHere = computed(() => (allWs.value && ws.value && myWorkspaces.value.length > 1 ? `My tasks · ${wsNameOf(ws.value)}` : myLabel.value))
const shortLabel = computed(() => (project.value ? msNow.value?.name || findProject(project.value)?.name : myHere.value))
const placeLabel = computed(() => {
  if (!project.value) return myHere.value
  const m = msNow.value
  return `${findProject(project.value)?.name}${m ? ` › ${m.name}${draftById(milestone.value) ? ' (new milestone)' : ''}` : ''}`
})
const placeIcon = computed(() => (project.value ? 'lucide-flag-triangle-right' : 'lucide-circle-check-big'))
const personMenu = computed(() =>
  (findProject(project.value)?.members || []).map((m: any) => ({
    label: m.user === state.me ? `${personName(m.user)} (you)` : personName(m.user),
    person: m.user,
    onClick: () => (person.value = m.user === state.me ? null : m.user),
  })),
)
const who = computed(() => (person.value ? personName(person.value) : 'You'))
</script>

<template>
  <!-- Place: a pop-up with a search box, My tasks, then each of your projects' open milestones -->
  <Popover v-if="only !== 'person'" v-model:open="placeOpen" trigger="manual" side="bottom" align="start" :offset="4">
    <template #trigger>
    <span class="inline-flex min-w-0" @click="!disabled && (placeOpen = !placeOpen)">
    <Button v-if="kind === 'default' || kind === 'quiet'" :variant="kind === 'quiet' ? 'ghost' : 'subtle'" size="sm" :icon-left="project ? 'lucide-folder' : 'lucide-circle-check-big'" :disabled="disabled" :aria-label="`Goes to ${placeLabel}`" :tooltip="kind === 'quiet' ? `Goes to ${placeLabel}` : undefined" :class="kind === 'quiet' ? 'text-ink-gray-6' : ''">
      <span class="truncate" :class="kind === 'quiet' ? 'max-w-[8rem]' : 'max-w-[13rem]'">{{ kind === 'quiet' ? shortLabel : placeLabel }}</span>
    </Button>
    <Button v-else-if="kind === 'move'" variant="ghost" size="sm" :disabled="disabled" :icon="label ? undefined : 'lucide-arrow-right-left'" :icon-left="label ? 'lucide-arrow-right-left' : undefined" :label="label" :tooltip="label ? undefined : 'Move to…'" :aria-label="label || `Move. Now in ${placeLabel}`" />
    <Tooltip v-else-if="kind === 'icon'" :text="`Goes to ${placeLabel}`">
      <button type="button" class="inline-flex size-6 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-2" :disabled="disabled" :aria-label="`Goes to ${placeLabel}. Change`">
        <span :class="placeIcon" class="size-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
    <button v-else-if="kind === 'text'" type="button" class="truncate rounded-1 text-ink-gray-8 underline decoration-outline-gray-3 decoration-dotted underline-offset-2 hover:decoration-ink-gray-5" :disabled="disabled" :aria-label="`Goes to ${placeLabel}. Change`" :title="placeLabel">
      {{ shortLabel }}
    </button>
    <button v-else type="button" :class="only === 'place' ? 'max-w-full' : 'max-w-[11rem]'" class="inline-flex h-6 items-center gap-1 rounded-4 px-1.5 text-xs text-ink-gray-7 hover:bg-surface-gray-2" :disabled="disabled" :aria-label="`Goes to ${placeLabel}. Change`" :title="placeLabel">
      <span :class="placeIcon" class="size-3.5 shrink-0 text-ink-gray-5" aria-hidden="true" /><span class="truncate">{{ shortLabel }}</span>
    </button>
    </span>
    </template>
    <template #default>
      <div class="w-72 rounded-5 bg-surface-modal p-1.5 shadow-xl ring-1 ring-outline-gray-1" role="dialog" aria-label="Where it goes" @click.stop>
        <div ref="searchBox" class="px-0.5 pb-1.5">
          <TextInput v-model="q" size="sm" placeholder="Search projects and milestones" aria-label="Search projects and milestones" @keydown.enter.prevent="pickFirst" @keydown.esc.stop="placeOpen = false">
            <template #prefix><span class="lucide-search size-3.5 text-ink-gray-5" aria-hidden="true" /></template>
          </TextInput>
        </div>
        <div class="max-h-72 overflow-y-auto">
          <!-- Start: My tasks, then one row per project (opens its milestones); under workspace headings in Notes -->
          <template v-if="!drillGroup && !q.trim()">
          <template v-for="x in wsGroups" :key="x.id">
          <p v-if="x.heading" class="mt-1 flex items-center gap-1.5 border-t border-outline-gray-2 px-2 pb-1 pt-2 text-sm-medium text-ink-gray-9 first:mt-0 first:border-t-0 first:pt-1">{{ x.heading }}</p>
          <button v-if="x.mine && showMine" type="button" class="flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2" @click="pickMine(x.id)">
            <span class="lucide-circle-check-big size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ myLabel }}</span>
            <span v-if="mineHere(x.id)" class="lucide-check size-4 text-ink-gray-7" aria-hidden="true" />
          </button>
          <button v-for="g in x.groups" :key="g.p.id" type="button" class="flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2" :aria-label="`${g.p.name}: pick a milestone`" @click="openProject = g.p.id">
            <span class="lucide-folder size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ g.p.name }}</span>
            <span v-if="project === g.p.id" class="max-w-[7rem] truncate text-xs text-ink-gray-5">{{ shortLabel }}</span>
            <span class="lucide-chevron-right size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
          </button>
          </template>
          </template>

          <!-- Searching: every match at once, each with its project -->
          <template v-else-if="!drillGroup">
            <template v-if="showMine">
              <button v-for="x in allWs ? wsGroups : [{ id: 'here', heading: '' }]" :key="x.id" type="button" class="flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2" @click="pickMine(x.id)">
                <span class="lucide-circle-check-big size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ myLabel }}</span>
                <span v-if="x.heading" class="max-w-[6rem] shrink-0 truncate text-xs text-ink-gray-5">{{ x.heading }}</span>
              </button>
            </template>
            <template v-for="g in groups" :key="g.p.id">
              <button v-for="m in [...g.items, ...g.drafts]" :key="m.id" type="button" class="flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2" @click="pick(g.p, m)">
                <span class="lucide-flag-triangle-right size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ m.name }}</span>
                <span class="max-w-[6rem] shrink-0 truncate text-xs text-ink-gray-5">{{ g.p.name }}</span>
              </button>
            </template>
          </template>

          <!-- A project opened: its milestones you can use, the new ones, + New milestone -->
          <section v-for="g in drillGroup ? [drillGroup] : []" :key="g.p.id" :aria-label="g.p.name">
            <button type="button" class="flex w-full items-center gap-1.5 rounded-4 px-2 py-1.5 text-left text-sm-medium text-ink-gray-9 hover:bg-surface-gray-2" @click="openProject = null">
              <span class="lucide-chevron-left size-4 shrink-0 text-ink-gray-5" aria-hidden="true" /><span class="truncate">{{ g.p.name }}</span>
            </button>
            <div class="mt-0.5 border-t border-outline-gray-1 pt-1" />
            <p v-if="!g.items.length && !g.drafts.length && !g.canNew" class="px-2 py-3 text-p-sm text-ink-gray-5">No milestones you're on.</p>
            <button v-for="m in g.items" :key="m.id" type="button" class="flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2" @click="pick(g.p, m)">
              <span class="lucide-flag-triangle-right size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ m.name }}</span>
              <span v-if="milestone === m.id" class="lucide-check size-4 text-ink-gray-7" aria-hidden="true" />
            </button>
            <!-- New milestones made in this panel (not created until Add) -->
            <button v-for="d in g.drafts" :key="d.id" type="button" class="flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2" @click="pick(g.p, d)">
              <span class="lucide-flag-triangle-right size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ d.name }}</span>
              <Badge variant="outline" theme="gray" size="sm" label="New" />
              <span v-if="milestone === d.id" class="lucide-check size-4 text-ink-gray-7" aria-hidden="true" />
            </button>
            <template v-if="g.canNew">
              <div v-if="naming === g.p.id" :data-newms="g.p.id" class="px-0.5 py-1">
                <TextInput v-model="newName" size="sm" placeholder="New milestone name · Enter" :aria-label="`New milestone in ${g.p.name}`" maxlength="120" @keydown.enter.prevent="createDraft(g.p)" @keydown.esc.stop="naming = null" />
              </div>
              <button v-else type="button" class="flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-base text-ink-gray-6 hover:bg-surface-gray-2" @click="startNaming(g.p)">
                <span class="lucide-plus size-4 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">New milestone in {{ g.p.name }}…</span>
              </button>
            </template>
          </section>
          <p v-if="q.trim() && !showMine && !groups.length" class="px-2 py-4 text-center text-p-sm text-ink-gray-5">Nothing matches “{{ q.trim() }}”.</p>
          <p v-if="!mine.length" class="px-2 pb-2 pt-3 text-p-xs text-ink-gray-5">{{ inPersonal ? 'Start a personal project to plan tasks in milestones.' : 'Join a project to send tasks to its milestones.' }}</p>
        </div>
      </div>
    </template>
  </Popover>
  <!-- Person (project tasks only) -->
  <!-- (Not in personal projects: only you work there) -->
  <Dropdown v-if="project && !isSolo(project) && only !== 'place'" :options="personMenu">
    <Button v-if="kind === 'quiet'" variant="ghost" size="sm" :disabled="disabled" :aria-label="`Who does it: ${who}`" :tooltip="`Who does it: ${who}`">
      <Avatar size="xs" :label="personName(person || state.me)" />
    </Button>
    <Button v-else-if="kind === 'default'" variant="subtle" size="sm" :disabled="disabled" aria-label="Who does it">
      <template #prefix><Avatar size="xs" :label="personName(person || state.me)" /></template>
      {{ who }}
    </Button>
    <button v-else-if="kind === 'text'" type="button" class="rounded-1 text-ink-gray-8 underline decoration-outline-gray-3 decoration-dotted underline-offset-2 hover:decoration-ink-gray-5" :disabled="disabled" :aria-label="`Who does it: ${who}. Change`">
      {{ who }}
    </button>
    <!-- tiny and icon: avatar only (name in the tooltip) -->
    <Tooltip v-else :text="`Who does it: ${who}`">
      <button type="button" class="inline-flex size-6 items-center justify-center rounded-4 hover:bg-surface-gray-2" :disabled="disabled" :aria-label="`Who does it: ${who}. Change`">
        <Avatar size="xs" :label="personName(person || state.me)" />
      </button>
    </Tooltip>
    <template #item-prefix="{ item }"><Avatar v-if="item?.person" size="xs" :label="personName(item.person)" /></template>
  </Dropdown>
</template>
