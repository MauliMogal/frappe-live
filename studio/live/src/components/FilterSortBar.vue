<script setup lang="ts">
import { computed } from 'vue'
import { Button, Dropdown, Select, TextInput } from 'frappe-ui'
import { Variants } from '../lib/variants'
import DesignChoice from './DesignChoice.vue'
import { design } from '../lib/look'
import { statusOptions, priorityOptions, originOptions, SORTS, SORT_DIR } from '../lib/taskView'
import { personName, myProjects } from '../lib/store'

// The list toolbar, the same everywhere tasks are listed (My tasks, a project's tasks), after Frappe Desk / CRM:
//   [Search tasks] [Show ▾] [Filter ▾] [Status: Todo ×] …      [Group by … ▾] [↕ | Due date ▾] [List view ⇅]
// Left: search, the presets ("Show"), then ONE Filter menu (Round 243: the inline selects were too crowded). Each field
// is a submenu (Status ▸ Todo, In progress…; picking the ticked one again removes it). Applied filters show as small
// outline chips after it, each with × to remove; "Clear filters" at the bottom of the menu.
// Right: Group by, Sort (the arrow flips the order; the menu picks the field), the page's own buttons, then the view
// switch at the far right (slot #view). The presets are a quick-filter menu with no "Show" word (Round 253).
// Variants → "Filter bar": search (default, Round 243) | no-search (Ctrl+K only). The search matches task titles in this
// list and counts as a filter, so "No tasks match · Clear filters" empties it too; Esc clears it.
// presets: the page's ready-made views (v-model:preset). groups: what "Group by" offers (v-model is f.groupBy).
const props = withDefaults(
  defineProps<{
    people?: string[]
    labels?: string[]
    // the filters this list has, in order
    fields?: string[]
    presets?: { key: string; label: string; count?: number }[]
    groups?: { value: string; label: string }[]
    showSort?: boolean
    showGeneral?: boolean
    align?: 'start' | 'end'
  }>(),
  {
    people: () => [],
    labels: () => [],
    fields: () => ['assignee', 'status', 'priority', 'due', 'label'],
    presets: () => [],
    groups: () => [],
    showSort: true,
    showGeneral: false,
    align: 'end',
  },
)
const f = defineModel<any>({ required: true })
const preset = defineModel<string>('preset', { default: 'all' })
const withSearch = computed(() => design.taskSearch === 'on')

// ── The fields ──
const FIELDS = computed<Record<string, { label: string; any: string; options: { label: string; value: string }[] }>>(() => ({
  origin: { label: 'Tasks', any: 'All tasks', options: originOptions.filter((o) => o.value && (props.showGeneral || o.value !== 'general')) },
  space: {
    label: 'Project',
    any: 'Any project',
    options: [...(props.showGeneral ? [{ label: 'General (no project)', value: 'general' }] : []), ...myProjects.value.map((p) => ({ label: p.name, value: p.id }))],
  },
  assignee: { label: 'Assignee', any: 'Anyone', options: [{ label: 'Unassigned', value: '__none' }, ...props.people.map((p) => ({ label: personName(p), value: p }))] },
  status: { label: 'Status', any: 'Any status', options: statusOptions },
  priority: { label: 'Priority', any: 'Any priority', options: priorityOptions },
  due: {
    label: 'Due date',
    any: 'Any date',
    options: [
      { label: 'Overdue', value: 'overdue' },
      { label: 'Today', value: 'today' },
      { label: 'This week', value: 'week' },
      { label: 'No due date', value: 'none' },
    ],
  },
  label: { label: 'Label', any: 'Any label', options: props.labels.map((l) => ({ label: l, value: l })) },
}))
// A field shows only when it has something to pick (no Label when nothing has a label)
const shown = computed(() => props.fields.filter((k) => FIELDS.value[k] && FIELDS.value[k].options.length))
const valueLabel = (k: string) => FIELDS.value[k].options.find((o) => o.value === f.value[k])?.label || f.value[k]
const applied = computed(() => shown.value.filter((k) => f.value[k]))
const clearAll = () => shown.value.forEach((k) => (f.value[k] = ''))
// One menu: a submenu per field, ticked = applied
const filterMenu = computed(() => [
  ...shown.value.map((k) => ({
    label: f.value[k] ? `${FIELDS.value[k].label}: ${valueLabel(k)}` : FIELDS.value[k].label,
    submenu: FIELDS.value[k].options.map((o) => ({ label: o.label, selected: f.value[k] === o.value, onClick: () => (f.value[k] = f.value[k] === o.value ? '' : o.value) })),
  })),
  ...(applied.value.length ? [{ label: 'Clear filters', icon: 'lucide-x', onClick: clearAll }] : []),
])
const presetOptions = computed(() => props.presets.map((x) => ({ label: x.count != null && x.key !== 'all' ? `${x.label} · ${x.count}` : x.label, value: x.key })))

