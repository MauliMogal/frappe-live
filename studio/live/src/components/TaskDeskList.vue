<script setup lang="ts">
import { reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from 'frappe-ui'
import { List, ListHeader, ListHeaderCell, ListGroup, ListRows, ListRow, ListCell } from 'frappe-ui/list'
import { taskPeople, milestone, isSolo } from '../lib/store'
import { STATUS } from '../lib/meta'
import { placeCell } from '../lib/place'
import StatusIcon from './StatusIcon.vue'
import PriorityIcon from './PriorityIcon.vue'
import DueLabel from './DueLabel.vue'
import PeopleStack from './PeopleStack.vue'

// Variants → "Task list" = Desk: the task list the way Frappe Desk draws a list view (the reference).
//   A grey header row, plain 44px rows with a thin line between. Every task is on the page (no page size or
//   Load more, Round 242): the page just scrolls.
// Columns: Subject · Status · Project (My tasks in a company) or Milestone (a project) · Priority · Due date,
//   then on the right: people (projects only) · ID (right-aligned) · comments.
//   (No "last updated" column, Round 241: it isn't in this variant anywhere.)
// Our own parts, not Desk's colours: status = grey badge with its coloured dot, priority = P1…P5 with its dot.
// Group by works here too: a group label row per group (none for Group by None).
// selectable (project pages): checkboxes for the bulk bar. No "like" heart (we have no likes).
type Group = { key: string; label: string; tasks: any[]; collapsed?: boolean }
const props = defineProps<{ groups: Group[]; columns: 'home' | 'project'; projectColumn?: boolean; selectable?: boolean }>()
const selection = defineModel<string[]>('selection', { default: () => [] })
const route = useRoute()
const router = useRouter()
const active = computed({
  get: () => (route.query.task ? String(route.query.task) : undefined),
  set: (id) => id && router.push({ query: { ...route.query, task: id } }),
})

// Third column: Project (My tasks, company) or Milestone (a project). Personal My tasks: none.
const third = computed(() => (props.columns === 'project' ? 'Milestone' : props.projectColumn ? 'Project' : ''))
// People only on project lists (My tasks are all yours, so faces there say nothing)
const withPeople = computed(() => props.columns === 'project')
const cols = computed(() => ({
  base: ['minmax(0,1fr)', '7rem', '2.5rem'],
  md: ['minmax(0,1fr)', '8.5rem', ...(third.value ? ['9rem'] : []), '5.5rem', '7rem', ...(withPeople.value ? ['4.5rem'] : []), '6rem', '3rem'],
}))
const thirdText = (t: any) => (props.columns === 'project' ? (t.milestone ? milestone(t.space, t.milestone)?.name || '' : '') : placeCell(t).text)
const people = (t: any) => (withPeople.value && !isSolo(t.space) ? taskPeople(t) : [])

const closed = reactive<Record<string, boolean>>({})
const isClosed = (g: Group) => closed[g.key] ?? !!g.collapsed
const paged = computed(() => props.groups.map((g) => ({ ...g, shown: isClosed(g) ? [] : g.tasks })))
// A label row for every group, even when only one is left (e.g. after a search). Group by None: no label.
const grouped = computed(() => !(props.groups.length === 1 && props.groups[0].key === 'all'))
</script>

<template>
  <div>
    <List :columns="cols" :row-height="44" divider="full" :selectable="selectable" v-model:selection="selection" v-model:active="active">
      <!-- Same 12px sides as the rows, so the column names sit over their values -->
      <ListHeader class="rounded-4 bg-surface-gray-2 px-3">
        <ListHeaderCell>Subject</ListHeaderCell>
        <ListHeaderCell>Status</ListHeaderCell>
        <ListHeaderCell v-if="third" class="hidden md:flex">{{ third }}</ListHeaderCell>
        <ListHeaderCell class="hidden md:flex">Priority</ListHeaderCell>
        <ListHeaderCell class="hidden md:flex">Due date</ListHeaderCell>
        <ListHeaderCell v-if="withPeople" class="hidden md:flex" />
        <ListHeaderCell class="hidden justify-end md:flex">ID</ListHeaderCell>
        <ListHeaderCell />
      </ListHeader>

      <ListGroup v-for="g in paged" :key="g.key" :label="g.label" class="mt-1">
        <template v-if="grouped" #label>
          <button type="button" class="flex h-8 w-full items-center gap-1.5 px-3 text-left" :aria-expanded="!isClosed(g)" @click="closed[g.key] = !isClosed(g)">
            <span :class="isClosed(g) ? 'lucide-chevron-right' : 'lucide-chevron-down'" class="size-3.5 text-ink-gray-5" aria-hidden="true" />
            <span class="text-sm-medium text-ink-gray-8">{{ g.label }}</span>
            <span class="text-sm tabular-nums text-ink-gray-5">{{ g.tasks.length }}</span>
          </button>
        </template>
        <template v-else #label><span hidden /></template>
        <ListRows :items="g.shown" v-slot="{ item: t }">
          <ListRow :value="t.id">
            <ListCell>
              <span class="truncate text-base" :class="t.status === 'done' ? 'text-ink-gray-5' : 'text-ink-gray-9'">{{ t.title }}</span>
            </ListCell>
            <ListCell>
              <Badge variant="subtle" theme="gray" size="md" :label="STATUS[t.status]?.label">
                <template #prefix><StatusIcon :status="t.status" class="!size-3" /></template>
              </Badge>
            </ListCell>
            <ListCell v-if="third" class="hidden md:flex"><span class="truncate text-sm text-ink-gray-7">{{ thirdText(t) || (columns === 'project' ? '—' : '') }}</span></ListCell>
            <ListCell class="hidden md:flex">
              <PriorityIcon v-if="t.priority" :priority="t.priority" />
              <span v-else class="text-sm text-ink-gray-4">—</span>
            </ListCell>
            <ListCell class="hidden text-sm md:flex">
              <DueLabel v-if="t.due" :due="t.due" :status="t.status" />
              <span v-else class="text-ink-gray-4">—</span>
            </ListCell>
            <ListCell v-if="withPeople" class="hidden justify-end md:flex">
              <PeopleStack v-if="people(t).length" :people="people(t)" :max="2" size="xs" title="Assigned to" />
            </ListCell>
            <ListCell class="hidden justify-end md:flex"><span class="truncate text-sm tabular-nums text-ink-gray-5">{{ t.id }}</span></ListCell>
            <ListCell class="justify-end">
              <span class="inline-flex items-center gap-1 text-sm tabular-nums text-ink-gray-5" :aria-label="`${t.comments.length} comments`">
                <span class="lucide-message-circle size-3.5" aria-hidden="true" />{{ t.comments.length }}
              </span>
            </ListCell>
          </ListRow>
        </ListRows>
      </ListGroup>
    </List>

  </div>
</template>
