<script setup lang="ts">
import { computed } from 'vue'

// A look-alike of Frappe UI's PercentageBarChart (not in this runtime yet): one bar split into each part's share
// of the total, small gaps between parts, a legend underneath (dot · name · share). Hovering a part shows its
// value, name and share. Unlike the real one, parts keep the order given (so "Done" always starts on the left).
// Swap for <PercentageBarChart :data category value> once frappe-ui ships it.
const props = defineProps<{ data: { label: string; value: number; color: string }[]; format?: (v: number) => string }>()
const total = computed(() => props.data.reduce((n, d) => n + Math.max(0, d.value), 0))
// Whole-number shares that add up to 100 (largest remainder)
const shares = computed(() => {
  if (!total.value) return props.data.map(() => 0)
  const raw = props.data.map((d) => (Math.max(0, d.value) / total.value) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ i }) => left-- > 0 && out[i]++)
  return out
})
const fmt = (v: number) => (props.format ? props.format(v) : String(v))
</script>

<template>
  <div>
    <div class="flex h-2.5 w-full gap-0.5" role="img" :aria-label="data.map((d, i) => `${d.label} ${shares[i]}%`).join(', ')">
      <template v-for="(d, i) in data" :key="d.label">
        <span v-if="shares[i]" class="h-full rounded-full" :style="{ width: `${shares[i]}%`, background: d.color }" :title="`${d.label}: ${fmt(d.value)} (${shares[i]}%)`" />
      </template>
      <span v-if="!total" class="h-full w-full rounded-full bg-surface-gray-2" />
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span v-for="(d, i) in data" :key="d.label" class="inline-flex items-center gap-1.5 text-ink-gray-7">
        <span class="size-2 rounded-full" :style="{ background: d.color }" aria-hidden="true" />{{ d.label }}
        <span class="tabular-nums text-ink-gray-5">{{ shares[i] }}%</span>
      </span>
    </div>
  </div>
</template>
