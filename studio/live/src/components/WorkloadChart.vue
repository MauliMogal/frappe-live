<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { BarChart } from 'frappe-ui/charts'
import { state, project, personName, taskPeople } from '../lib/store'
import { isOverdue } from '../lib/dates'
import { WORK_COLOR, STILL } from '../lib/charts'

// Workload by person (Frappe UI BarChart, horizontal and stacked): Done · Open · Overdue per person,
// plus "No one" for open tasks nobody has. Busy = 4 or more due within a week (named in the subtitle).
// openOnly: only open work (Open · Overdue), and anyone with 5+ open or 4+ due this week is named as "Too much".
const props = withDefaults(defineProps<{ pid: string; title?: string; openOnly?: boolean }>(), { title: 'By person', openOnly: false })
const rows = computed(() => {
  const p = project(props.pid)
  if (!p) return []
  const tasks = state.tasks.filter((t) => t.space === props.pid && !t.deletedAt)
  const row = (who: string | null) => {
    // Milestone teams share their tasks: a task counts for everyone on the team.
    const mine = tasks.filter((t) => (who === null ? !taskPeople(t).length : taskPeople(t).includes(who)))
    const overdue = mine.filter((t) => isOverdue(t)).length
    return {
      person: who ? (who === state.me ? 'You' : personName(who)) : 'No one',
      Done: mine.filter((t) => t.status === 'done').length,
      Open: mine.filter((t) => t.status !== 'done').length - overdue,
      Overdue: overdue,
      week: mine.filter((t) => t.status !== 'done' && t.due && dayjs(t.due).diff(dayjs().startOf('day'), 'day') <= 7).length,
    }
  }
  let out = p.members.map((m: any) => row(m.user))
  const nobody = row(null)
  if (nobody.Open + nobody.Overdue) out.push(nobody)
  // Open-only (big teams): most work first, and people with nothing open are left out.
  if (props.openOnly) out = out.filter((r: any) => r.Open + r.Overdue > 0).sort((a: any, b: any) => b.Open + b.Overdue - (a.Open + a.Overdue))
  return out
})
const busy = computed(() =>
  rows.value.filter((r) => r.person !== 'No one' && (r.week >= 4 || (props.openOnly && r.Open + r.Overdue >= 5))).map((r) => r.person),
)
const subtitle = computed(() => {
  if (props.openOnly) {
    const nobody = rows.value.find((r) => r.person === 'No one')
    const parts = [busy.value.length ? `Too much: ${busy.value.join(', ')}` : 'Everyone has room', nobody ? `${nobody.Open + nobody.Overdue} with no one on them` : '']
    return parts.filter(Boolean).join(' · ')
  }
  return busy.value.length ? `Busy this week: ${busy.value.join(', ')}` : 'Everyone has room this week'
})
const yKeys = computed(() => (props.openOnly ? ['Open', 'Overdue'] : ['Done', 'Open', 'Overdue']))
// Whole tasks only on the axis (no 0.5, 1.5 …)
const options = { ...STILL, xAxis: { minInterval: 1 } }
const series = { Done: { color: WORK_COLOR.Done }, Open: { color: WORK_COLOR.Open }, Overdue: { color: WORK_COLOR.Overdue } }
</script>

<template>
  <section class="rounded-5 border border-outline-gray-2 p-2" :aria-label="title">
    <!-- Same height as Planned vs actual (h-64) until there are many people -->
    <div :style="{ height: `${Math.max(256, 110 + rows.length * (openOnly ? 30 : 44))}px` }">
      <BarChart
        :title="title"
        :subtitle="subtitle"
        :data="rows"
        x="person"
        :y="yKeys"
        horizontal
        stacked
        :series-config="series"
        :echart-options="options"
      />
    </div>
  </section>
</template>
