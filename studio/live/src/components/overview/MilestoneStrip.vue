<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Progress } from 'frappe-ui'
import { projectSummary } from '../../lib/overviewData'
import { MILESTONE_STATUS } from '../../lib/meta'
import { design } from '../../lib/look'
import StatusMark from '../StatusMark.vue'
import { Variants } from '../../lib/variants'
import DesignChoice from '../DesignChoice.vue'

// Milestone path (Overview layout "Path"): every milestone in date order. Click one: its tasks.
// Every milestone looks the same (no special "next" card). Variants → "Milestone strip":
//   cards — equal cards in a row (status · date, name, Frappe UI Progress, tasks left), scrolls sideways when long
//   steps — a stepper: one line with a dot per milestone, its name, date and % under it
//   rows  — a compact list: dot, name, progress bar, tasks left, date
const props = defineProps<{ pid: string }>()
const emit = defineEmits<{ (e: 'view-tasks', f: string): void }>()
const x = computed(() => projectSummary(props.pid))
const due = (d: string | null) => (d ? dayjs(d).format('D MMM') : 'No date')
const leftText = (r: any) => (r.status === 'reached' ? 'All done' : `${r.left} of ${r.stats.total} left`)
const open = (r: any) => emit('view-tasks', `ms:${r.m.id}`)
const label = (r: any) => `${r.m.name}: ${MILESTONE_STATUS[r.status]?.label}, due ${due(r.m.due)}. Show its tasks`
</script>

<template>
  <section v-if="x.milestones.length" class="rounded-6 bg-surface-base p-5 ring-1 ring-outline-gray-2" aria-label="Milestones">
    <Variants name="Milestone strip">
      <template #cards><DesignChoice k="msStrip" v="cards" /></template>
      <template #steps><DesignChoice k="msStrip" v="steps" /></template>
      <template #rows><DesignChoice k="msStrip" v="rows" /></template>
    </Variants>
    <div class="flex items-baseline gap-2">
      <h2 class="text-base-semibold text-ink-gray-9">Milestones</h2>
      <span class="text-sm tabular-nums text-ink-gray-5">{{ x.reached }} of {{ x.milestones.length }} reached</span>
    </div>

    <!-- Steps: a line through one dot per milestone -->
    <ol v-if="design.msStrip === 'steps'" class="mt-5 flex overflow-x-auto pb-1">
      <li v-for="(r, i) in x.milestones" :key="r.m.id" class="relative min-w-40 flex-1">
        <!-- the line to the next step -->
        <span v-if="i < x.milestones.length - 1" class="absolute left-2 right-0 top-[5px] h-px bg-outline-gray-2" aria-hidden="true" />
        <button type="button" class="relative flex w-full flex-col items-start gap-1 rounded-4 pr-4 text-left hover:opacity-80" :aria-label="label(r)" @click="open(r)">
          <span class="flex size-3 items-center justify-center rounded-full bg-surface-base ring-2 ring-surface-base"><StatusMark :dot="MILESTONE_STATUS[r.status]?.dot" /></span>
          <span class="mt-2 w-full truncate text-base-medium text-ink-gray-9">{{ r.m.name }}</span>
          <span class="text-xs tabular-nums text-ink-gray-5">{{ due(r.m.due) }} · {{ r.stats.pct }}%</span>
          <span class="text-xs text-ink-gray-6">{{ MILESTONE_STATUS[r.status]?.label }}</span>
        </button>
      </li>
    </ol>

    <!-- Rows: a compact list -->
    <ul v-else-if="design.msStrip === 'rows'" class="mt-3 divide-y divide-outline-gray-1">
      <li v-for="r in x.milestones" :key="r.m.id">
        <button type="button" class="flex w-full items-center gap-3 rounded-4 px-1 py-2.5 text-left hover:bg-surface-gray-1" :aria-label="label(r)" @click="open(r)">
          <StatusMark :dot="MILESTONE_STATUS[r.status]?.dot" />
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-9">{{ r.m.name }}</span>
          <span class="hidden w-32 sm:block"><Progress size="sm" :value="r.stats.pct" /></span>
          <span class="w-24 text-right text-xs tabular-nums text-ink-gray-5">{{ leftText(r) }}</span>
          <span class="w-14 text-right text-sm tabular-nums text-ink-gray-7">{{ due(r.m.due) }}</span>
        </button>
      </li>
    </ul>

    <!-- Cards (default): equal cards, same style for every milestone -->
    <ol v-else class="mt-4 flex gap-3 overflow-x-auto pb-1">
      <li v-for="r in x.milestones" :key="r.m.id" class="w-56 shrink-0">
        <button
          type="button"
          class="flex h-full w-full flex-col gap-3 rounded-5 bg-surface-gray-1 p-4 text-left hover:bg-surface-gray-2"
          :aria-label="label(r)"
          @click="open(r)"
        >
          <span class="flex items-center gap-1.5 text-xs text-ink-gray-6">
            <StatusMark :dot="MILESTONE_STATUS[r.status]?.dot" />{{ MILESTONE_STATUS[r.status]?.label }}
            <span class="ml-auto tabular-nums">{{ due(r.m.due) }}</span>
          </span>
          <span class="line-clamp-2 min-h-10 text-base-medium text-ink-gray-9">{{ r.m.name }}</span>
          <span class="mt-auto space-y-1.5">
            <Progress size="sm" :value="r.stats.pct" />
            <span class="block text-xs tabular-nums text-ink-gray-5">{{ leftText(r) }}</span>
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>
