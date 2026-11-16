<script setup lang="ts">
import { computed } from 'vue'
import { DonutChart } from 'frappe-ui/charts'
import { state } from '../lib/store'
import { STATUS, STATUS_ORDER } from '../lib/meta'
import { STATUS_COLOR, STILL } from '../lib/charts'

// Tasks by status (Frappe UI DonutChart), each status in its own colour. The donut orders slices by size,
// so rows are sorted here and the palette follows the same order.
const props = withDefaults(defineProps<{ pid: string; title?: string }>(), { title: 'Tasks by status' })
const rows = computed(() => {
  const tasks = state.tasks.filter((t) => t.space === props.pid && !t.deletedAt)
  return STATUS_ORDER.map((s) => ({ key: s, status: STATUS[s].label, tasks: tasks.filter((t) => t.status === s).length }))
    .filter((r) => r.tasks > 0)
    .sort((a, b) => b.tasks - a.tasks)
})
const palette = computed(() => rows.value.map((r) => STATUS_COLOR[r.key]))
const done = computed(() => {
  const total = rows.value.reduce((n, r) => n + r.tasks, 0)
  const d = rows.value.find((r) => r.key === 'done')?.tasks || 0
  return total ? `${Math.round((d / total) * 100)}% done` : 'No tasks'
})
</script>

<template>
  <section class="rounded-5 border border-outline-gray-2 p-2" :aria-label="title">
    <div class="h-64">
      <DonutChart :title="title" :data="rows" category="status" value="tasks" :center-label="done" :palette="palette" :echart-options="STILL" />
    </div>
  </section>
</template>
