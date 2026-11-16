<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { state } from '../lib/store'
import { design } from '../lib/look'

// Progress card (reference: segmented bar). Big number, a bar of thin ticks, then one line:
// the count in words on the left; what's holding things up and what moved this week on the right.
const props = defineProps<{ pid: string; stats: any }>()
const TICKS = 64
const filled = computed(() => Math.round((props.stats.pct / 100) * TICKS))
const thisWeek = computed(
  () =>
    state.tasks.filter(
      (t) => t.space === props.pid && !t.deletedAt && t.status === 'done' && t.doneAt && dayjs().diff(dayjs(t.doneAt), 'day') < 7,
    ).length,
)
const holding = computed(() => {
  const s = props.stats
  const parts = [
    s.review && `${s.review} under review`,
    s.overdue && `${s.overdue} overdue`,
    s.blocked && `${s.blocked} blocked`,
  ].filter(Boolean)
  return parts.join(' · ')
})
const colour = computed(() => design.color === 'color')
</script>

<template>
  <section class="rounded-5 border border-outline-gray-2 bg-surface-base" aria-label="Progress">
    <div class="space-y-3 p-4">
      <p class="flex items-baseline gap-1.5">
        <span class="text-3xl-semibold tabular-nums text-ink-gray-9">{{ stats.pct }}%</span>
        <span class="text-base text-ink-gray-6">done</span>
      </p>
      <!-- Segmented bar: thin ticks, filled up to the % -->
      <div
        class="flex h-4 gap-[2px]"
        role="progressbar"
        :aria-valuenow="stats.pct"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${stats.pct}% done`"
      >
        <span
          v-for="i in TICKS"
          :key="i"
          class="flex-1 rounded-[2px]"
          :class="i <= filled ? (colour ? 'bg-surface-amber-6' : 'bg-surface-gray-9') : 'bg-surface-gray-3'"
        />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 text-base">
        <span class="tabular-nums text-ink-gray-8">{{ stats.done }} of {{ stats.total }} tasks done</span>
        <span class="flex flex-wrap items-center gap-x-2 tabular-nums">
          <span v-if="holding" class="text-ink-gray-5">{{ holding }}</span>
          <span v-if="holding && thisWeek" class="text-ink-gray-4" aria-hidden="true">·</span>
          <span v-if="thisWeek" :class="colour ? 'text-ink-green-5' : 'text-ink-gray-7'">+{{ thisWeek }} this week</span>
        </span>
      </div>
    </div>
  </section>
</template>