// ── Group by ──
const groupLabel = computed(() => props.groups.find((g) => g.value === f.value.groupBy)?.label || props.groups[0]?.label)
const groupMenu = computed(() => props.groups.map((g) => ({ label: g.label, selected: f.value.groupBy === g.value, onClick: () => (f.value.groupBy = g.value) })))

// ── Sort: the field (menu) + the order (arrow) ──
const sortOptions = computed(() =>
  Object.entries(SORTS).map(([value, label]) => ({
    label,
    selected: f.value.sort === value,
    onClick: () => {
      f.value.sort = value
      f.value.dir = SORT_DIR[value]
    },
  })),
)
const dir = computed(() => f.value.dir || SORT_DIR[f.value.sort] || 'asc')
// Say the order in the field's own words
const ORDER: Record<string, [string, string]> = {
  due: ['Soonest first', 'Latest first'],
  priority: ['P1 first', 'P5 first'],
  created: ['Oldest first', 'Newest first'],
  updated: ['Oldest first', 'Newest first'],
  title: ['A to Z', 'Z to A'],
}
const orderText = computed(() => (ORDER[f.value.sort] || ['Ascending', 'Descending'])[dir.value === 'asc' ? 0 : 1])
const flip = () => (f.value.dir = dir.value === 'asc' ? 'desc' : 'asc')
</script>

<template>
  <Variants name="Filter bar">
    <template #search><DesignChoice k="taskSearch" v="on" /></template>
    <template #no-search><DesignChoice k="taskSearch" v="off" /></template>
  </Variants>

  <div class="flex items-center gap-2">
    <!-- Left: the filters (scroll sideways if the screen is narrow) -->
    <div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
      <TextInput v-if="withSearch" v-model="f.q" type="search" class="w-44 shrink-0 lg:w-52" placeholder="Search tasks" aria-label="Search tasks" @keydown.esc="f.q = ''">
        <template #prefix><span class="lucide-search size-4 text-ink-gray-5" aria-hidden="true" /></template>
      </TextInput>
      <Dropdown v-if="presets.length" :options="presetOptions.map((o) => ({ label: o.label, selected: preset === o.value, onClick: () => (preset = o.value) }))" align="start">
        <Button variant="subtle" class="shrink-0" icon-right="lucide-chevron-down" :aria-label="`Show: ${presetOptions.find((o) => o.value === preset)?.label || 'All'}`">{{ presetOptions.find((o) => o.value === preset)?.label || 'All' }}</Button>
      </Dropdown>
      <Dropdown v-if="shown.length" :options="filterMenu">
        <Button variant="subtle" class="shrink-0" icon-left="lucide-list-filter" :aria-label="applied.length ? `Filter, ${applied.length} applied` : 'Filter'">
          Filter<span v-if="applied.length" class="ml-1 tabular-nums text-ink-gray-5">{{ applied.length }}</span>
        </Button>
      </Dropdown>
      <!-- What's applied, each removable -->
      <Button
        v-for="k in applied"
        :key="k"
        variant="outline"
        class="shrink-0"
        icon-right="lucide-x"
        :aria-label="`Remove ${FIELDS[k].label}: ${valueLabel(k)}`"
        @click="f[k] = ''"
      ><span class="text-ink-gray-5">{{ FIELDS[k].label }}:</span>&nbsp;{{ valueLabel(k) }}</Button>
    </div>

    <!-- Right: Group by, Sort, the page's own buttons, then the view switch -->
    <div class="flex shrink-0 items-center gap-2">
      <Dropdown v-if="groups.length" :options="groupMenu" :align="align">
        <Button variant="subtle" icon-right="lucide-chevron-down" :aria-label="`Group by ${groupLabel}. Change`"><span class="text-ink-gray-5">Group by</span>&nbsp;{{ groupLabel }}</Button>
      </Dropdown>

      <!-- Sort: one control in two parts, like the reference -->
      <div v-if="showSort" class="flex shrink-0">
        <Button variant="subtle" class="rounded-r-none" :icon="dir === 'asc' ? 'lucide-arrow-up-narrow-wide' : 'lucide-arrow-down-wide-narrow'" :aria-label="`Order: ${orderText}. Flip`" :tooltip="orderText" @click="flip" />
        <Dropdown :options="sortOptions" :align="align">
          <Button variant="subtle" class="rounded-l-none border-l border-outline-gray-2" icon-right="lucide-chevron-down" :label="SORTS[f.sort] || 'Sort'" :aria-label="`Sort by ${SORTS[f.sort]}. Change`" />
        </Dropdown>
      </div>

      <slot />
      <slot name="view" />
    </div>
  </div>
</template>
