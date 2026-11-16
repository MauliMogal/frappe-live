<script setup lang="ts">
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, Tooltip } from 'frappe-ui'
import { state, project, milestonesOf, milestoneStats, milestoneStatus, personName } from '../lib/store'
import { can } from '../lib/permissions'
import EmptyState from './EmptyState.vue'
import { isOverdue } from '../lib/dates'
import StatusIcon from './StatusIcon.vue'
import MilestoneStatusBadge from './MilestoneStatusBadge.vue'
import { ROADMAP } from '../lib/charts'

// Timeline as a milestone roadmap (Variants → "Timeline": roadmap). One bar per milestone, from the
// end of the one before it (or the project start) to its due date, filled as its tasks get done.
// A slipped milestone shows its first date as a faded mark ("was 10 Oct"). Open a milestone to see
// its tasks underneath. A line marks today.
const props = withDefaults(defineProps<{ pid: string; tasks: any[]; scale?: string }>(), { scale: 'weeks' })
const route = useRoute()
const router = useRouter()
const openTask = (id: string) => router.push({ query: { ...route.query, task: id } })
const expanded = ref<Record<string, boolean>>({})

const p = computed(() => project(props.pid))
const ms = computed(() => [...milestonesOf(props.pid)].filter((m: any) => m.due).sort((a: any, b: any) => a.due.localeCompare(b.due)))
const first = computed(() => {
  const created = props.tasks.map((t) => dayjs(t.start || t.createdAt))
  const cands = [p.value?.start ? dayjs(p.value.start) : null, ...created, dayjs()].filter(Boolean) as any[]
  return cands.reduce((a, b) => (b.isBefore(a) ? b : a))
})
const range = computed(() => {
  const months = props.scale === 'months'
  const lasts = [...ms.value.map((m: any) => dayjs(m.due)), ...ms.value.flatMap((m: any) => (m.slips || []).map((s: any) => dayjs(s.from))), dayjs()]
  const last = lasts.reduce((a, b) => (b.isAfter(a) ? b : a))
  const start = months ? first.value.startOf('month') : first.value.startOf('week')
  const end = months ? last.add(1, 'month').endOf('month') : last.add(7, 'day').endOf('week')
  return { start, end, days: end.diff(start, 'day') + 1 }
})
const x = (d: any) => Math.max(0, Math.min(100, (dayjs(d).startOf('day').diff(range.value.start, 'day') / range.value.days) * 100))
const ticks = computed(() => {
  const out = []
  const months = props.scale === 'months'
  let d = range.value.start
  while (d.isBefore(range.value.end)) {
    out.push({ left: x(d), label: d.format(months ? 'MMM YYYY' : 'D MMM') })
    d = d.add(1, months ? 'month' : 'week')
  }
  return out
})
const today = computed(() => x(dayjs()))

const rows = computed(() =>
  ms.value.map((m: any, i: number) => {
    const start = i === 0 ? first.value : dayjs(ms.value[i - 1].due)
    const s = milestoneStats(props.pid, m.id)
    const was = m.slips?.length ? m.slips[0].from : null
    const left = x(start)
    const right = x(dayjs(m.due).add(1, 'day'))
    return {
      m,
      s,
      left: `${left}%`,
      width: `${Math.max(2, right - left)}%`,
      was,
      wasLeft: was ? `${x(dayjs(was).add(12, 'hour'))}%` : null,
      tasks: props.tasks.filter((t) => t.milestone === m.id),
      late: dayjs(m.due).isBefore(dayjs(), 'day') && s.done < s.total,
      // Bar colour = the milestone's status (same words as its badge): blue on track, amber at risk, red late,
      // green completed, grey not started. See lib/charts MEANING.
      fill: ({ reached: ROADMAP.done, late: ROADMAP.late, risk: ROADMAP.risk, on: ROADMAP.on, notstarted: ROADMAP.notstarted } as Record<string, string>)[milestoneStatus(props.pid, m)] || ROADMAP.notstarted,
    }
  }),
)
const loose = computed(() => props.tasks.filter((t) => !t.milestone || !ms.value.some((m: any) => m.id === t.milestone)))

// Task bars inside an open milestone (only tasks with a date; the rest are listed as "no date")
function taskBar(t: any) {
  const s = dayjs(t.start || t.createdAt)
  const from = s.isBefore(dayjs(t.due)) ? s : dayjs(t.due).subtract(1, 'day')
  const left = x(from)
  return { left: `${left}%`, width: `${Math.max(1.5, x(dayjs(t.due).add(1, 'day')) - left)}%` }
}
</script>

<template>
  <!-- No milestone has a date yet: say so plainly (no empty ruler) -->
  <div v-if="!rows.length" class="rounded-5 border border-outline-gray-2">
    <EmptyState icon="lucide-chart-gantt" :title="ms.length || milestonesOf(pid).length ? 'No milestones with a date yet' : 'No milestones yet'" text="Each milestone becomes a bar here, from start to its due date, filled as its tasks get done.">
      <Button v-if="can.addMilestone(pid) && project(pid)?.status !== 'archived'" variant="subtle" icon-left="lucide-flag-triangle-right" label="Add a milestone" @click="state.ui.milestone = { pid }" />
    </EmptyState>
  </div>
  <div v-else class="rounded-5 border border-outline-gray-2">
    <div class="overflow-x-auto">
      <div class="min-w-[48rem]">
        <!-- Ruler -->
        <div class="grid grid-cols-[17rem_1fr] border-b border-outline-gray-1">
          <div class="px-3 py-2 text-sm text-ink-gray-5">Milestone</div>
          <div class="relative h-9">
            <span v-for="w in ticks" :key="w.label" class="absolute top-0 h-full border-l border-outline-gray-1 pl-1.5 pt-2 text-xs tabular-nums text-ink-gray-5" :style="{ left: `${w.left}%` }">{{ w.label }}</span>
          </div>
        </div>

        <div class="relative">
          <!-- Today -->
          <div class="pointer-events-none absolute inset-y-0 left-[17rem] right-0 z-10" aria-hidden="true">
            <span class="absolute inset-y-0 w-px bg-surface-gray-9" :style="{ left: `${today}%` }" />
            <span class="absolute -top-0 -translate-x-1/2 rounded-1 bg-surface-gray-9 px-1 text-2xs text-ink-gray-1" :style="{ left: `${today}%` }">Today</span>
          </div>


          <template v-for="r in rows" :key="r.m.id">
            <!-- Milestone: name · done/total · left · status, and its bar -->
            <div class="grid cursor-pointer grid-cols-[17rem_1fr] border-b border-outline-gray-1 hover:bg-surface-gray-1" @click="expanded[r.m.id] = !expanded[r.m.id]">
              <div class="flex min-w-0 items-center gap-2 px-3 py-2.5">
                <span :class="expanded[r.m.id] ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-base-medium text-ink-gray-9">{{ r.m.name }}</p>
                  <p class="truncate text-xs tabular-nums text-ink-gray-5">
                    {{ r.s.done }}/{{ r.s.total }} done<template v-if="r.s.total - r.s.done"> · {{ r.s.total - r.s.done }} left</template> · {{ dayjs(r.m.due).format('D MMM') }}
                  </p>
                </div>
                <MilestoneStatusBadge :pid="pid" :m="r.m" />
              </div>
              <div class="relative h-14">
                <!-- Slipped: the first date, faded -->
                <Tooltip v-if="r.was" :text="`First due ${dayjs(r.was).format('D MMM')} · moved ${r.m.slips.length}×`">
                  <span class="absolute top-1/2 h-5 -translate-x-1/2 -translate-y-1/2 border-l-2 border-dashed border-outline-gray-4" :style="{ left: r.wasLeft }" />
                </Tooltip>
                <span v-if="r.was" class="absolute top-1 -translate-x-1/2 text-2xs text-ink-gray-4" :style="{ left: r.wasLeft }">was {{ dayjs(r.was).format('D MMM') }}</span>
                <!-- The bar, filled by % done -->
                <!-- Track: a soft tint of the same colour; fill: the colour itself -->
                <span class="absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-full" :style="{ left: r.left, width: r.width, background: `${r.fill}26` }">
                  <span class="block h-full rounded-full" :style="{ width: `${r.s.pct}%`, background: r.fill }" />
                </span>
                <span class="absolute top-1/2 ml-1.5 -translate-y-1/2 text-xs tabular-nums text-ink-gray-6" :style="{ left: `calc(${r.left} + ${r.width})` }">{{ r.s.pct }}%</span>
              </div>
            </div>

            <!-- Its tasks -->
            <template v-if="expanded[r.m.id]">
              <div v-for="t in r.tasks" :key="t.id" class="grid cursor-pointer grid-cols-[17rem_1fr] border-b border-outline-gray-1 bg-surface-gray-1 hover:bg-surface-gray-2" @click="openTask(t.id)">
                <div class="flex min-w-0 items-center gap-2 py-2 pl-9 pr-3">
                  <StatusIcon :status="t.status" />
                  <span class="truncate text-sm" :class="t.status === 'done' ? 'text-ink-gray-5' : 'text-ink-gray-8'">{{ t.title }}</span>
                </div>
                <div class="relative h-9">
                  <span v-if="t.due" class="absolute top-1/2 flex h-4 -translate-y-1/2 items-center overflow-hidden rounded-full px-0.5" :style="{ ...taskBar(t), background: t.status === 'done' ? ROADMAP.taskDone : isOverdue(t) ? ROADMAP.taskLate : ROADMAP.task }">
                    <Avatar v-if="t.assignee" size="xs" :label="personName(t.assignee)" class="scale-75" />
                  </span>
                  <span v-else class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-gray-4">No due date · uses the milestone's</span>
                </div>
              </div>
              <p v-if="!r.tasks.length" class="border-b border-outline-gray-1 bg-surface-gray-1 py-2 pl-9 text-p-sm text-ink-gray-5">No tasks in this milestone yet.</p>
            </template>
          </template>
        </div>
      </div>
    </div>
    <p v-if="loose.length" class="border-t border-outline-gray-1 px-3 py-2 text-p-sm text-ink-gray-5">
      {{ loose.length }} {{ loose.length === 1 ? 'task has' : 'tasks have' }} no milestone, so {{ loose.length === 1 ? "it isn't" : "they aren't" }} on the roadmap.
    </p>
  </div>
</template>
